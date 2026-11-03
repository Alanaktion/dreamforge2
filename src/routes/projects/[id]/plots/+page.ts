import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { plotlinesPath, type Plotline } from '$lib/api/plots';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<{
    plotlines: Plotline[];
    stories: Array<{ id: string; title: string }>;
    projectName: string;
    role: string;
  }>(plotlinesPath(params.id), fetch);
};
