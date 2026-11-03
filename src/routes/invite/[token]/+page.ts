import { api, ApiError } from '$lib/api';
import type { InvitePreview } from '$lib/api/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  try {
    const invite = await api<InvitePreview>(`/api/invites/${encodeURIComponent(params.token)}`, {
      fetch
    });
    return { invite, alreadyMember: invite.alreadyMember };
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return { invite: null };
    throw cause;
  }
};
