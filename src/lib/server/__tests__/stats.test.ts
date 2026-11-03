import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  return { testDb: new Database(':memory:') };
});

vi.mock('../db', () => ({ default: testDb }));

import { migrate } from '../migrate';
import { getGettingStarted, getProjectStats, getProjectSummary } from '../stats';
import { addRelation } from '../relations';
import { createEntity, ENTITY_DIRS } from '../entities';
import { createStory, createChapter, createScene, updateScene } from '../stories';
import { generateId } from '$lib/utils';

let PROJECT_ID: string;
let tmpDir: string;

function insertTestProject() {
  const userId = generateId();
  PROJECT_ID = generateId();
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${userId}', '${userId}@test.com', 'user-${userId.slice(0, 8)}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, description, data_path, pinned, created_at, modified_at) VALUES ('${PROJECT_ID}', '${userId}', 'Test', null, '${tmpDir}', 0, '2024-01-01', '2024-01-01')`
  );
}

beforeEach(() => {
  migrate();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stats-'));
  insertTestProject();
  for (const dir of Object.values(ENTITY_DIRS)) {
    fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(tmpDir, 'notes', '_project'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'stories'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getProjectStats', () => {
  it('reports zeroes for an empty project', () => {
    const stats = getProjectStats(PROJECT_ID, tmpDir);
    expect(stats.wordCount).toBe(0);
    expect(stats.sceneCount).toBe(0);
    expect(stats.storyCount).toBe(0);
    expect(stats.totalEntities).toBe(0);
    expect(stats.lastScene).toBeNull();
    expect(stats.recent).toEqual([]);
  });

  it('counts entities per type', () => {
    createEntity(PROJECT_ID, tmpDir, 'character', { name: 'Holly' });
    createEntity(PROJECT_ID, tmpDir, 'character', { name: 'Milo' });
    createEntity(PROJECT_ID, tmpDir, 'location', { name: 'Hollow Keep' });

    const stats = getProjectStats(PROJECT_ID, tmpDir);
    expect(stats.entityCounts.character).toBe(2);
    expect(stats.entityCounts.location).toBe(1);
    expect(stats.entityCounts.item).toBe(0);
    expect(stats.totalEntities).toBe(3);
  });

  it('aggregates word, scene, and chapter counts across stories', () => {
    const story = createStory(tmpDir, 'The Long Road');
    const chapter = createChapter(tmpDir, story.id, 'Departure');
    const a = createScene(tmpDir, story.id, chapter.id, 'Leaving');
    const b = createScene(tmpDir, story.id, chapter.id, 'Arriving');
    updateScene(tmpDir, story.id, chapter.id, a.id, { body: 'one two three four five' });
    updateScene(tmpDir, story.id, chapter.id, b.id, { body: '## A heading\n\nsix seven' });

    const stats = getProjectStats(PROJECT_ID, tmpDir);
    expect(stats.storyCount).toBe(1);
    expect(stats.chapterCount).toBe(1);
    expect(stats.sceneCount).toBe(2);
    expect(stats.wordCount).toBe(9);
    expect(stats.stories[0]).toMatchObject({
      title: 'The Long Road',
      sceneCount: 2,
      chapterCount: 1,
      wordCount: 9
    });
  });

  it('points lastScene at the most recently modified scene', () => {
    const story = createStory(tmpDir, 'Two Scenes');
    const chapter = createChapter(tmpDir, story.id, 'One');
    const first = createScene(tmpDir, story.id, chapter.id, 'First');
    const second = createScene(tmpDir, story.id, chapter.id, 'Second');

    updateScene(tmpDir, story.id, chapter.id, second.id, { body: 'x' });
    updateScene(tmpDir, story.id, chapter.id, first.id, {
      body: 'y',
      modifiedAt: new Date(Date.now() + 60_000).toISOString()
    });

    const stats = getProjectStats(PROJECT_ID, tmpDir);
    expect(stats.lastScene?.sceneId).toBe(first.id);
    expect(stats.lastScene?.title).toBe('First');
    expect(stats.lastScene?.storyTitle).toBe('Two Scenes');
  });

  it('falls back to a positional title for untitled scenes', () => {
    const story = createStory(tmpDir, 'Untitled Scenes');
    const chapter = createChapter(tmpDir, story.id, 'One');
    createScene(tmpDir, story.id, chapter.id);

    const stats = getProjectStats(PROJECT_ID, tmpDir);
    expect(stats.lastScene?.title).toBe('Scene 1');
  });

  it('mixes entities and scenes into recent items, newest first', () => {
    createEntity(PROJECT_ID, tmpDir, 'character', { name: 'Holly' });
    const story = createStory(tmpDir, 'A Story');
    const chapter = createChapter(tmpDir, story.id, 'One');
    createScene(tmpDir, story.id, chapter.id, 'Opening');

    const stats = getProjectStats(PROJECT_ID, tmpDir);
    expect(stats.recent.map((r) => r.kind).sort()).toEqual(['entity', 'scene']);
    expect(stats.recent[0].modifiedAt >= stats.recent[1].modifiedAt).toBe(true);

    const scene = stats.recent.find((r) => r.kind === 'scene')!;
    expect(scene.href).toContain(`/stories/${story.id}?scene=`);
    const entity = stats.recent.find((r) => r.kind === 'entity')!;
    expect(entity.href).toContain('/characters/');
  });
});

describe('getProjectSummary', () => {
  it('counts world entries, stories, and words for a project card', () => {
    createEntity(PROJECT_ID, tmpDir, 'character', { name: 'Holly' });
    createEntity(PROJECT_ID, tmpDir, 'note', { name: 'Idea' });
    const story = createStory(tmpDir, 'Road');
    const chapter = createChapter(tmpDir, story.id, 'One');
    const scene = createScene(tmpDir, story.id, chapter.id, 'Start');
    updateScene(tmpDir, story.id, chapter.id, scene.id, { body: 'one two three' });

    expect(getProjectSummary(tmpDir)).toEqual({ entityCount: 2, storyCount: 1, wordCount: 3 });
  });
});

describe('getGettingStarted', () => {
  it('tracks the first character, scene, relation, and mention', () => {
    let steps = getGettingStarted(getProjectStats(PROJECT_ID, tmpDir), tmpDir);
    expect(steps).toEqual({ character: false, scene: false, relation: false, mention: false });

    const holly = createEntity(PROJECT_ID, tmpDir, 'character', { name: 'Holly' });
    const keep = createEntity(PROJECT_ID, tmpDir, 'location', { name: 'Keep' });
    addRelation(tmpDir, {
      sourceId: holly.id,
      targetId: keep.id,
      relationType: 'home',
      label: null
    });
    const story = createStory(tmpDir, 'Road');
    const chapter = createChapter(tmpDir, story.id, 'One');
    const scene = createScene(tmpDir, story.id, chapter.id, 'Start');
    updateScene(tmpDir, story.id, chapter.id, scene.id, {
      body: `[@Holly](mention://character/${holly.id}) walked home.`
    });

    steps = getGettingStarted(getProjectStats(PROJECT_ID, tmpDir), tmpDir);
    expect(steps).toEqual({ character: true, scene: true, relation: true, mention: true });
  });
});
