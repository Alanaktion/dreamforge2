import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  dayKey,
  readWritingLog,
  recordWords,
  setDailyGoal,
  setStoryTarget,
  getWritingProgress,
  DEFAULT_DAILY_GOAL
} from '../writingLog';

let tmpDir: string;

const AT = (iso: string) => new Date(iso);

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-log-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('dayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 6, 28, 23, 30))).toBe('2026-07-28');
    expect(dayKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('readWritingLog', () => {
  it('returns defaults when the file is missing', () => {
    expect(readWritingLog(tmpDir)).toEqual({
      dailyGoal: DEFAULT_DAILY_GOAL,
      storyTargets: {},
      days: {}
    });
  });

  it('refuses to reset a corrupt log', () => {
    fs.writeFileSync(path.join(tmpDir, 'writing-log.json'), 'not json');
    expect(() => readWritingLog(tmpDir)).toThrow('Repair the file');
  });
});

describe('recordWords', () => {
  it('accumulates words for a day', () => {
    recordWords(tmpDir, 100, AT('2026-07-28T10:00:00'));
    recordWords(tmpDir, 250, AT('2026-07-28T18:00:00'));
    expect(readWritingLog(tmpDir).days['2026-07-28']).toBe(350);
  });

  it('keeps days separate', () => {
    recordWords(tmpDir, 100, AT('2026-07-27T10:00:00'));
    recordWords(tmpDir, 40, AT('2026-07-28T10:00:00'));
    const days = readWritingLog(tmpDir).days;
    expect(days['2026-07-27']).toBe(100);
    expect(days['2026-07-28']).toBe(40);
  });

  it('subtracts deletions but never goes below zero', () => {
    recordWords(tmpDir, 100, AT('2026-07-28T10:00:00'));
    recordWords(tmpDir, -30, AT('2026-07-28T11:00:00'));
    expect(readWritingLog(tmpDir).days['2026-07-28']).toBe(70);
    recordWords(tmpDir, -500, AT('2026-07-28T12:00:00'));
    expect(readWritingLog(tmpDir).days['2026-07-28']).toBe(0);
  });

  it('ignores a zero or non-finite delta', () => {
    recordWords(tmpDir, 0, AT('2026-07-28T10:00:00'));
    recordWords(tmpDir, NaN, AT('2026-07-28T10:00:00'));
    expect(fs.existsSync(path.join(tmpDir, 'writing-log.json'))).toBe(false);
  });

  it('prunes entries older than the retention window', () => {
    recordWords(tmpDir, 10, AT('2024-01-01T10:00:00'));
    recordWords(tmpDir, 10, AT('2026-07-28T10:00:00'));
    expect(Object.keys(readWritingLog(tmpDir).days)).toEqual(['2026-07-28']);
  });
});

describe('goals', () => {
  it('stores and clamps the daily goal', () => {
    setDailyGoal(tmpDir, 750.4);
    expect(readWritingLog(tmpDir).dailyGoal).toBe(750);
    setDailyGoal(tmpDir, -20);
    expect(readWritingLog(tmpDir).dailyGoal).toBe(0);
  });

  it('sets and clears story targets', () => {
    setStoryTarget(tmpDir, 'story-1', 80000);
    expect(readWritingLog(tmpDir).storyTargets).toEqual({ 'story-1': 80000 });
    setStoryTarget(tmpDir, 'story-1', 0);
    expect(readWritingLog(tmpDir).storyTargets).toEqual({});
  });

  it('preserves logged days when a goal changes', () => {
    recordWords(tmpDir, 120, AT('2026-07-28T10:00:00'));
    setDailyGoal(tmpDir, 1000);
    expect(readWritingLog(tmpDir).days['2026-07-28']).toBe(120);
  });
});

describe('getWritingProgress', () => {
  const now = AT('2026-07-28T12:00:00');

  it('reports today, the recent window, and the 30-day total', () => {
    recordWords(tmpDir, 300, AT('2026-07-28T09:00:00'));
    recordWords(tmpDir, 200, AT('2026-07-27T09:00:00'));
    recordWords(tmpDir, 50, AT('2026-05-01T09:00:00'));

    const progress = getWritingProgress(tmpDir, now);
    expect(progress.todayWords).toBe(300);
    expect(progress.recent).toHaveLength(14);
    expect(progress.recent.at(-1)).toEqual({ date: '2026-07-28', words: 300 });
    expect(progress.recent.at(-2)).toEqual({ date: '2026-07-27', words: 200 });
    expect(progress.total30).toBe(500);
    expect(progress.best).toBe(300);
  });

  it('counts a streak of consecutive days ending today', () => {
    for (const date of ['2026-07-26', '2026-07-27', '2026-07-28']) {
      recordWords(tmpDir, 10, AT(`${date}T09:00:00`));
    }
    expect(getWritingProgress(tmpDir, now).streak).toBe(3);
  });

  it('keeps the streak alive on a day not yet written', () => {
    recordWords(tmpDir, 10, AT('2026-07-26T09:00:00'));
    recordWords(tmpDir, 10, AT('2026-07-27T09:00:00'));
    expect(getWritingProgress(tmpDir, now).streak).toBe(2);
  });

  it('breaks the streak on a skipped yesterday', () => {
    recordWords(tmpDir, 10, AT('2026-07-25T09:00:00'));
    recordWords(tmpDir, 10, AT('2026-07-26T09:00:00'));
    expect(getWritingProgress(tmpDir, now).streak).toBe(0);
  });
});
