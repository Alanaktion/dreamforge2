import { error, fail, redirect } from '@sveltejs/kit';
import {
  AccountError,
  listUsers,
  resetPassword,
  setAdmin,
  setDisabled
} from '$lib/server/accounts';
import {
  registrationAllowed,
  registrationMode,
  setRegistrationMode
} from '$lib/server/registration';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
  if (!locals.user) redirect(303, '/login?next=/admin');
  if (!locals.user.isAdmin) error(403, 'Administrators only');
  return locals.user;
}

async function run(action: () => unknown | Promise<unknown>) {
  try {
    return (await action()) ?? { success: true };
  } catch (cause) {
    if (cause instanceof AccountError) return fail(400, { error: cause.message });
    throw cause;
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  const admin = requireAdmin(locals);
  return {
    users: listUsers(),
    currentUserId: admin.id,
    registration: registrationMode(),
    registrationOpen: registrationAllowed()
  };
};

export const actions: Actions = {
  registration: async ({ locals, request }) => {
    requireAdmin(locals);
    const mode = (await request.formData()).get('mode');
    if (mode !== 'open' && mode !== 'closed' && mode !== 'default')
      return fail(400, { error: 'Unknown registration setting' });
    setRegistrationMode(mode);
    return { success: true };
  },
  disable: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const form = await request.formData();
    return run(() =>
      setDisabled(admin.id, String(form.get('userId')), form.get('disabled') === 'true')
    );
  },
  admin: async ({ locals, request }) => {
    const admin = requireAdmin(locals);
    const form = await request.formData();
    return run(() => setAdmin(admin.id, String(form.get('userId')), form.get('admin') === 'true'));
  },
  resetPassword: async ({ locals, request }) => {
    requireAdmin(locals);
    const userId = String((await request.formData()).get('userId'));
    return run(async () => ({
      success: true,
      reset: { userId, password: await resetPassword(userId) }
    }));
  }
};
