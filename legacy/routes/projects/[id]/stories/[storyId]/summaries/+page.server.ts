import { fail, redirect } from '@sveltejs/kit';
import { ConflictError, expectedRevision } from '$lib/server/storage';
import { getStoryMeta, listChapters, listScenes, updateScene } from '$lib/server/stories';
import { listPlotlines } from '$lib/server/plots';
import { getProjectAccess } from '$lib/server/members';
import { isSafePathSegment } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const story = getStoryMeta(project.dataPath, params.storyId);
  if (!story) throw redirect(302, `/projects/${params.id}/stories`);

  const chapters = listChapters(project.dataPath, params.storyId);
  const chaptersWithScenes = chapters.map((ch) => ({
    ...ch,
    scenes: listScenes(project.dataPath, params.storyId, ch.id)
  }));

  const plotlines = listPlotlines(project.dataPath).filter((p) => p.storyId === params.storyId);

  return { story, chapters: chaptersWithScenes, plotlines, projectName: project.name, role };
};

export const actions = {
  updateSceneSummary: async ({ params, locals, request }) => {
    if (!locals.user) return { success: false };
    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return { success: false };
    if (access.role === 'commenter') return { success: false };
    const { project } = access;
    const form = await request.formData();
    const chapterId = form.get('chapterId') as string;
    const sceneId = form.get('sceneId') as string;
    const field = form.get('field') as string;
    const value = form.get('value') as string;
    if (!isSafePathSegment(chapterId) || !isSafePathSegment(sceneId)) return { success: false };
    if (field !== 'summary') return fail(400, { error: 'Field not allowed' });
    try {
      const updated = updateScene(
        project.dataPath,
        params.storyId,
        chapterId,
        sceneId,
        { summary: value || null },
        expectedRevision(form)
      );
      if (!updated) return fail(404, { error: 'Scene not found' });
      return { success: true, revision: updated.revision };
    } catch (cause) {
      if (cause instanceof ConflictError) return fail(409, { error: cause.message });
      throw cause;
    }
  }
};
