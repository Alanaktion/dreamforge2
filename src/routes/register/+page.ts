import { redirect } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const token = url.searchParams.get('invite');
  let invite: string | null = null;
  if (token) {
    const valid = await api(`/api/invites/${encodeURIComponent(token)}`, { fetch }).then(
      () => true,
      () => false
    );
    if (valid) invite = token;
  }
  const { allowRegistration } = await parent();
  if (!allowRegistration && !invite) redirect(302, '/login');
  return { invite };
};
