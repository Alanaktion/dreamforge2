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
import { getBookmarks, addBookmark, removeBookmark, isBookmarked } from '../bookmarks';
import { generateId } from '$lib/utils';

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-metadata-'));
afterAll(() => fs.rmSync(testRoot, { recursive: true, force: true }));

function seedUserAndProject(): { userId: string; projectId: string } {
  const userId = generateId();
  const projectId = generateId();
  const username = `user-${userId.slice(0, 8)}`;
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${userId}', '${userId}@test.com', '${username}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, description, data_path, pinned, created_at, modified_at) VALUES ('${projectId}', '${userId}', 'Test', null, '${path.join(testRoot, projectId)}', 0, '2024-01-01', '2024-01-01')`
  );
  return { userId, projectId };
}

beforeAll(() => {
  migrate();
});

describe('getBookmarks', () => {
  it('returns empty array when no bookmarks exist', () => {
    const { userId, projectId } = seedUserAndProject();
    expect(getBookmarks(userId, projectId)).toEqual([]);
  });

  it('returns all bookmarks for a user and project', () => {
    const { userId, projectId } = seedUserAndProject();
    addBookmark(userId, projectId, 'entity-1');
    addBookmark(userId, projectId, 'entity-2');
    const bookmarks = getBookmarks(userId, projectId);
    expect(bookmarks).toHaveLength(2);
  });

  it('returns bookmarks ordered by createdAt', () => {
    const { userId, projectId } = seedUserAndProject();
    addBookmark(userId, projectId, 'entity-1');
    addBookmark(userId, projectId, 'entity-2');
    const bookmarks = getBookmarks(userId, projectId);
    expect(bookmarks[0].entityId).toBe('entity-1');
    expect(bookmarks[1].entityId).toBe('entity-2');
  });
});

describe('addBookmark', () => {
  it('adds a bookmark', () => {
    const { userId, projectId } = seedUserAndProject();
    addBookmark(userId, projectId, 'entity-1');
    expect(isBookmarked(userId, projectId, 'entity-1')).toBe(true);
  });

  it('does not add duplicate bookmarks', () => {
    const { userId, projectId } = seedUserAndProject();
    addBookmark(userId, projectId, 'entity-1');
    addBookmark(userId, projectId, 'entity-1');
    const bookmarks = getBookmarks(userId, projectId);
    expect(bookmarks).toHaveLength(1);
  });
});

describe('removeBookmark', () => {
  it('removes a bookmark', () => {
    const { userId, projectId } = seedUserAndProject();
    addBookmark(userId, projectId, 'entity-1');
    removeBookmark(userId, projectId, 'entity-1');
    expect(isBookmarked(userId, projectId, 'entity-1')).toBe(false);
  });

  it('does nothing when removing non-existent bookmark', () => {
    const { userId, projectId } = seedUserAndProject();
    expect(() => removeBookmark(userId, projectId, 'nonexistent')).not.toThrow();
  });
});

describe('isBookmarked', () => {
  it('returns false for non-bookmarked entity', () => {
    const { userId, projectId } = seedUserAndProject();
    expect(isBookmarked(userId, projectId, 'entity-1')).toBe(false);
  });

  it('returns true for bookmarked entity', () => {
    const { userId, projectId } = seedUserAndProject();
    addBookmark(userId, projectId, 'entity-1');
    expect(isBookmarked(userId, projectId, 'entity-1')).toBe(true);
  });
});
