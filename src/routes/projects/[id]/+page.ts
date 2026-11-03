import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { ProjectAccess } from '$lib/api/types';
import type { ProjectStats, WritingProgress } from '$lib/types';
import type { PageLoad } from './$types';

interface Dashboard {
  stats: ProjectStats;
  progress: WritingProgress;
  gettingStarted: { character: boolean; scene: boolean; relation: boolean; mention: boolean };
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const base = `/api/projects/${params.id}`;
  const [{ project, role }, dashboard] = await Promise.all([
    get<ProjectAccess>(base, fetch),
    get<Dashboard>(`${base}/dashboard`, fetch)
  ]);
  return { project, role, ...dashboard };
};
