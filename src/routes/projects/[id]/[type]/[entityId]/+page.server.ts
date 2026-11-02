import { ConflictError } from '$lib/server/storage';
import { fail, redirect } from '@sveltejs/kit';
import {
  getEntity,
  updateEntity,
  searchEntities,
  duplicateEntity,
  createEntity
} from '$lib/server/entities';
import { routeToEntityType } from '$lib/utils/entityTypes';
import { addBookmark, removeBookmark, isBookmarked } from '$lib/server/bookmarks';
import { noteToScene } from '$lib/server/conversion';
import { listStories, listChapters } from '$lib/server/stories';
import { getCustomFieldDefs } from '$lib/server/customFields';
import { getBacklinks } from '$lib/server/backlinks';
import { loadRelations, addRelation, deleteRelation } from '$lib/server/relations';
import { isRelationType } from '$lib/relationTypes';
import { softDeleteEntity, restoreEntity } from '$lib/server/trash';
import {
  getImagesForEntity,
  listProjectImages,
  linkEntityToImage,
  unlinkEntityFromImage
} from '$lib/server/images';
import { mergeFields, ENTITY_FIELDS, ENTITY_LABELS } from '$lib/entityFields';
import type { EntityType } from '$lib/types';
import { getProjectAccess } from '$lib/server/members';
import { isSafePathSegment } from '$lib/utils';
import { applyPromptAnswer, getPrompt } from '$lib/brainstorm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const entityType = routeToEntityType(params.type);
  if (!entityType) throw redirect(302, `/projects/${params.id}`);

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const entity = getEntity(params.id, project.dataPath, entityType, params.entityId);
  if (!entity) throw redirect(302, `/projects/${params.id}/${params.type}`);

  const bookmarked = isBookmarked(locals.user.id, params.id, params.entityId);

  const stories = entityType === 'note' ? listStories(project.dataPath) : [];
  const storiesWithChapters = stories.map((s) => ({
    ...s,
    chapters: listChapters(project.dataPath, s.id)
  }));

  const customFieldDefs = getCustomFieldDefs(params.id, entityType).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.fieldType,
    entityType: f.refEntityType || undefined,
    placeholder: f.placeholder || undefined,
    required: f.required
  }));

  const mergedFields = mergeFields(ENTITY_FIELDS[entityType], customFieldDefs);
  const entityImages = getImagesForEntity(params.id, params.entityId);
  const projectImages = listProjectImages(params.id, project.dataPath);

  const backlinks = getBacklinks(params.id, project.dataPath, entity);

  const allEntities = searchEntities(params.id, '').map((e) => ({
    id: e.id,
    type: e.type,
    name: e.name,
    status: e.status
  }));

  // Relations are stored once, from source to target. The entity page shows both
  // directions, flagging the ones where this entity is the target.
  const entityNames = new Map(allEntities.map((e) => [e.id, e]));
  const relations = loadRelations(project.dataPath)
    .filter((r) => r.sourceId === params.entityId || r.targetId === params.entityId)
    .map((r) => {
      const outgoing = r.sourceId === params.entityId;
      const other = entityNames.get(outgoing ? r.targetId : r.sourceId);
      return {
        id: r.id,
        outgoing,
        relationType: r.relationType,
        label: r.label,
        otherId: other?.id || (outgoing ? r.targetId : r.sourceId),
        otherName: other?.name || 'Unknown entity',
        otherType: other?.type || null
      };
    });

  return {
    entity,
    projectName: project.name,
    entityType,
    bookmarked,
    stories: storiesWithChapters,
    customFields: mergedFields,
    backlinks,
    relations,
    entityImages,
    projectImages,
    entities: allEntities,
    role,
    currentUserId: locals.user.id,
    projectOwnerId: project.userId
  };
};

