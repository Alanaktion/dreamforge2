import { scanProject, watchProject } from '$lib/server/watcher';
import { projectProblems } from '$lib/server/diagnostics';
import type { LayoutServerLoad } from './$types';
import { getBookmarks } from '$lib/server/bookmarks';
import { registrationAllowed } from '$lib/server/registration';
import db from '$lib/server/db';
import { entities } from '$lib/server/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getProjectAccess } from '$lib/server/members';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const drizzleDb = drizzle(db);

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const bookmarks: Array<{
    id: string;
    entityId: string;
    entityName?: string;
    entityType?: string;
  }> = [];
  let projectId = '';
  let storageProblems: Array<{ file: string; message: string }> = [];
  const entityCounts: Record<string, number> = {};

  // Extract project ID from URL: /projects/[id]/...
  const match = url.pathname.match(/^\/projects\/([^/]+)/);
  if (match) {
    projectId = match[1];
    const access = locals.user ? getProjectAccess(projectId, locals.user.id) : null;
    if (access) {
      scanProject(projectId, access.project.dataPath);
      watchProject(projectId, access.project.dataPath);
      storageProblems = projectProblems(access.project.dataPath);
      const rows = drizzleDb
        .select({ type: entities.type, count: sql<number>`count(*)` })
        .from(entities)
        .where(eq(entities.projectId, projectId))
        .groupBy(entities.type)
        .all();
      for (const row of rows) entityCounts[row.type] = row.count;
    }
    if (locals.user) {
      const userBookmarks = getBookmarks(locals.user.id, projectId);
      for (const bm of userBookmarks) {
        const entity = drizzleDb
          .select()
          .from(entities)
          .where(and(eq(entities.id, bm.entityId), eq(entities.projectId, projectId)))
          .get();
        if (!entity) continue;
        bookmarks.push({
          id: bm.id,
          entityId: bm.entityId,
          entityName: entity.name,
          entityType: entity.type
        });
      }
    }
  }

  return {
    user: locals.user
      ? {
          id: locals.user.id,
          email: locals.user.email,
          username: locals.user.username,
          createdAt: locals.user.createdAt
        }
      : null,
    storageProblems,
    bookmarks,
    entityCounts,
    projectId,
    allowRegistration: registrationAllowed()
  };
};
