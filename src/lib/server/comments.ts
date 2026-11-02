import { withProjectMetadata } from './projectMetadata';
import db from './db';
import { comments, users } from './schema';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';

const drizzleDb = drizzle(db);

export interface Comment {
  id: string;
  projectId: string;
  targetType: string;
  targetId: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  resolved: boolean;
}

export function getComments(projectId: string, targetType: string, targetId: string): Comment[] {
  const rows = drizzleDb
    .select({
      id: comments.id,
      projectId: comments.projectId,
      targetType: comments.targetType,
      targetId: comments.targetId,
      userId: comments.userId,
      username: users.username,
      body: comments.body,
      createdAt: comments.createdAt,
      resolved: comments.resolved
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(
      and(
        eq(comments.projectId, projectId),
        eq(comments.targetType, targetType),
        eq(comments.targetId, targetId)
      )
    )
    .all();

  return rows.map((r) => ({ ...r, resolved: Boolean(r.resolved) }));
}

function createCommentImpl(
  projectId: string,
  targetType: string,
  targetId: string,
  userId: string,
  body: string
): Comment {
  const id = generateId();
  const createdAt = new Date().toISOString();

  drizzleDb
    .insert(comments)
    .values({ id, projectId, targetType, targetId, userId, body, createdAt, resolved: false })
    .run();

  const user = drizzleDb
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return {
    id,
    projectId,
    targetType,
    targetId,
    userId,
    username: user?.username ?? '',
    body,
    createdAt,
    resolved: false
  };
}

function deleteCommentImpl(
  projectId: string,
  commentId: string,
  requestingUserId: string,
  projectOwnerUserId: string
): boolean {
  const comment = drizzleDb
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.projectId, projectId)))
    .get();
  if (!comment) return false;

  const canDelete = comment.userId === requestingUserId || projectOwnerUserId === requestingUserId;
  if (!canDelete) return false;

  drizzleDb.delete(comments).where(eq(comments.id, commentId)).run();
  return true;
}

function resolveCommentImpl(projectId: string, commentId: string, resolved: boolean): boolean {
  const result = drizzleDb
    .update(comments)
    .set({ resolved })
    .where(and(eq(comments.id, commentId), eq(comments.projectId, projectId)))
    .run();
  return result.changes > 0;
}

export const createComment = (
  ...args: Parameters<typeof createCommentImpl>
): ReturnType<typeof createCommentImpl> =>
  withProjectMetadata(args[0], () => createCommentImpl(...args));

export const deleteComment = (
  ...args: Parameters<typeof deleteCommentImpl>
): ReturnType<typeof deleteCommentImpl> =>
  withProjectMetadata(args[0], () => deleteCommentImpl(...args));

export const resolveComment = (
  ...args: Parameters<typeof resolveCommentImpl>
): ReturnType<typeof resolveCommentImpl> =>
  withProjectMetadata(args[0], () => resolveCommentImpl(...args));
