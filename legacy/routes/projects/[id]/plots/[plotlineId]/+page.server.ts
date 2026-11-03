import { fail, redirect } from '@sveltejs/kit';
import {
  getPlotline,
  updatePlotline,
  reorderBeats,
  addBeat,
  renameBeat,
  deleteBeat,
  linkSceneToBeat
} from '$lib/server/plots';
import { listChapters, listScenes } from '$lib/server/stories';
import { getProjectAccess } from '$lib/server/members';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const plotline = getPlotline(project.dataPath, params.plotlineId);
  if (!plotline) throw redirect(302, `/projects/${params.id}/plots`);

  const chapters = listChapters(project.dataPath, plotline.storyId);
  const chaptersWithScenes = chapters.map((ch) => ({
    ...ch,
    scenes: listScenes(project.dataPath, plotline.storyId, ch.id)
  }));

  return { plotline, chapters: chaptersWithScenes, projectName: project.name, role };
};

export const actions = {
  update: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const title = form.get('title') as string;
    if (title) {
      updatePlotline(project.dataPath, params.plotlineId, { title });
    }
    return { success: true };
  },

  linkScene: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const beatId = form.get('beatId') as string;
    const sceneId = (form.get('sceneId') as string) || null;
    if (!beatId) return fail(400, { error: 'Beat ID required' });

    const plotline = linkSceneToBeat(project.dataPath, params.plotlineId, beatId, sceneId);
    if (!plotline) return fail(404, { error: 'Plotline not found' });

    return { success: true };
  },

  reorderBeats: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const beatIds = JSON.parse(form.get('beatIds') as string) as string[];
    reorderBeats(project.dataPath, params.plotlineId, beatIds);
    return { success: true };
  },

  addBeat: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const title = (form.get('title') as string)?.trim();
    if (!title) return fail(400, { error: 'Title is required' });

    const plotline = addBeat(project.dataPath, params.plotlineId, title);
    if (!plotline) return fail(404, { error: 'Plotline not found' });

    return { success: true };
  },

  renameBeat: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const beatId = form.get('beatId') as string;
    const title = (form.get('title') as string)?.trim();
    if (!beatId) return fail(400, { error: 'Beat ID required' });
    if (!title) return fail(400, { error: 'Title is required' });

    const plotline = renameBeat(project.dataPath, params.plotlineId, beatId, title);
    if (!plotline) return fail(404, { error: 'Plotline not found' });

    return { success: true };
  },

  deleteBeat: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const beatId = form.get('beatId') as string;
    if (!beatId) return fail(400, { error: 'Beat ID required' });

    const plotline = deleteBeat(project.dataPath, params.plotlineId, beatId);
    if (!plotline) return fail(404, { error: 'Plotline not found' });

    return { success: true };
  }
};
