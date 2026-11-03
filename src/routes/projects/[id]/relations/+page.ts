import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { EntitySummary } from '$lib/api/entities';
import type { PageLoad } from './$types';

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  label: string | null;
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<{
    relations: Relation[];
    entities: EntitySummary[];
    projectName: string;
    role: string;
  }>(`/api/projects/${params.id}/relations`, fetch);
};
