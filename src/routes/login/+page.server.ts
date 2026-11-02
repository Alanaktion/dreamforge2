import { allowLogin } from '$lib/server/loginThrottle';
import { fail, redirect } from '@sveltejs/kit';
import { verify } from '$lib/server/password';
import db from '$lib/server/db';
import { users, sessions } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';

const drizzleDb = drizzle(db);

export const actions = {
  login: async ({ request, cookies, url, getClientAddress }) => {
    const form = await request.formData();
    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    if (!allowLogin(`ip:${getClientAddress()}`) || !allowLogin(`email:${email}`))
      return fail(429, { error: 'Too many login attempts. Try again in 15 minutes.' });
    const password = form.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required' });
    }

    const user = drizzleDb
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .get();

    if (!user) {
      return fail(400, { error: 'Invalid email or password' });
    }

    const valid = await verify(password, user.passwordHash);
    if (!valid) {
      return fail(400, { error: 'Invalid email or password' });
    }

    const oldSession = cookies.get('dreamforge-session');
    if (oldSession) drizzleDb.delete(sessions).where(eq(sessions.id, oldSession)).run();
    const sessionId = generateId();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days

    drizzleDb
      .insert(sessions)
      .values({
        id: sessionId,
        userId: user.id,
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

    throw redirect(302, '/projects');
  }
};