export const actions = {
  update: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const customFieldDefs = getCustomFieldDefs(params.id, entityType);
    const tagFields = new Set<string>(['tags']);
    for (const f of ENTITY_FIELDS[entityType]) {
      if (f.type === 'tags') tagFields.add(f.key);
    }
    for (const f of customFieldDefs) {
      if (f.fieldType === 'tags') tagFields.add(f.key);
    }

    const boolFields = new Set<string>();
    for (const f of ENTITY_FIELDS[entityType]) {
      if (f.type === 'boolean') boolFields.add(f.key);
    }
    for (const f of customFieldDefs) {
      if (f.fieldType === 'boolean') boolFields.add(f.key);
    }

    const form = await request.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (key === 'revision' || key === 'overwrite') continue;
      if (boolFields.has(key)) {
        data[key] = value === 'true' || value === 'on';
      } else if (tagFields.has(key)) {
        data[key] = (value as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        data[key] = value;
      }
    }
    try {
      const updated = updateEntity(
        params.id,
        project.dataPath,
        entityType,
        params.entityId,
        data,
        form.get('overwrite') === 'true' ? undefined : String(form.get('revision') ?? '')
      );
      if (!updated) return fail(404, { error: 'Entity not found' });
      return { success: true, revision: updated.revision };
    } catch (cause) {
      if (cause instanceof ConflictError) return fail(409, { error: cause.message });
      throw cause;
    }
  },

  answerPrompt: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const prompt = getPrompt(entityType, (form.get('promptId') as string) || '');
    if (!prompt) return fail(400, { error: 'Unknown prompt' });
    const answer = ((form.get('answer') as string) || '').trim();
    if (!answer) return fail(400, { error: 'Answer is empty' });

    const entity = getEntity(params.id, project.dataPath, entityType, params.entityId);
    if (!entity) return fail(404, { error: 'Entity not found' });

    const data = applyPromptAnswer(entityType, entity, prompt, answer);
    updateEntity(params.id, project.dataPath, entityType, params.entityId, data);
    return { success: true };
  },

  addRelation: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    let targetId = (form.get('targetId') as string) || '';
    const newName = ((form.get('newName') as string) || '').trim();
    const newType = form.get('newType') as string;
    const relationType = form.get('relationType') as string;

    if (!targetId && !newName) return fail(400, { error: 'Pick an entity to relate to' });
    if (targetId === params.entityId)
      return fail(400, { error: 'An entity cannot relate to itself' });
    if (!isRelationType(relationType)) return fail(400, { error: 'Unknown relation type' });
    if (!targetId && !Object.keys(ENTITY_LABELS).includes(newType))
      return fail(400, { error: 'Unknown type' });

    if (!targetId) {
      targetId = createEntity(params.id, project.dataPath, newType as EntityType, {
        name: newName
      }).id;
    }

    addRelation(project.dataPath, {
      sourceId: params.entityId,
      targetId,
      relationType,
      label: ((form.get('label') as string) || '').trim() || null
    });

    return { success: true };
  },

  deleteRelation: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const relationId = form.get('relationId') as string;
    if (!relationId) return fail(400, { error: 'Relation ID required' });

    deleteRelation(project.dataPath, relationId);
    return { success: true };
  },

  duplicate: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const copy = duplicateEntity(params.id, project.dataPath, entityType, params.entityId);
    if (!copy) return fail(500, { error: 'Duplicate failed' });

    throw redirect(303, `/projects/${params.id}/${params.type}/${copy.id}`);
  },

  delete: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;
    const trashItem = softDeleteEntity(params.id, project.dataPath, entityType, params.entityId);
    if (!trashItem) return fail(500, { error: 'Failed to delete entity' });
    return { success: true, trashItem };
  },

  convertToScene: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (entityType !== 'note') return fail(400, { error: 'Only notes can be converted' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const storyId = form.get('storyId') as string;
    const chapterId = (form.get('chapterId') as string) || null;
    const newChapterTitle = form.get('newChapterTitle') as string;

    if (!isSafePathSegment(storyId)) return fail(400, { error: 'Invalid story ID' });
    if (chapterId !== null && !isSafePathSegment(chapterId)) {
      return fail(400, { error: 'Invalid chapter ID' });
    }

    const scene = noteToScene(
      params.id,
      project.dataPath,
      params.entityId,
      storyId,
      chapterId,
      newChapterTitle
    );
    if (!scene) return fail(500, { error: 'Conversion failed' });
    return { success: true, sceneId: scene.id };
  },

  toggleBookmark: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    if (!getProjectAccess(params.id, locals.user.id))
      return fail(404, { error: 'Project not found' });
    if (isBookmarked(locals.user.id, params.id, params.entityId)) {
      removeBookmark(locals.user.id, params.id, params.entityId);
    } else {
      addBookmark(locals.user.id, params.id, params.entityId);
    }
    return { success: true };
  },

  restore: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;
    const form = await request.formData();
    const trashId = form.get('trashId') as string;
    if (!trashId) return fail(400, { error: 'Trash ID required' });
    const ok = restoreEntity(params.id, project.dataPath, trashId);
    if (!ok) return fail(500, { error: 'Restore failed' });
    return { success: true };
  },

  linkImage: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const form = await request.formData();
    const imageId = form.get('imageId') as string;
    if (!imageId) return fail(400, { error: 'Image ID required' });
    linkEntityToImage(params.id, imageId, params.entityId);
    return { success: true };
  },

  unlinkImage: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const form = await request.formData();
    const imageId = form.get('imageId') as string;
    if (!imageId) return fail(400, { error: 'Image ID required' });
    unlinkEntityFromImage(params.id, imageId, params.entityId);
    return { success: true };
  }
};
