import { fail, redirect } from '@sveltejs/kit';
import { listTrashItems, restoreEntity, permanentDeleteEntity } from '$lib/server/trash';
import { getProjectAccess } from '$lib/server/members';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const items = listTrashItems(params.id, project.dataPath);

  return {
    project: { ...project, pinned: Boolean(project.pinned) },
    items,
    role
  };
};

export const actions = {
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

  permanentDelete: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const trashId = form.get('trashId') as string;
    if (!trashId) return fail(400, { error: 'Trash ID required' });

    permanentDeleteEntity(params.id, project.dataPath, trashId);

    return { success: true };
  },

  emptyTrash: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const items = listTrashItems(params.id, project.dataPath);
    for (const item of items) {
      permanentDeleteEntity(params.id, project.dataPath, item.id);
    }

    return { success: true };
  }
};
