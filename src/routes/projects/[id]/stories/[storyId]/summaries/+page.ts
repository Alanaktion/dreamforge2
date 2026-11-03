import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { storyPath, type StoryDetail } from '$lib/api/stories';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<StoryDetail>(storyPath(params.id, params.storyId), fetch);
};
