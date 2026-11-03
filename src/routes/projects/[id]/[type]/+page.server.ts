import { ConflictError, expectedRevision } from '$lib/server/storage';
import { fail, redirect } from '@sveltejs/kit';
import { listEntities, createEntity, updateEntity } from '$lib/server/entities';
import { softDeleteEntity, restoreEntity } from '$lib/server/trash';
import { routeToEntityType } from '$lib/utils/entityTypes';
import { getNoteTemplates } from '$lib/server/templates';
import { getCustomFieldDefs } from '$lib/server/customFields';
import { mergeFields, ENTITY_FIELDS } from '$lib/entityFields';
import { getProjectAccess } from '$lib/server/members';
import { parseQuickAdd } from '$lib/utils/quickAdd';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');

  const entityType = routeToEntityType(params.type);
  if (!entityType) throw redirect(302, `/projects/${params.id}`);

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const query = url.searchParams.get('q') || '';
  const status = url.searchParams.get('status') || '';

  // Read from disk even when searching: index rows have no body, custom fields, or file
  // revision, and without a revision every inline edit would be reported as a conflict.
  let entityList = listEntities(params.id, project.dataPath, entityType);
  if (query) {
    const needle = query.toLowerCase();
    entityList = entityList.filter((e) => e.name.toLowerCase().includes(needle));
  }

  if (status) {
    entityList = entityList.filter((e) => e.status === status);
  }

  const customFieldDefs = getCustomFieldDefs(params.id, entityType).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.fieldType,
    entityType: f.refEntityType || undefined,
    placeholder: f.placeholder || undefined,
    required: f.required
  }));

  const mergedFields = mergeFields(ENTITY_FIELDS[entityType], customFieldDefs);

  // Options for inline entityRef combobox editing in the grid, keyed by referenced entity type.
  const refEntities: Record<string, { id: string; name: string }[]> = {};
  for (const f of mergedFields) {
    if (f.type !== 'entityRef' || !f.entityType || refEntities[f.entityType]) continue;
    refEntities[f.entityType] = listEntities(params.id, project.dataPath, f.entityType).map(
      (e) => ({
        id: e.id,
        name: e.name
      })
    );
  }

  return {
    entities: entityList,
    refEntities,
    entityType,
    projectName: project.name,
    query,
    status,
    templates: entityType === 'note' ? getNoteTemplates() : [],
    customFields: mergedFields,
    role
  };
};

export const actions = {
  create: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const name = form.get('name') as string;
    if (!name) return fail(400, { error: 'Name is required' });

    const body = entityType === 'note' ? (form.get('body') as string) || '' : undefined;

    const customFieldDefs = getCustomFieldDefs(params.id, entityType).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.fieldType,
      entityType: f.refEntityType || undefined
    }));
    const fieldValues: Record<string, unknown> = {};
    for (const field of mergeFields(ENTITY_FIELDS[entityType], customFieldDefs)) {
      if (field.type === 'image') continue;
      const raw = form.get(field.key);
      if (field.type === 'boolean') {
        if (raw !== null) fieldValues[field.key] = true;
        continue;
      }
      if (typeof raw !== 'string' || !raw.trim()) continue;
      if (field.type === 'tags') {
        fieldValues[field.key] = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (field.type === 'number') {
        const num = Number(raw);
        if (Number.isNaN(num)) return fail(400, { error: `Invalid number for ${field.label}` });
        fieldValues[field.key] = num;
      } else {
        fieldValues[field.key] = raw;
      }
    }

    const created = createEntity(params.id, project.dataPath, entityType, {
      ...fieldValues,
      name,
      body: body || undefined
    });

    return { success: true, entityId: created.id };
  },

  quickCreate: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const allowTraits = ENTITY_FIELDS[entityType].some(
      (f) => f.key === 'traits' && f.type === 'tags'
    );
    const { name, traits } = parseQuickAdd((form.get('name') as string) || '', allowTraits);
    if (!name) return fail(400, { error: 'Name is required' });

    const created = createEntity(params.id, project.dataPath, entityType, {
      name,
      ...(traits.length > 0 ? { traits } : {})
    });

    return { success: true, entityId: created.id, name: created.name };
  },

  quickUpdate: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const entityId = form.get('entityId') as string;
    const field = form.get('field') as string;
    const value = form.get('value') as string;

    if (!entityId || !field) return fail(400, { error: 'entityId and field are required' });

    const customFieldDefs = getCustomFieldDefs(params.id, entityType).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.fieldType,
      entityType: f.refEntityType || undefined
    }));
    const mergedFields = mergeFields(ENTITY_FIELDS[entityType], customFieldDefs);

    // Core fields plus every merged field def. Images have their own link/unlink actions.
    const fieldDef = mergedFields.find((f) => f.key === field);
    const isCoreField = field === 'name' || field === 'status' || field === 'tags';
    if (!isCoreField && (!fieldDef || fieldDef.type === 'image')) {
      return fail(400, { error: 'Field not allowed for quick update' });
    }

    if (field === 'status' && !['draft', 'wip', 'complete'].includes(value)) {
      return fail(400, { error: 'Invalid status' });
    }
    if (field === 'name' && !value.trim()) return fail(400, { error: 'Name cannot be empty' });

    const fieldType = field === 'tags' ? 'tags' : fieldDef?.type;
    let parsed: unknown = value;
    if (fieldType === 'tags') {
      parsed = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (fieldType === 'boolean') {
      parsed = value === 'true';
    } else if (fieldType === 'number') {
      parsed = value === '' ? '' : Number(value);
      if (typeof parsed === 'number' && Number.isNaN(parsed)) {
        return fail(400, { error: 'Invalid number' });
      }
    }

    try {
      const updated = updateEntity(
        params.id,
        project.dataPath,
        entityType,
        entityId,
        { [field]: parsed },
        expectedRevision(form)
      );
      if (!updated) return fail(404, { error: 'Entity not found' });
      return { success: true, revision: updated.revision };
    } catch (cause) {
      if (cause instanceof ConflictError) return fail(409, { error: cause.message });
      throw cause;
    }
  },

  delete: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const entityType = routeToEntityType(params.type);
    if (!entityType) return fail(400, { error: 'Invalid entity type' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const entityId = form.get('entityId') as string;
    if (!entityId) return fail(400, { error: 'Entity ID required' });

    const trashItem = softDeleteEntity(params.id, project.dataPath, entityType, entityId);

    return { success: true, trashItem };
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
  }
};
