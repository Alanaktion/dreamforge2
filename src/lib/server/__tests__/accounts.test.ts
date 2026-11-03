import { describe, it, expect, beforeEach } from 'vitest';

const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  return { testDb: new Database(':memory:') };
});

vi.mock('../db', () => ({ default: testDb }));

import { migrate } from '../migrate';
import {
  AccountError,
  deleteAccount,
  listUsers,
  resetPassword,
  setAdmin,
  setDisabled
} from '../accounts';
import { acceptInvite, createInvite, findInvite, listInvites, revokeInvite } from '../invites';
import { pinnedProjectIds, togglePin } from '../pins';
import { getProjectAccess } from '../members';
import { verify } from '../password';
import { registrationMode, setRegistrationMode } from '../registration';

function user(id: string, admin = false) {
  testDb
    .prepare(
      `INSERT INTO users (id, email, username, password_hash, created_at, is_admin) VALUES (?, ?, ?, 'hash', ?, ?)`
    )
    .run(
      id,
      `${id}@test.com`,
      id,
      `2024-01-0${testDb.prepare('SELECT count(*) n FROM users').get().n + 1}`,
      admin ? 1 : 0
    );
}

function project(id: string, owner: string) {
  testDb
    .prepare(
      `INSERT INTO projects (id, user_id, name, data_path, pinned, created_at, modified_at) VALUES (?, ?, ?, '/tmp/x', 0, '2024-01-01', '2024-01-01')`
    )
    .run(id, owner, `Project ${id}`);
}

beforeEach(() => {
  migrate();
  for (const table of [
    'project_invites',
    'project_pins',
    'comments',
    'project_members',
    'bookmarks',
    'sessions',
    'projects',
    'instance_settings',
    'users'
  ])
    testDb.exec(`DELETE FROM ${table}`);
  user('alice', true);
  user('bob');
  project('p1', 'alice');
});

describe('admin actions', () => {
  it('lists users with project counts', () => {
    const rows = listUsers();
    expect(rows.map((u) => [u.username, u.isAdmin, u.ownedProjects])).toEqual([
      ['alice', true, 1],
      ['bob', false, 0]
    ]);
  });

  it('keeps at least one active administrator', () => {
    expect(() => setAdmin('alice', 'alice', false)).toThrow(AccountError);
    expect(() => setDisabled('bob', 'alice', true)).toThrow(AccountError);
    setAdmin('alice', 'bob', true);
    setDisabled('bob', 'alice', true);
    expect(listUsers().find((u) => u.id === 'alice')?.disabled).toBe(true);
  });

  it('refuses to disable yourself and logs disabled users out', () => {
    expect(() => setDisabled('alice', 'alice', true)).toThrow('own account');
    testDb.exec(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('s', 'bob', 9999999999)`);
    setDisabled('alice', 'bob', true);
    expect(testDb.prepare('SELECT count(*) n FROM sessions').get().n).toBe(0);
  });

  it('resets a password to a one-time temporary password', async () => {
    const temporary = await resetPassword('bob');
    const row = testDb.prepare(`SELECT * FROM users WHERE id = 'bob'`).get();
    expect(row.must_change_password).toBe(1);
    expect(await verify(temporary, row.password_hash)).toBe(true);
  });
});

describe('deleteAccount', () => {
  it('refuses while the user owns projects', () => {
    expect(() => deleteAccount('alice')).toThrow(/Delete your projects first/);
  });

  it('removes memberships, pins, and comments with the user', () => {
    testDb.exec(
      `INSERT INTO project_members (id, project_id, user_id, role, created_at) VALUES ('m', 'p1', 'bob', 'editor', 'now')`
    );
    testDb.exec(
      `INSERT INTO comments (id, project_id, target_type, target_id, user_id, body, created_at) VALUES ('c', 'p1', 'entity', 'e', 'bob', 'hi', 'now')`
    );
    togglePin('bob', 'p1');
    deleteAccount('bob');
    expect(testDb.prepare(`SELECT count(*) n FROM users WHERE id = 'bob'`).get().n).toBe(0);
    expect(testDb.prepare('SELECT count(*) n FROM project_members').get().n).toBe(0);
    expect(testDb.prepare('SELECT count(*) n FROM project_pins').get().n).toBe(0);
  });
});

describe('pins', () => {
  it('are per user, so members can pin shared projects', () => {
    expect(togglePin('bob', 'p1')).toBe(true);
    expect(pinnedProjectIds('bob').has('p1')).toBe(true);
    expect(pinnedProjectIds('alice').has('p1')).toBe(false);
    expect(togglePin('bob', 'p1')).toBe(false);
  });
});

describe('invites', () => {
  it('lets a new user join with the invite role until it expires or is revoked', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const invite = createInvite('p1', 'alice', 'commenter', 7, now);
    expect(listInvites('p1', now)).toHaveLength(1);
    expect(findInvite(invite.token, now + 8 * 86_400_000)).toBeNull();
    expect(acceptInvite(invite.token, 'bob', now)).toBe('p1');
    expect(getProjectAccess('p1', 'bob')?.role).toBe('commenter');
    revokeInvite('p1', invite.token);
    expect(findInvite(invite.token, now)).toBeNull();
  });

  it('never downgrades or changes the owner', () => {
    const now = Date.now();
    const editor = createInvite('p1', 'alice', 'editor', 7, now);
    const commenter = createInvite('p1', 'alice', 'commenter', 7, now);
    acceptInvite(editor.token, 'bob', now);
    acceptInvite(commenter.token, 'bob', now);
    expect(getProjectAccess('p1', 'bob')?.role).toBe('editor');
    acceptInvite(editor.token, 'alice', now);
    expect(getProjectAccess('p1', 'alice')?.role).toBe('owner');
  });
});

describe('registration mode', () => {
  it('stores an override and can return to the environment default', () => {
    expect(registrationMode()).toBe('default');
    setRegistrationMode('closed');
    expect(registrationMode()).toBe('closed');
    setRegistrationMode('default');
    expect(registrationMode()).toBe('default');
  });
});
