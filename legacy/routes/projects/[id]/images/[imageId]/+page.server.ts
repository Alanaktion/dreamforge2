import { fail, redirect } from '@sveltejs/kit';
import {
  getProjectImage,
  updateImage,
  deleteImage,
  linkEntityToImage,
  unlinkEntityFromImage
} from '$lib/server/images';
import { listEntities } from '$lib/server/entities';
import { getProjectAccess } from '$lib/server/members';
import type { EntityType } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const image = getProjectImage(params.id, project.dataPath, params.imageId);
  if (!image) throw redirect(302, `/projects/${params.id}/images`);

  const allEntityTypes: EntityType[] = [
    'character',
    'organization',
    'location',
    'culture',
    'species',
    'item',
    'note'
  ];

  const allEntities = allEntityTypes.flatMap((type) =>
    listEntities(params.id, project.dataPath, type).map((e) => ({
      id: e.id,
      name: e.name,
      type
    }))
  );

  const linkedIds = new Set(image.linkedEntities.map((e) => e.id));

  return {
    project: { ...project, pinned: Boolean(project.pinned) },
    image,
    allEntities,
    linkedIds: Array.from(linkedIds),
    role
  };
};

export const actions = {
  update: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });

    const form = await request.formData();
    const caption = (form.get('caption') as string) || null;
    const altText = (form.get('altText') as string) || null;

    updateImage(params.id, params.imageId, { caption, altText });

    return { success: true };
  },

  delete: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    deleteImage(params.id, project.dataPath, params.imageId);

    throw redirect(302, `/projects/${params.id}/images`);
  },

  linkEntity: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });

    const form = await request.formData();
    const entityId = form.get('entityId') as string;
    if (!entityId) return fail(400, { error: 'Entity ID required' });

    linkEntityToImage(params.id, params.imageId, entityId);

    return { success: true };
  },

  unlinkEntity: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });

    const form = await request.formData();
    const entityId = form.get('entityId') as string;
    if (!entityId) return fail(400, { error: 'Entity ID required' });

    unlinkEntityFromImage(params.id, params.imageId, entityId);

    return { success: true };
  }
};
