import { fail, redirect } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, ne, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { users, sessions } from '$lib/server/schema';
import { hash, verify } from '$lib/server/password';
import { allowLogin } from '$lib/server/loginThrottle';
import { AccountError, deleteAccount, ownedProjectNames } from '$lib/server/accounts';

const index = drizzle(db);
export function load({ locals }) {
  if (!locals.user) redirect(303, '/login');
  return {
    mustChangePassword: !!locals.user.mustChangePassword,
    ownedProjects: ownedProjectNames(locals.user.id)
  };
}

export const actions = {
  update: async ({ locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    if (!allowLogin(`account:${locals.user.id}`))
      return fail(429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const form = await request.formData();
    if (!(await verify(String(form.get('currentPassword') || ''), locals.user.passwordHash)))
      return fail(400, { error: 'Current password is incorrect' });
    const password = String(form.get('password') || '');
    if ((password && password.length < 12) || (locals.user.mustChangePassword && !password))
      return fail(400, { error: 'Choose a new password of at least 12 characters' });
    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    const username = String(form.get('username') || '').trim();
    if (!email.includes('@') || !username)
      return fail(400, { error: 'Email and username are required' });
    const duplicate = index
      .select()
      .from(users)
      .where(
        and(
          ne(users.id, locals.user.id),
          sql`(lower(${users.email}) = ${email} OR ${users.username} = ${username})`
        )
      )
      .get();
    if (duplicate) return fail(400, { error: 'Email or username already taken' });
    const passwordHash = password ? await hash(password) : locals.user.passwordHash;
    index.transaction((tx) => {
      tx.update(users)
        .set({ email, username, passwordHash, mustChangePassword: false })
        .where(eq(users.id, locals.user!.id))
        .run();
      if (password || form.get('logoutOthers') === 'on')
        tx.delete(sessions)
          .where(and(eq(sessions.userId, locals.user!.id), ne(sessions.id, locals.session!.id)))
          .run();
    });
    return { success: true };
  },
  delete: async ({ locals, request, cookies }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    if (!allowLogin(`account:${locals.user.id}`))
      return fail(429, { deleteError: 'Too many attempts. Try again in 15 minutes.' });
    const form = await request.formData();
    if (!(await verify(String(form.get('password') || ''), locals.user.passwordHash)))
      return fail(400, { deleteError: 'Password is incorrect' });
    if (form.get('confirm') !== 'DELETE')
      return fail(400, { deleteError: 'Type DELETE to confirm' });
    try {
      deleteAccount(locals.user.id);
    } catch (cause) {
      if (cause instanceof AccountError) return fail(400, { deleteError: cause.message });
      throw cause;
    }
    cookies.delete('dreamforge-session', { path: '/' });
    redirect(303, '/login');
  }
};
