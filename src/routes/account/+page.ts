import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { User } from '$lib/api/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(303, '/login?next=/account');
  const account = await get<{ user: User; ownedProjects: string[] }>('/api/account', fetch);
  return {
    mustChangePassword: account.user.mustChangePassword,
    ownedProjects: account.ownedProjects
  };
};
