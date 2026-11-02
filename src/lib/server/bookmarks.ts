import { withProjectMetadata } from './projectMetadata';
import db from './db';
import { bookmarks } from './schema';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';

const drizzleDb = drizzle(db);

export interface BookmarkEntry {
  id: string;
  userId: string;
  projectId: string;
  entityId: string;
  entityName?: string;
  entityType?: string;
  createdAt: string;
}

export function getBookmarks(userId: string, projectId: string): BookmarkEntry[] {
  return drizzleDb
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.projectId, projectId)))
    .orderBy(bookmarks.createdAt)
    .all();
}

function addBookmarkImpl(userId: string, projectId: string, entityId: string): void {
  const existing = drizzleDb
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.projectId, projectId),
        eq(bookmarks.entityId, entityId)
      )
    )
    .get();

  if (!existing) {
    drizzleDb
      .insert(bookmarks)
      .values({
        id: generateId(),
        userId,
        projectId,
        entityId,
        createdAt: new Date().toISOString()
      })
      .run();
  }
}

function removeBookmarkImpl(userId: string, projectId: string, entityId: string): void {
  drizzleDb
    .delete(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.projectId, projectId),
        eq(bookmarks.entityId, entityId)
      )
    )
    .run();
}

export function isBookmarked(userId: string, projectId: string, entityId: string): boolean {
  const result = drizzleDb
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.projectId, projectId),
        eq(bookmarks.entityId, entityId)
      )
    )
    .get();
  return !!result;
}

export const addBookmark = (
  ...args: Parameters<typeof addBookmarkImpl>
): ReturnType<typeof addBookmarkImpl> =>
  withProjectMetadata(args[1], () => addBookmarkImpl(...args));

export const removeBookmark = (
  ...args: Parameters<typeof removeBookmarkImpl>
): ReturnType<typeof removeBookmarkImpl> =>
  withProjectMetadata(args[1], () => removeBookmarkImpl(...args));
