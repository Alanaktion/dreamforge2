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
import { applyPreset, createSampleWorld, isPreset } from '../starter';
import { getGettingStarted, getProjectStats } from '../stats';
import { listPlotlines } from '../plots';
import { loadRelations } from '../relations';
import { loadTimeline } from '../timelines';
import { generateId } from '$lib/utils';

let projectId: string;
let tmpDir: string;

beforeEach(() => {
  migrate();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-starter-'));
  const userId = generateId();
  projectId = generateId();
  testDb.exec(
    `INSERT INTO users (id, email, username, password_hash, created_at) VALUES ('${userId}', '${userId}@test.com', 'user-${userId.slice(0, 8)}', 'hash', '2024-01-01')`
  );
  testDb.exec(
    `INSERT INTO projects (id, user_id, name, description, data_path, pinned, created_at, modified_at) VALUES ('${projectId}', '${userId}', 'Test', null, '${tmpDir}', 0, '2024-01-01', '2024-01-01')`
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('isPreset', () => {
  it('accepts known presets only', () => {
    expect(isPreset('novel')).toBe(true);
    expect(isPreset('toString')).toBe(false);
    expect(isPreset(null)).toBe(false);
  });
});

describe('applyPreset', () => {
  it('leaves a blank project empty', () => {
    applyPreset(projectId, tmpDir, 'blank');
    const stats = getProjectStats(projectId, tmpDir);
    expect(stats.storyCount).toBe(0);
    expect(stats.totalEntities).toBe(0);
  });

  it('seeds a novel with a story, a plotline, and a story bible', () => {
    applyPreset(projectId, tmpDir, 'novel');
    const stats = getProjectStats(projectId, tmpDir);
    expect(stats.storyCount).toBe(1);
    expect(stats.sceneCount).toBe(1);
    expect(stats.entityCounts.note).toBe(1);
    const [plot] = listPlotlines(tmpDir);
    expect(plot.title).toBe('Main plot');
    expect(plot.beats.length).toBeGreaterThan(10);
  });

  it('seeds a campaign with a session log and notes', () => {
    applyPreset(projectId, tmpDir, 'campaign');
    const stats = getProjectStats(projectId, tmpDir);
    expect(stats.stories[0].title).toBe('Session log');
    expect(stats.entityCounts.note).toBe(2);
  });
});

describe('createSampleWorld', () => {
  it('creates a world that completes the getting-started checklist', () => {
    createSampleWorld(projectId, tmpDir);
    const stats = getProjectStats(projectId, tmpDir);
    expect(stats.entityCounts.character).toBe(3);
    expect(stats.entityCounts.location).toBe(2);
    expect(stats.chapterCount).toBe(2);
    expect(stats.wordCount).toBeGreaterThan(20);
    expect(loadRelations(tmpDir).length).toBe(4);
    expect(loadTimeline(tmpDir).events.length).toBe(2);
    expect(listPlotlines(tmpDir)[0].beats.filter((b) => b.sceneId).length).toBe(2);
    expect(getGettingStarted(stats, tmpDir)).toEqual({
      character: true,
      scene: true,
      relation: true,
      mention: true
    });
  });
});
