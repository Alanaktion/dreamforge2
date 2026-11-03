import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import db from './db';
import { projectPins } from './schema';

const index = drizzle(db);

export function pinnedProjectIds(userId: string): Set<string> {
  return new Set(
    index
      .select({ projectId: projectPins.projectId })
      .from(projectPins)
      .where(eq(projectPins.userId, userId))
      .all()
      .map((r) => r.projectId)
  );
}

export function togglePin(userId: string, projectId: string): boolean {
  const where = and(eq(projectPins.userId, userId), eq(projectPins.projectId, projectId));
  const existing = index.select().from(projectPins).where(where).get();
  if (existing) {
    index.delete(projectPins).where(where).run();
    return false;
  }
  index
    .insert(projectPins)
    .values({ userId, projectId, createdAt: new Date().toISOString() })
    .run();
  return true;
}
