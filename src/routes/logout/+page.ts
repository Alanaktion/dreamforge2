import { redirect } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  await api('/api/auth/logout', { method: 'POST', fetch }).catch(() => undefined);
  redirect(303, '/');
};
