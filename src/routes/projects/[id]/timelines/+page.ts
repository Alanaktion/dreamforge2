import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { timelinePath, type CalendarConfig, type TimelineEvent } from '$lib/api/timeline';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<{
    timeline: { calendar: CalendarConfig; events: TimelineEvent[] };
    entities: Array<{ id: string; name: string; type: string }>;
    projectName: string;
    role: string;
  }>(timelinePath(params.id), fetch);
};
