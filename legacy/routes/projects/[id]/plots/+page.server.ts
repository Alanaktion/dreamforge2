import { fail, redirect } from '@sveltejs/kit';
import { listPlotlines, createPlotline, deletePlotline } from '$lib/server/plots';
import { listStories } from '$lib/server/stories';
import { getProjectAccess } from '$lib/server/members';
import { isSafePathSegment } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const plotlines = listPlotlines(project.dataPath);
  const stories = listStories(project.dataPath);

  return { plotlines, stories, projectName: project.name, role };
};

export const actions = {
  create: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const title = form.get('title') as string;
    const storyId = form.get('storyId') as string;

    if (!title) return fail(400, { error: 'Title is required' });

    const templateId = (form.get('template') as string) || null;

    createPlotline(project.dataPath, { title, storyId, template: templateId });
    return { success: true };
  },

  delete: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const plotlineId = form.get('plotlineId') as string;
    if (!isSafePathSegment(plotlineId)) return fail(400, { error: 'Invalid plotline ID' });
    deletePlotline(project.dataPath, plotlineId);
    return { success: true };
  }
};
