import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { CustomField } from '$lib/api/entities';
import type { Invite, Member, ProjectAccess } from '$lib/api/types';
import type { WritingProgress } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const base = `/api/projects/${params.id}`;
  const { project, role } = await get<ProjectAccess>(base, fetch);
  const owner = role === 'owner';
  const [members, invites, customFields, progress] = await Promise.all([
    owner ? get<Member[]>(`${base}/members`, fetch) : [],
    owner ? get<Invite[]>(`${base}/invites`, fetch) : [],
    get<CustomField[]>(`${base}/fields`, fetch),
    get<WritingProgress>(`${base}/writing`, fetch)
  ]);
  return {
    project,
    role,
    members,
    invites,
    customFields,
    // Not served by the API yet (backups live in project files).
    backups: [] as Array<{ name: string; createdAt: string; size: number }>,
    backupEnabled: false,
    dailyGoal: progress.dailyGoal
  };
};
