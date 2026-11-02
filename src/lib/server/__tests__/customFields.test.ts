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
import {
  getCustomFieldDefs,
  setCustomFieldDefs,
  addCustomFieldDef,
  deleteCustomFieldDef
} from '../customFields';
import { generateId } from '$lib/utils';

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-metadata-'));
afterAll(() => fs.rmSync(testRoot, { recursive: true, force: true }));

function seedProject(): string {
  const userId = generateId();
  const projectId = generateId();
  const username = `user-${userId.slice(0, 8)}`;
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${userId}', '${userId}@test.com', '${username}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, description, data_path, pinned, created_at, modified_at) VALUES ('${projectId}', '${userId}', 'Test', null, '${path.join(testRoot, projectId)}', 0, '2024-01-01', '2024-01-01')`
  );
  return projectId;
}

beforeAll(() => {
  migrate();
});

describe('getCustomFieldDefs', () => {
  it('returns empty array when no fields exist', () => {
    const projectId = seedProject();
    expect(getCustomFieldDefs(projectId)).toEqual([]);
  });

  it('returns fields for a project', () => {
    const projectId = seedProject();
    setCustomFieldDefs(projectId, [
      {
        entityType: 'character' as const,
        key: 'age',
        label: 'Age',
        fieldType: 'number' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      }
    ]);

    const result = getCustomFieldDefs(projectId);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('age');
  });

  it('filters by entityType', () => {
    const projectId = seedProject();
    setCustomFieldDefs(projectId, [
      {
        entityType: 'character' as const,
        key: 'age',
        label: 'Age',
        fieldType: 'number' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      },
      {
        entityType: 'location' as const,
        key: 'climate',
        label: 'Climate',
        fieldType: 'text' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      }
    ]);

    const chars = getCustomFieldDefs(projectId, 'character');
    expect(chars).toHaveLength(1);
    expect(chars[0].key).toBe('age');

    const locs = getCustomFieldDefs(projectId, 'location');
    expect(locs).toHaveLength(1);
    expect(locs[0].key).toBe('climate');
  });

  it('returns fields ordered by sortOrder', () => {
    const projectId = seedProject();
    setCustomFieldDefs(projectId, [
      {
        entityType: 'character' as const,
        key: 'a',
        label: 'A',
        fieldType: 'text' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      },
      {
        entityType: 'character' as const,
        key: 'z',
        label: 'Z',
        fieldType: 'text' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 1
      }
    ]);

    const result = getCustomFieldDefs(projectId, 'character');
    expect(result[0].key).toBe('a');
    expect(result[1].key).toBe('z');
  });

  it('does not return fields from other projects', () => {
    const p1 = seedProject();
    const p2 = seedProject();
    setCustomFieldDefs(p1, [
      {
        entityType: 'character' as const,
        key: 'age',
        label: 'Age',
        fieldType: 'number' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      }
    ]);
    expect(getCustomFieldDefs(p2)).toEqual([]);
  });
});

describe('setCustomFieldDefs', () => {
  it('replaces all existing fields', () => {
    const projectId = seedProject();
    setCustomFieldDefs(projectId, [
      {
        entityType: 'character' as const,
        key: 'age',
        label: 'Age',
        fieldType: 'number' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      }
    ]);
    expect(getCustomFieldDefs(projectId)).toHaveLength(1);

    setCustomFieldDefs(projectId, [
      {
        entityType: 'location' as const,
        key: 'climate',
        label: 'Climate',
        fieldType: 'text' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      }
    ]);
    expect(getCustomFieldDefs(projectId)).toHaveLength(1);
    expect(getCustomFieldDefs(projectId)[0].key).toBe('climate');
  });

  it('assigns sequential sortOrder', () => {
    const projectId = seedProject();
    const defs = [
      {
        entityType: 'character' as const,
        key: 'a',
        label: 'A',
        fieldType: 'text' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 99
      },
      {
        entityType: 'character' as const,
        key: 'b',
        label: 'B',
        fieldType: 'text' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 99
      }
    ];
    const result = setCustomFieldDefs(projectId, defs);
    expect(result[0].sortOrder).toBe(0);
    expect(result[1].sortOrder).toBe(1);
  });

  it('returns the created records', () => {
    const projectId = seedProject();
    const result = setCustomFieldDefs(projectId, [
      {
        entityType: 'character' as const,
        key: 'age',
        label: 'Age',
        fieldType: 'number' as const,
        refEntityType: null,
        placeholder: null,
        required: false,
        sortOrder: 0
      }
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBeTruthy();
    expect(result[0].projectId).toBe(projectId);
  });
});

describe('addCustomFieldDef', () => {
  it('adds a single field', () => {
    const projectId = seedProject();
    const result = addCustomFieldDef(projectId, 'character', {
      key: 'age',
      label: 'Age',
      fieldType: 'number'
    });
    expect(result.id).toBeTruthy();
    expect(result.key).toBe('age');
    expect(result.sortOrder).toBe(0);
  });

  it('appends to existing fields', () => {
    const projectId = seedProject();
    addCustomFieldDef(projectId, 'character', { key: 'first', label: 'First', fieldType: 'text' });
    addCustomFieldDef(projectId, 'character', {
      key: 'second',
      label: 'Second',
      fieldType: 'text'
    });
    const result = getCustomFieldDefs(projectId, 'character');
    expect(result).toHaveLength(2);
    expect(result[1].sortOrder).toBe(1);
  });
});

describe('deleteCustomFieldDef', () => {
  it('deletes an existing field', () => {
    const projectId = seedProject();
    const added = addCustomFieldDef(projectId, 'character', {
      key: 'age',
      label: 'Age',
      fieldType: 'number'
    });
    const deleted = deleteCustomFieldDef(projectId, added.id);
    expect(deleted).toBe(true);
    expect(getCustomFieldDefs(projectId, 'character')).toEqual([]);
  });

  it('returns false for non-existent field', () => {
    const projectId = seedProject();
    expect(deleteCustomFieldDef(projectId, 'nonexistent')).toBe(false);
  });

  it('only deletes from the correct project', () => {
    const p1 = seedProject();
    const p2 = seedProject();
    const added = addCustomFieldDef(p1, 'character', {
      key: 'age',
      label: 'Age',
      fieldType: 'number'
    });
    const deleted = deleteCustomFieldDef(p2, added.id);
    expect(deleted).toBe(false);
    expect(getCustomFieldDefs(p1, 'character')).toHaveLength(1);
  });
});
