import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  return { testDb: db };
});

vi.mock('../db', () => {
  return { default: testDb };
});

import { migrate } from '../migrate';
import { getComments, createComment, deleteComment, resolveComment } from '../comments';
import { generateId } from '$lib/utils';

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-metadata-'));
afterAll(() => fs.rmSync(testRoot, { recursive: true, force: true }));

function seedData(): { userId: string; projectId: string; ownerId: string; username: string } {
  const ownerId = generateId();
  const userId = generateId();
  const projectId = generateId();

  const ownerUser = `owner-${ownerId.slice(0, 8)}`;
  const regUser = `user-${userId.slice(0, 8)}`;
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${ownerId}', '${ownerId}@test.com', '${ownerUser}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${userId}', '${userId}@test.com', '${regUser}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, description, data_path, pinned, created_at, modified_at) VALUES ('${projectId}', '${ownerId}', 'Test', null, '${path.join(testRoot, projectId)}', 0, '2024-01-01', '2024-01-01')`
  );

  return { userId, projectId, ownerId, username: regUser };
}

beforeAll(() => {
  migrate();
});

describe('createComment', () => {
  it('creates a comment with correct fields', () => {
    const { userId, projectId, username } = seedData();
    const comment = createComment(projectId, 'entity', 'target-1', userId, 'Test comment body');

    expect(comment.id).toBeTruthy();
    expect(comment.projectId).toBe(projectId);
    expect(comment.targetType).toBe('entity');
    expect(comment.targetId).toBe('target-1');
    expect(comment.userId).toBe(userId);
    expect(comment.username).toBe(username);
    expect(comment.body).toBe('Test comment body');
    expect(comment.resolved).toBe(false);
    expect(comment.createdAt).toBeTruthy();
  });
});

describe('getComments', () => {
  it('returns comments for a target', () => {
    const { userId, projectId } = seedData();
    createComment(projectId, 'entity', 'target-1', userId, 'Comment 1');
    createComment(projectId, 'entity', 'target-1', userId, 'Comment 2');

    const comments = getComments(projectId, 'entity', 'target-1');
    expect(comments).toHaveLength(2);
    expect(comments[0].body).toBe('Comment 1');
    expect(comments[1].body).toBe('Comment 2');
  });

  it('returns empty array when no comments exist', () => {
    const { projectId } = seedData();
    expect(getComments(projectId, 'entity', 'nonexistent')).toEqual([]);
  });

  it('does not return comments for different targets', () => {
    const { userId, projectId } = seedData();
    createComment(projectId, 'entity', 'target-1', userId, 'Comment');
    const comments = getComments(projectId, 'entity', 'target-2');
    expect(comments).toEqual([]);
  });

  it('returns comments with username from join', () => {
    const { userId, projectId, username } = seedData();
    createComment(projectId, 'entity', 'target-1', userId, 'Test');
    const comments = getComments(projectId, 'entity', 'target-1');
    expect(comments[0].username).toBe(username);
  });
});

describe('deleteComment', () => {
  it('allows comment author to delete', () => {
    const { userId, projectId, ownerId } = seedData();
    const comment = createComment(projectId, 'entity', 'target-1', userId, 'Delete me');
    const result = deleteComment(projectId, comment.id, userId, ownerId);
    expect(result).toBe(true);
    expect(getComments(projectId, 'entity', 'target-1')).toHaveLength(0);
  });

  it('allows project owner to delete any comment', () => {
    const { userId, projectId, ownerId } = seedData();
    const comment = createComment(projectId, 'entity', 'target-1', userId, 'Delete me');
    const result = deleteComment(projectId, comment.id, ownerId, ownerId);
    expect(result).toBe(true);
  });

  it('prevents other users from deleting', () => {
    const { userId, projectId } = seedData();
    const otherUserId = generateId();
    testDb.exec(
      `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${otherUserId}', '${otherUserId}@test.com', 'other-${otherUserId.slice(0, 8)}', 'hash', '2024-01-01')`
    );

    const comment = createComment(projectId, 'entity', 'target-1', userId, 'Keep me');
    const result = deleteComment(projectId, comment.id, otherUserId, 'some-owner');
    expect(result).toBe(false);
    expect(getComments(projectId, 'entity', 'target-1')).toHaveLength(1);
  });

  it('returns false for non-existent comment', () => {
    const { userId, ownerId, projectId } = seedData();
    expect(deleteComment(projectId, 'nonexistent', userId, ownerId)).toBe(false);
  });
});

describe('resolveComment', () => {
  it('marks a comment as resolved', () => {
    const { userId, projectId } = seedData();
    const comment = createComment(projectId, 'entity', 'target-1', userId, 'Fix this');
    const result = resolveComment(projectId, comment.id, true);
    expect(result).toBe(true);

    const comments = getComments(projectId, 'entity', 'target-1');
    expect(comments[0].resolved).toBe(true);
  });

  it('marks a comment as unresolved', () => {
    const { userId, projectId } = seedData();
    const comment = createComment(projectId, 'entity', 'target-1', userId, 'Done');
    resolveComment(projectId, comment.id, true);
    resolveComment(projectId, comment.id, false);
    const result = resolveComment(projectId, comment.id, false);
    expect(result).toBe(true);

    const comments = getComments(projectId, 'entity', 'target-1');
    expect(comments[0].resolved).toBe(false);
  });

  it('returns false for non-existent comment', () => {
    const { projectId } = seedData();
    expect(resolveComment(projectId, 'nonexistent', true)).toBe(false);
  });
});
