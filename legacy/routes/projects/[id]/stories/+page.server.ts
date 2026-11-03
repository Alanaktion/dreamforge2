import { fail, redirect } from '@sveltejs/kit';
import { createStory, createChapter, createScene } from '$lib/server/stories';
import { softDeleteStory } from '$lib/server/trash';
import { getProjectAccess } from '$lib/server/members';
import { collectStories } from '$lib/server/stats';
import { readWritingLog, setStoryTarget } from '$lib/server/writingLog';
import { isSafePathSegment } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const { stories } = collectStories(project.dataPath);
  const { storyTargets } = readWritingLog(project.dataPath);

  return { stories, storyTargets, projectName: project.name, role };
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
    if (!title) return fail(400, { error: 'Title is required' });

    const description = form.get('description') as string;
    const story = createStory(project.dataPath, title, description);
    const chapter = createChapter(project.dataPath, story.id, 'Chapter 1');
    const scene = createScene(project.dataPath, story.id, chapter.id);

    return { success: true, storyId: story.id, chapterId: chapter.id, sceneId: scene.id };
  },

  setTarget: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const storyId = form.get('storyId') as string;
    if (!isSafePathSegment(storyId)) return fail(400, { error: 'Invalid story ID' });

    const target = Number(form.get('target') || 0);
    if (!Number.isFinite(target) || target < 0) return fail(400, { error: 'Invalid target' });

    setStoryTarget(project.dataPath, storyId, target);

    return { success: true };
  },

  delete: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const storyId = form.get('storyId') as string;
    if (!isSafePathSegment(storyId)) return fail(400, { error: 'Invalid story ID' });

    const trashItem = softDeleteStory(params.id, project.dataPath, storyId);
    if (!trashItem) return fail(404, { error: 'Story not found' });

    return { success: true, trashItem };
  }
};
