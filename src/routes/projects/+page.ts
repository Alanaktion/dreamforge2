import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { ProjectList } from '$lib/api/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  // Word and entry counts come from project files and are not served by the API yet.
  return await get<ProjectList>('/api/projects', fetch);
};
