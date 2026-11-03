import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { storiesPath, type StoryStats } from '$lib/api/stories';
import type { PageLoad } from './$types';

interface StoryList {
  stories: StoryStats[];
  storyTargets: Record<string, number>;
  projectName: string;
  role: 'owner' | 'editor' | 'commenter';
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<StoryList>(storiesPath(params.id), fetch);
};
