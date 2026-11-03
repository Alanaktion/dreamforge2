import { json } from '@sveltejs/kit';
import { getProjectAccess } from '$lib/server/members';
import { listStories, listChapters, listScenes } from '$lib/server/stories';
import { searchEntities } from '$lib/server/entities';

export async function GET({ params, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) {
    return json({ error: 'Project not found' }, { status: 404 });
  }

  const { project } = access;

  const entities = searchEntities(params.id, '').map((e) => ({
    id: e.id,
    type: e.type,
    name: e.name,
    tags: e.tags
  }));

  const stories: Array<{ id: string; title: string }> = [];
  const scenes: Array<{
    id: string;
    storyId: string;
    storyTitle: string;
    chapterTitle: string;
    title: string;
  }> = [];

  for (const story of listStories(project.dataPath)) {
    stories.push({ id: story.id, title: story.title });
    for (const chapter of listChapters(project.dataPath, story.id)) {
      const chapterScenes = listScenes(project.dataPath, story.id, chapter.id);
      chapterScenes.forEach((scene, i) => {
        scenes.push({
          id: scene.id,
          storyId: story.id,
          storyTitle: story.title,
          chapterTitle: chapter.title,
          title: scene.title || `Scene ${i + 1}`
        });
      });
    }
  }

  return json({ entities, stories, scenes });
}
