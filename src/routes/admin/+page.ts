import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { AdminOverview } from '$lib/api/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(303, '/login?next=/admin');
  return await get<AdminOverview>('/api/admin', fetch);
};
