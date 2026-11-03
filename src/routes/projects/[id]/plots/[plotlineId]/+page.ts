import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { plotlinePath, type Plotline } from '$lib/api/plots';
import type { ChapterWithScenes } from '$lib/api/stories';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<{
    plotline: Plotline;
    chapters: ChapterWithScenes[];
    projectName: string;
    role: string;
  }>(plotlinePath(params.id, params.plotlineId), fetch);
};
