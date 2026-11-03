import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { Invite, Member, ProjectAccess } from '$lib/api/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const base = `/api/projects/${params.id}`;
  const { project, role } = await get<ProjectAccess>(base, fetch);
  const owner = role === 'owner';
  const [members, invites] = owner
    ? await Promise.all([
        get<Member[]>(`${base}/members`, fetch),
        get<Invite[]>(`${base}/invites`, fetch)
      ])
    : [[], []];
  return {
    project,
    role,
    members,
    invites,
    // Not served by the API yet (custom fields, writing log, backups live in project files).
    customFields: [],
    backups: [] as Array<{ name: string; createdAt: string; size: number }>,
    backupEnabled: false,
    dailyGoal: 500
  };
};
