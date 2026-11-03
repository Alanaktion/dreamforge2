import { unwatchAllProjects } from '$lib/server/watcher';
import { building } from '$app/environment';
import { startBackups } from '$lib/server/backups';
import { StorageError } from '$lib/server/storage';
import { lte } from 'drizzle-orm';
import db, { dbPath } from '$lib/server/db';
import { sessions, users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from '$lib/server/migrate';
import { seed } from '$lib/server/seed';
import { purgeExpiredTrashItems } from '$lib/server/trash';
import { getDataDir } from '$lib/server/paths';
import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';

const drizzleDb = drizzle(db);

// Run migrations, seed, and purge expired trash on startup. A startup failure is
// fatal — crash loudly so the container logs show it instead of serving 500s.
try {
  if (!building) migrate();
  if (!building) await seed();
  if (!building) {
    purgeExpiredTrashItems();
    const purgeSessions = () =>
      drizzleDb
        .delete(sessions)
        .where(lte(sessions.expiresAt, Math.floor(Date.now() / 1000)))
        .run();
    purgeSessions();
    const sessionPurge = setInterval(purgeSessions, 86400000);
    sessionPurge.unref();
    const backupScheduler = startBackups();
    process.once('sveltekit:shutdown', () => {
      clearInterval(sessionPurge);
      clearInterval(backupScheduler);
      void unwatchAllProjects();
    });
    if (!process.env.ORIGIN && !process.env.PROTOCOL_HEADER)
      console.warn(
        'Set ORIGIN to your public URL (for example http://localhost:3000) so login forms pass the origin check.'
      );
  }
  console.log(
    `[${new Date().toISOString()}] DreamForge startup complete (database=${dbPath}, dataDir=${getDataDir()})`
  );
} catch (err) {
  console.error(`[${new Date().toISOString()}] DreamForge startup failed:`, err);
  process.exit(1);
}

function requestLabel(event: { request: Request; url: URL }, status: number): string {
  return `[${new Date().toISOString()}] ${status} ${event.request.method} ${event.url.pathname}`;
}

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('dreamforge-session');

  if (sessionId) {
    const session = drizzleDb.select().from(sessions).where(eq(sessions.id, sessionId)).get();

    if (session && session.expiresAt > Math.floor(Date.now() / 1000)) {
      const user = drizzleDb.select().from(users).where(eq(users.id, session.userId)).get();

      if (user && !user.disabled) {
        event.locals.user = user;
        event.locals.session = session;
      } else {
        drizzleDb.delete(sessions).where(eq(sessions.id, sessionId)).run();
        event.cookies.delete('dreamforge-session', { path: '/' });
        event.locals.user = null;
        event.locals.session = null;
      }
    } else {
      if (session) {
        drizzleDb.delete(sessions).where(eq(sessions.id, sessionId)).run();
      }
      event.cookies.delete('dreamforge-session', { path: '/' });
      event.locals.user = null;
      event.locals.session = null;
    }
  } else {
    event.locals.user = null;
    event.locals.session = null;
  }

  if (
    event.locals.user?.mustChangePassword &&
    !['/account', '/logout', '/healthz'].includes(event.url.pathname)
  )
    redirect(303, '/account');
  const response = await resolve(event);

  // SvelteKit only reports unexpected exceptions to handleError — expected
  // errors (error(), fail(500), manual 500 responses) would otherwise be silent.
  if (response.status >= 500) {
    console.error(`${requestLabel(event, response.status)} — returned ${response.status} response`);
  }

  return response;
};

export const handleError: HandleServerError = async ({ error, event, status }) => {
  console.error(`${requestLabel(event, status)} — unhandled error`);
  const err = error as Error | undefined;
  console.error(err?.stack ?? err);
  if (error instanceof StorageError) return { message: error.message };
};
