import { fail, redirect } from '@sveltejs/kit';
import { acceptInvite, findInvite } from '$lib/server/invites';
import { getProjectAccess } from '$lib/server/members';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const invite = findInvite(params.token);
  if (!invite) return { invite: null };
  const access = locals.user ? getProjectAccess(invite.projectId, locals.user.id) : null;
  return {
    invite: { projectName: invite.projectName, role: invite.role, projectId: invite.projectId },
    alreadyMember: !!access && !(access.role === 'commenter' && invite.role === 'editor')
  };
};

export const actions: Actions = {
  accept: async ({ params, locals }) => {
    if (!locals.user) redirect(303, `/login?next=/invite/${params.token}&invite=${params.token}`);
    const projectId = acceptInvite(params.token, locals.user.id);
    if (!projectId) return fail(410, { error: 'This invite link has expired or was revoked.' });
    redirect(303, `/projects/${projectId}`);
  }
};
