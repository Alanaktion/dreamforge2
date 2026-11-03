import { describe, it, expect, beforeEach } from 'vitest';

const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  return { testDb: new Database(':memory:') };
});

vi.mock('../db', () => ({ default: testDb }));

import { migrate } from '../migrate';
import { touchProject } from '../watcher';

beforeEach(() => {
  migrate();
  testDb.exec('DELETE FROM projects; DELETE FROM users;');
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('u', 'u@test.com', 'u', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, data_path, pinned, created_at, modified_at) VALUES ('p', 'u', 'P', '/tmp/p', 0, '2024-01-01', '2024-01-01')`
  );
});

describe('touchProject', () => {
  it('records activity time and throttles repeated writes', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    expect(touchProject('p', start)).toBe(true);
    expect(testDb.prepare('SELECT modified_at FROM projects').get().modified_at).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect(touchProject('p', start + 1000)).toBe(false);
    expect(touchProject('p', start + 60_000)).toBe(true);
    expect(testDb.prepare('SELECT modified_at FROM projects').get().modified_at).toBe(
      '2026-01-01T00:01:00.000Z'
    );
  });
});
