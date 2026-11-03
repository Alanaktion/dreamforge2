import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
  listEntities,
  getEntity,
  createEntity,
  updateEntity,
  deleteEntity,
  duplicateEntity,
  generateUniqueSlug,
  resolveEntityPath,
  searchEntities,
  syncEntityToDb,
  ENTITY_DIRS
} from '../entities';
import { generateId } from '$lib/utils';
import { readMarkdownFile, writeMarkdownFile } from '../markdown';
import { fileRevision, ConflictError } from '../storage';

let tmpDir: string;
let TEST_PROJECT_ID: string;

function createProjectDirs(basePath: string) {
  for (const dir of Object.values(ENTITY_DIRS)) {
    fs.mkdirSync(path.join(basePath, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(basePath, 'notes', '_project'), { recursive: true });
}

function insertTestProject() {
  const userId = generateId();
  TEST_PROJECT_ID = generateId();
  const username = `user-${userId.slice(0, 8)}`;
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${userId}', '${userId}@test.com', '${username}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, description, data_path, pinned, created_at, modified_at) VALUES ('${TEST_PROJECT_ID}', '${userId}', 'Test', null, '${tmpDir}', 0, '2024-01-01', '2024-01-01')`
  );
}

function writeEntityFile(dirPath: string, slug: string, overrides: Record<string, unknown> = {}) {
  const frontmatter: Record<string, unknown> = {
    id: (overrides.id as string) || generateId(),
    name: (overrides.name as string) || 'Test Entity',
    slug,
    type: (overrides.type as string) || 'character',
    tags: (overrides.tags as string[]) || [],
    status: (overrides.status as string) || 'draft',
    imagePath: null,
    created: (overrides.created as string) || '2024-01-01T00:00:00.000Z',
    modified: (overrides.modified as string) || '2024-01-01T00:00:00.000Z',
    ...overrides
  };
  const body = (overrides.body as string) || 'Entity body';
  writeMarkdownFile(path.join(dirPath, `${slug}.md`), frontmatter, body);
  return frontmatter;
}

beforeAll(() => {
  migrate();
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-entities-'));
  createProjectDirs(tmpDir);
  insertTestProject();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateUniqueSlug', () => {
  it('generates slug from name', () => {
    const slug = generateUniqueSlug(tmpDir, 'character', 'My Hero');
    expect(slug).toBe('my-hero');
  });

  it('returns "untitled" for empty name', () => {
    const slug = generateUniqueSlug(tmpDir, 'character', '');
    expect(slug).toBe('untitled');
  });

  it('returns "untitled" for name with only special chars', () => {
    const slug = generateUniqueSlug(tmpDir, 'character', '@#$%');
    expect(slug).toBe('untitled');
  });

  it('strips slashes from slug', () => {
    const slug = generateUniqueSlug(tmpDir, 'location', 'a/b/c');
    expect(slug).toBe('abc');
  });

  it('appends counter when slug exists', () => {
    const dir = path.join(tmpDir, 'characters');
    writeEntityFile(dir, 'test-entity');
    const slug2 = generateUniqueSlug(tmpDir, 'character', 'Test Entity');
    expect(slug2).toBe('test-entity-1');
  });

  it('increments counter until unique', () => {
    const dir = path.join(tmpDir, 'characters');
    writeEntityFile(dir, 'my-entity');
    writeEntityFile(dir, 'my-entity-1');
    writeEntityFile(dir, 'my-entity-2');
    const slug = generateUniqueSlug(tmpDir, 'character', 'My Entity');
    expect(slug).toBe('my-entity-3');
  });

  it('excludes given id from collision check', () => {
    const dir = path.join(tmpDir, 'characters');
    const fm = writeEntityFile(dir, 'my-entity');
    const slug = generateUniqueSlug(tmpDir, 'character', 'My Entity', fm.id as string);
    expect(slug).toBe('my-entity');
  });

  it('creates slug when directory does not exist', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-empty-'));
    const slug = generateUniqueSlug(emptyDir, 'character', 'New Entity');
    expect(slug).toBe('new-entity');
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('resolveEntityPath', () => {
  it('returns null when directory does not exist', () => {
    const result = resolveEntityPath('/nonexistent', 'character', 'any-id');
    expect(result).toBeNull();
  });

  it('resolves by DB slug', () => {
    const dir = path.join(tmpDir, 'characters');
    const fm = writeEntityFile(dir, 'my-hero');
    syncEntityToDb(TEST_PROJECT_ID, 'character', fm.id as string, fm);

    const resolved = resolveEntityPath(tmpDir, 'character', fm.id as string);
    expect(resolved).toBe(path.join(dir, 'my-hero.md'));
  });

  it('resolves by scanning directory when DB slug is stale', () => {
    const dir = path.join(tmpDir, 'characters');
    const fm = writeEntityFile(dir, 'my-hero');
    const resolved = resolveEntityPath(tmpDir, 'character', fm.id as string);
    expect(resolved).toBe(path.join(dir, 'my-hero.md'));
  });

  it('resolves by id-as-filename fallback', () => {
    const dir = path.join(tmpDir, 'characters');
    const id = generateId();
    writeEntityFile(dir, id, { id });
    const resolved = resolveEntityPath(tmpDir, 'character', id);
    expect(resolved).toBe(path.join(dir, `${id}.md`));
  });

  it('returns null when entity not found', () => {
    const result = resolveEntityPath(tmpDir, 'character', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('listEntities', () => {
  it('returns empty array when no entities exist', () => {
    const result = listEntities(TEST_PROJECT_ID, tmpDir, 'character');
    expect(result).toEqual([]);
  });

  it('returns all entities of given type', () => {
    const dir = path.join(tmpDir, 'characters');
    writeEntityFile(dir, 'hero', { name: 'Hero', id: generateId() });
    writeEntityFile(dir, 'villain', { name: 'Villain', id: generateId() });
    const locDir = path.join(tmpDir, 'locations');
    writeEntityFile(locDir, 'forest', { name: 'Forest', id: generateId(), type: 'location' });

    const characters = listEntities(TEST_PROJECT_ID, tmpDir, 'character');
    expect(characters).toHaveLength(2);
    expect(characters.map((e) => e.name).sort()).toEqual(['Hero', 'Villain']);
  });

  it('returns entities sorted by modifiedAt descending', () => {
    const dir = path.join(tmpDir, 'characters');
    writeEntityFile(dir, 'old', {
      id: generateId(),
      name: 'Old',
      modified: '2023-01-01T00:00:00.000Z'
    });
    writeEntityFile(dir, 'new', {
      id: generateId(),
      name: 'New',
      modified: '2024-01-01T00:00:00.000Z'
    });

    const result = listEntities(TEST_PROJECT_ID, tmpDir, 'character');
    expect(result[0].name).toBe('New');
    expect(result[1].name).toBe('Old');
  });

  it('returns empty array when directory does not exist', () => {
    const result = listEntities(TEST_PROJECT_ID, '/nonexistent', 'character');
    expect(result).toEqual([]);
  });

  it('returns entity with correct shape', () => {
    const dir = path.join(tmpDir, 'characters');
    const fm = writeEntityFile(dir, 'hero', {
      id: generateId(),
      name: 'Hero',
      tags: ['brave', 'strong'],
      status: 'wip'
    });

    const result = listEntities(TEST_PROJECT_ID, tmpDir, 'character');
    expect(result[0]).toMatchObject({
      id: fm.id,
      projectId: TEST_PROJECT_ID,
      type: 'character',
      name: 'Hero',
      tags: ['brave', 'strong'],
      status: 'wip',
      imagePath: null
    });
    expect(result[0].body).toBeTruthy();
    expect(result[0].frontmatter).toBeTruthy();
  });
});

describe('getEntity', () => {
  it('returns null for non-existent entity', () => {
    const result = getEntity(TEST_PROJECT_ID, tmpDir, 'character', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns entity data', () => {
    const dir = path.join(tmpDir, 'characters');
    const fm = writeEntityFile(dir, 'hero', { id: generateId(), name: 'Hero' });

    const result = getEntity(TEST_PROJECT_ID, tmpDir, 'character', fm.id as string);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(fm.id);
    expect(result!.name).toBe('Hero');
    expect(result!.body).toContain('Entity body');
  });

  it('skips an item with missing frontmatter without rewriting it', () => {
    const dir = path.join(tmpDir, 'characters');
    const id = generateId();
    fs.writeFileSync(path.join(dir, `${id}.md`), 'not valid markdown with frontmatter');
    const result = getEntity(TEST_PROJECT_ID, tmpDir, 'character', id);
    expect(result).toBeNull();
    expect(fs.readFileSync(path.join(dir, `${id}.md`), 'utf8')).toBe(
      'not valid markdown with frontmatter'
    );
  });
});

describe('createEntity', () => {
  it('creates an entity file and DB record', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'New Hero' });
    expect(entity.id).toBeTruthy();
    expect(entity.name).toBe('New Hero');
    expect(entity.type).toBe('character');
    expect(entity.status).toBe('draft');
    expect(entity.body).toBe('');
    expect(entity.projectId).toBe(TEST_PROJECT_ID);

    const filePath = path.join(tmpDir, 'characters', `${entity.frontmatter.slug}.md`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('creates entity with custom fields', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      body: 'Backstory text',
      tags: ['brave'],
      age: 30,
      occupation: 'Knight'
    });
    expect(entity.body).toBe('Backstory text');
    expect(entity.tags).toEqual(['brave']);
    expect(entity.frontmatter.age).toBe(30);
    expect(entity.frontmatter.occupation).toBe('Knight');
  });

  it('creates directory if it does not exist', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-fresh-'));
    createEntity(TEST_PROJECT_ID, freshDir, 'character', { name: 'Fresh' });
    expect(fs.existsSync(freshDir)).toBe(true);
    expect(fs.existsSync(path.join(freshDir, 'characters'))).toBe(true);
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it('creates note entities in notes/_project directory', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'note', { name: 'My Note' });
    const noteDir = path.join(tmpDir, 'notes', '_project');
    expect(fs.existsSync(path.join(noteDir, `${entity.frontmatter.slug}.md`))).toBe(true);
  });

  it('writes file with correct frontmatter and body', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Write Check',
      body: 'Body content'
    });
    const filePath = path.join(tmpDir, 'characters', `${entity.frontmatter.slug}.md`);
    const md = readMarkdownFile(filePath);
    expect(md).not.toBeNull();
    expect(md!.body.trim()).toBe('Body content');
    expect(md!.frontmatter.name).toBe('Write Check');
    expect(md!.frontmatter.id).toBe(entity.id);
  });
});

describe('updateEntity', () => {
  it('updates entity fields', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Original' });
    const updated = updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, {
      name: 'Updated',
      status: 'wip'
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated');
    expect(updated!.status).toBe('wip');

    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.name).toBe('Updated');
    expect(fetched!.status).toBe('wip');
  });

  it('updates body', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Body Test' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { body: 'New body' });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.body).toContain('New body');
  });

  it('renames file when name changes', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Old Name' });
    const oldPath = path.join(tmpDir, 'characters', 'old-name.md');
    expect(fs.existsSync(oldPath)).toBe(true);

    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { name: 'New Name' });
    const newPath = path.join(tmpDir, 'characters', 'new-name.md');
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  it('returns a revision from create that the first save can use', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Fresh' });
    expect(entity.revision).toBe(fileRevision(path.join(tmpDir, 'characters', 'fresh.md')));
    const updated = updateEntity(
      TEST_PROJECT_ID,
      tmpDir,
      'character',
      entity.id,
      { status: 'wip' },
      entity.revision
    );
    expect(updated!.status).toBe('wip');
  });

  it('renames atomically, keeping one file per id', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Vess' });
    const updated = updateEntity(
      TEST_PROJECT_ID,
      tmpDir,
      'character',
      entity.id,
      { name: 'Vessa', body: 'renamed' },
      entity.revision
    );
    const dir = path.join(tmpDir, 'characters');
    expect(fs.readdirSync(dir)).toEqual(['vessa.md']);
    expect(updated!.revision).toBe(fileRevision(path.join(dir, 'vessa.md')));
    expect(readMarkdownFile(path.join(dir, 'vessa.md'))!.body).toBe('renamed');
  });

  it('refuses a stale save, including a rename, and leaves the file alone', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Stale' });
    const file = path.join(tmpDir, 'characters', 'stale.md');
    fs.appendFileSync(file, 'edited on disk');
    expect(() =>
      updateEntity(
        TEST_PROJECT_ID,
        tmpDir,
        'character',
        entity.id,
        { name: 'Fresh' },
        entity.revision
      )
    ).toThrow(ConflictError);
    expect(() =>
      updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { status: 'wip' }, '')
    ).toThrow(ConflictError);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['stale.md']);
    expect(fs.readFileSync(file, 'utf8')).toContain('edited on disk');
  });

  it('returns null for non-existent entity', () => {
    const result = updateEntity(TEST_PROJECT_ID, tmpDir, 'character', 'nonexistent', {
      name: 'Nope'
    });
    expect(result).toBeNull();
  });
});

describe('deleteEntity', () => {
  it('deletes entity file and DB record', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Delete Me' });
    const filePath = path.join(tmpDir, 'characters', `${entity.frontmatter.slug}.md`);
    expect(fs.existsSync(filePath)).toBe(true);

    const result = deleteEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(result).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('returns false for non-existent entity', () => {
    const result = deleteEntity(TEST_PROJECT_ID, tmpDir, 'character', 'nonexistent');
    expect(result).toBe(false);
  });
});

describe('searchEntities', () => {
  it('returns all entities when no query filter', () => {
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Villain' });
    const results = searchEntities(TEST_PROJECT_ID, '');
    expect(results).toHaveLength(2);
  });

  it('filters by name query', () => {
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Villain' });
    const results = searchEntities(TEST_PROJECT_ID, 'Hero');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Hero');
  });

  it('filters by entity type', () => {
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    createEntity(TEST_PROJECT_ID, tmpDir, 'location', { name: 'Forest' });
    const results = searchEntities(TEST_PROJECT_ID, '', 'character');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('character');
  });

  it('combines query and type filter', () => {
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    createEntity(TEST_PROJECT_ID, tmpDir, 'location', { name: 'Hero Mountain' });
    const results = searchEntities(TEST_PROJECT_ID, 'Hero', 'character');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('character');
  });

  it('returns empty array when no match', () => {
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    const results = searchEntities(TEST_PROJECT_ID, 'Zzz', 'character');
    expect(results).toEqual([]);
  });
});

describe('createEntity - all entity types', () => {
  const entityTypes = [
    'character',
    'organization',
    'location',
    'culture',
    'species',
    'item',
    'note'
  ] as const;

  for (const type of entityTypes) {
    it(`creates ${type} entity and persists to disk`, () => {
      const entity = createEntity(TEST_PROJECT_ID, tmpDir, type, { name: `Test ${type}` });
      expect(entity.id).toBeTruthy();
      expect(entity.type).toBe(type);
      expect(entity.name).toBe(`Test ${type}`);

      const fetched = getEntity(TEST_PROJECT_ID, tmpDir, type, entity.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(entity.id);
      expect(fetched!.name).toBe(`Test ${type}`);
      expect(fetched!.type).toBe(type);
      expect(fetched!.status).toBe('draft');
      expect(fetched!.tags).toEqual([]);
    });
  }
});

describe('createEntity - field persistence', () => {
  it('persists tags to disk and reads them back as an array', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Tagged Hero',
      tags: ['brave', 'strong']
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.tags).toEqual(['brave', 'strong']);
  });

  it('persists status to disk', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    expect(entity.status).toBe('draft');
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.status).toBe('draft');
  });

  it('persists custom text fields to disk', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      personalityType: 'INTJ'
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.frontmatter.personalityType).toBe('INTJ');
  });

  it('persists custom textarea fields to disk', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      motivations: 'Revenge and justice'
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.frontmatter.motivations).toBe('Revenge and justice');
  });

  it('persists multiline textarea fields to disk without data loss', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      motivations: 'Line one\nLine two\nLine three'
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.frontmatter.motivations).toBe('Line one\nLine two\nLine three');
  });

  it('persists tag-type entity fields (traits) as arrays', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      traits: ['brave', 'cunning']
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.frontmatter.traits).toEqual(['brave', 'cunning']);
  });
});

describe('updateEntity - field persistence', () => {
  it('persists updated tags as array', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { tags: ['epic', 'wise'] });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.tags).toEqual(['epic', 'wise']);
  });

  it('persists updated status', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { status: 'complete' });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.status).toBe('complete');
  });

  it('persists tag-type fields as arrays', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, {
      traits: ['brave', 'strong']
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.frontmatter.traits).toEqual(['brave', 'strong']);
  });

  it('preserves existing tag-type fields as arrays after re-read', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      traits: ['brave']
    });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, {
      traits: ['brave', 'cunning']
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(Array.isArray(fetched!.frontmatter.traits)).toBe(true);
    expect(fetched!.frontmatter.traits).toEqual(['brave', 'cunning']);
  });

  it('persists multiline field content without data loss', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Hero' });
    const backstory = 'Born in the north.\nTrained by monks.\nSeeking redemption.';
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { backstory });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.frontmatter.backstory).toBe(backstory);
  });

  it('preserves all fields across multiple updates', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Hero',
      tags: ['warrior'],
      traits: ['brave'],
      motivations: 'Protect the realm'
    });

    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { status: 'wip' });

    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id);
    expect(fetched!.name).toBe('Hero');
    expect(fetched!.tags).toEqual(['warrior']);
    expect(fetched!.frontmatter.traits).toEqual(['brave']);
    expect(fetched!.frontmatter.motivations).toBe('Protect the realm');
    expect(fetched!.status).toBe('wip');
  });

  it('persists location fields', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'location', { name: 'Dark Forest' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'location', entity.id, {
      geology: 'Rocky terrain\nAncient stone',
      landOwnership: 'Crown land'
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'location', entity.id);
    expect(fetched!.frontmatter.geology).toBe('Rocky terrain\nAncient stone');
    expect(fetched!.frontmatter.landOwnership).toBe('Crown land');
  });

  it('persists culture tag-type fields (languages) as arrays', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'culture', { name: 'Elves' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'culture', entity.id, {
      languages: ['Elvish', 'Common']
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'culture', entity.id);
    expect(fetched!.frontmatter.languages).toEqual(['Elvish', 'Common']);
  });

  it('persists species tag-type fields as arrays', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'species', { name: 'Dragon' });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'species', entity.id, {
      traits: ['fire-breathing', 'flying'],
      subtypes: ['red', 'black']
    });
    const fetched = getEntity(TEST_PROJECT_ID, tmpDir, 'species', entity.id);
    expect(Array.isArray(fetched!.frontmatter.traits)).toBe(true);
    expect(fetched!.frontmatter.traits).toEqual(['fire-breathing', 'flying']);
    expect(Array.isArray(fetched!.frontmatter.subtypes)).toBe(true);
    expect(fetched!.frontmatter.subtypes).toEqual(['red', 'black']);
  });
});

describe('syncEntityToDb', () => {
  it('creates a new DB record if none exists', () => {
    const id = generateId();
    const frontmatter = {
      id,
      name: 'DB Test',
      slug: 'db-test',
      type: 'character',
      tags: ['a', 'b'],
      status: 'wip',
      imagePath: null,
      created: '2024-01-01T00:00:00.000Z',
      modified: '2024-01-02T00:00:00.000Z'
    };
    syncEntityToDb(TEST_PROJECT_ID, 'character', id, frontmatter);

    const results = searchEntities(TEST_PROJECT_ID, 'DB Test');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(id);
    expect(results[0].name).toBe('DB Test');
    expect(results[0].status).toBe('wip');
  });

  it('updates existing DB record', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Update Me' });
    syncEntityToDb(TEST_PROJECT_ID, 'character', entity.id, {
      ...entity.frontmatter,
      name: 'Updated Name',
      status: 'complete'
    });

    const results = searchEntities(TEST_PROJECT_ID, 'Updated Name');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('complete');
  });
});

describe('duplicateEntity', () => {
  it('returns null for an unknown entity', () => {
    expect(duplicateEntity(TEST_PROJECT_ID, tmpDir, 'character', 'nope')).toBeNull();
  });

  it('copies the body, tags, status, and custom fields under a new id and name', () => {
    const original = createEntity(TEST_PROJECT_ID, tmpDir, 'character', {
      name: 'Holly',
      body: 'A long backstory.',
      tags: ['rebel', 'pilot'],
      motivations: 'Find her brother'
    });
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', original.id, { status: 'wip' });

    const copy = duplicateEntity(TEST_PROJECT_ID, tmpDir, 'character', original.id)!;

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Holly (Copy)');
    expect(copy.body.trim()).toBe('A long backstory.');
    expect(copy.tags).toEqual(['rebel', 'pilot']);
    expect(copy.frontmatter.motivations).toBe('Find her brother');
    expect(copy.frontmatter.status).toBe('wip');
  });

  it('writes the copy to its own file and leaves the original intact', () => {
    const original = createEntity(TEST_PROJECT_ID, tmpDir, 'location', { name: 'Hollow Keep' });
    const copy = duplicateEntity(TEST_PROJECT_ID, tmpDir, 'location', original.id)!;

    const files = fs.readdirSync(path.join(tmpDir, 'locations')).sort();
    expect(files).toEqual(['hollow-keep-copy.md', 'hollow-keep.md']);
    expect(getEntity(TEST_PROJECT_ID, tmpDir, 'location', original.id)?.name).toBe('Hollow Keep');
    expect(getEntity(TEST_PROJECT_ID, tmpDir, 'location', copy.id)?.name).toBe(
      'Hollow Keep (Copy)'
    );
  });

  it('does not collide when duplicated twice', () => {
    const original = createEntity(TEST_PROJECT_ID, tmpDir, 'item', { name: 'Lantern' });
    const first = duplicateEntity(TEST_PROJECT_ID, tmpDir, 'item', original.id)!;
    const second = duplicateEntity(TEST_PROJECT_ID, tmpDir, 'item', original.id)!;

    expect(first.id).not.toBe(second.id);
    expect(fs.readdirSync(path.join(tmpDir, 'items')).sort()).toEqual([
      'lantern-copy-1.md',
      'lantern-copy.md',
      'lantern.md'
    ]);
  });
});

describe('data safety regressions', () => {
  it('renames an existing file without a slug without leaving a duplicate', () => {
    const file = path.join(tmpDir, 'characters', 'vess.md');
    const id = generateId();
    writeMarkdownFile(file, { id, name: 'Vess', type: 'character' }, 'Body');
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', id, { name: 'Vess renamed' });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['vess-renamed.md']);
    expect(getEntity(TEST_PROJECT_ID, tmpDir, 'character', id)?.frontmatter.slug).toBe(
      'vess-renamed'
    );
  });

  it('keeps identical entity IDs independent in two projects', () => {
    const firstProject = TEST_PROJECT_ID;
    insertTestProject();
    const secondProject = TEST_PROJECT_ID;
    const id = generateId();
    syncEntityToDb(firstProject, 'character', id, { name: 'First' });
    syncEntityToDb(secondProject, 'character', id, { name: 'Second' });
    syncEntityToDb(secondProject, 'character', id, { name: 'Second updated' });
    expect(searchEntities(firstProject, '').find((entity) => entity.id === id)?.name).toBe('First');
    expect(searchEntities(secondProject, '').find((entity) => entity.id === id)?.name).toBe(
      'Second updated'
    );
  });

  it('rejects a stale save while retaining the newer file', () => {
    const entity = createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: '[Untitled]' });
    const loaded = getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id)!;
    updateEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id, { body: 'external' });
    expect(() =>
      updateEntity(
        TEST_PROJECT_ID,
        tmpDir,
        'character',
        entity.id,
        { body: 'stale' },
        loaded.revision
      )
    ).toThrow('changed elsewhere');
    expect(getEntity(TEST_PROJECT_ID, tmpDir, 'character', entity.id)?.body).toBe('external');
  });
});

describe('project scans', () => {
  it('continues past an invalid file and safely indexes legacy scalar names', async () => {
    const { scanProject } = await import('../watcher');
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(path.join(tmpDir, 'characters', 'bad.md'), '---\nid: bad\nname: [\n---\n');
    fs.writeFileSync(
      path.join(tmpDir, 'characters', 'legacy.md'),
      '---\nid: legacy\nname: [Untitled]\n---\n'
    );
    createEntity(TEST_PROJECT_ID, tmpDir, 'character', { name: 'Good' });
    expect(() => scanProject(TEST_PROJECT_ID, tmpDir)).not.toThrow();
    expect(
      searchEntities(TEST_PROJECT_ID, '')
        .map((entity) => entity.name)
        .sort()
    ).toEqual(['Good', 'Untitled']);
    logger.mockRestore();
  });
});
