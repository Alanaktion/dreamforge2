import { fail, redirect } from '@sveltejs/kit';
import { hash } from '$lib/server/password';
import db from '$lib/server/db';
import { users, sessions } from '$lib/server/schema';
import { eq, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';
import { registrationAllowed } from '$lib/server/registration';
import { findInvite } from '$lib/server/invites';
import type { PageServerLoad } from './$types';

const drizzleDb = drizzle(db);

function inviteToken(value: unknown): string | null {
  return typeof value === 'string' && value && findInvite(value) ? value : null;
}

export const load: PageServerLoad = async ({ url }) => {
  const invite = inviteToken(url.searchParams.get('invite'));
  if (!registrationAllowed() && !invite) throw redirect(302, '/login');
  return { invite };
};

export const actions = {
  register: async ({ request, cookies, url }) => {
    const form = await request.formData();
    const invite = inviteToken(form.get('invite'));
    if (!registrationAllowed() && !invite) {
      return fail(403, { error: 'Registration is disabled' });
    }

    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    const username = form.get('username') as string;
    const password = form.get('password') as string;

    if (!email || !username || !password) {
      return fail(400, { error: 'All fields are required' });
    }

    if (password.length < 8) {
      return fail(400, { error: 'Password must be at least 8 characters' });
    }

    const existing = drizzleDb
      .select()
      .from(users)
      .where(or(sql`lower(${users.email}) = ${email}`, eq(users.username, username)))
      .get();

    if (existing) {
      return fail(400, { error: 'Email or username already taken' });
    }

    const passwordHash = await hash(password);
    const userId = generateId();

    drizzleDb
      .insert(users)
      .values({
        id: userId,
        email,
        username,
        passwordHash,
        createdAt: new Date().toISOString()
      })
      .run();

    const sessionId = generateId();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

    drizzleDb
      .insert(sessions)
      .values({
        id: sessionId,
        userId,
        expiresAt
      })
      .run();

    cookies.set('dreamforge-session', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 60 * 60 * 24 * 30
    });

    throw redirect(302, invite ? `/invite/${invite}` : '/projects');
  }
};
