import { reportFileProblem } from './diagnostics';
import { syncProjectMetadata } from './projectMetadata';
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { readMarkdownFile } from './markdown';
import { syncEntityToDb, removeEntityFromDbBySlug, pruneMissingEntities } from './entities';
import type { EntityType } from '$lib/types';
import db from './db';
import { projects } from './schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const watchers = new Map<string, FSWatcher>();
const lastTouched = new Map<string, number>();
const TOUCH_INTERVAL_MS = 30_000;

export function touchProject(projectId: string, now = Date.now()): boolean {
  if (now - (lastTouched.get(projectId) ?? 0) < TOUCH_INTERVAL_MS) return false;
  lastTouched.set(projectId, now);
  drizzle(db)
    .update(projects)
    .set({ modifiedAt: new Date(now).toISOString() })
    .where(eq(projects.id, projectId))
    .run();
  return true;
}

const ENTITY_PATTERNS: Record<string, EntityType> = {
  characters: 'character',
  organizations: 'organization',
  locations: 'location',
  cultures: 'culture',
  species: 'species',
  items: 'item'
};

export function watchProject(projectId: string, projectPath: string): void {
  if (watchers.has(projectId)) return;

  const watcher = chokidar.watch(projectPath, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: false,
    depth: 5
  });
  let ready = false;
  watcher.on('ready', () => (ready = true));
  const touch = () => {
    if (!ready) return;
    try {
      touchProject(projectId);
    } catch (cause) {
      console.error(`Cannot update activity time for ${projectId}`, cause);
    }
  };

  const isProjectFile = (filePath: string) =>
    filePath.endsWith('.md') || filePath.endsWith('.json');

  watcher.on('add', (filePath) => {
    if (isProjectFile(filePath)) touch();
    if (!filePath.endsWith('.md')) return;
    safelySync(projectId, projectPath, filePath);
  });

  watcher.on('change', (filePath) => {
    if (isProjectFile(filePath)) touch();
    if (!filePath.endsWith('.md')) return;
    safelySync(projectId, projectPath, filePath);
  });

  watcher.on('unlink', (filePath) => {
    if (isProjectFile(filePath)) touch();
    if (!filePath.endsWith('.md')) return;
    const relPath = path.relative(projectPath, filePath);
    const dirName = path.basename(path.dirname(relPath));

    // Stories/chapters/scenes are not indexed in the entities table (they're
    // metadata-in-frontmatter files read directly by stories.ts), so there's no
    // index row to clean up here — only entities and project-wide notes are.
    if (dirName === 'scenes' || dirName === 'chapters') return;

    // The file is gone, so its frontmatter id is unreadable — drop the index row by slug.
    const entityType =
      dirName === '_project' || dirName === '_story' ? 'note' : ENTITY_PATTERNS[dirName];
    if (!entityType) return;

    try {
      removeEntityFromDbBySlug(projectId, entityType, path.basename(filePath, '.md'));
      reportFileProblem(filePath);
    } catch (cause) {
      console.error(`Cannot remove index for ${filePath}`, cause);
    }
  });

  watcher.on('error', (cause) => console.error(`Watcher failed: ${projectPath}`, cause));
  watchers.set(projectId, watcher);
}

export function unwatchProject(projectId: string): void {
  const watcher = watchers.get(projectId);
  if (watcher) {
    watcher.close();
    watchers.delete(projectId);
  }
}

function safelySync(projectId: string, projectPath: string, filePath: string): void {
  try {
    handleFileChange(projectId, projectPath, filePath);
  } catch (cause) {
    reportFileProblem(filePath, String(cause));
    console.error(`Cannot index ${filePath}`, cause);
  }
}

function handleFileChange(projectId: string, projectPath: string, filePath: string): void {
  const relPath = path.relative(projectPath, filePath);
  const dir = path.dirname(relPath);
  const dirName = path.basename(dir);

  if (dirName === '_project' || dirName === '_story') {
    handleNoteFileChange(projectId, filePath);
    return;
  }

  // Stories/chapters/scenes are read directly by stories.ts, not indexed here.
  if (dirName === 'scenes' || dirName === 'chapters') return;

  const entityDir = path.basename(dir);
  const entityType = ENTITY_PATTERNS[entityDir];

  if (!entityType) return;

  const md = readMarkdownFile(filePath);
  if (!md) return;

  syncEntityToDb(projectId, entityType, md.frontmatter.id as string, md.frontmatter);
}

function handleNoteFileChange(projectId: string, filePath: string): void {
  const md = readMarkdownFile(filePath);
  if (!md) return;
  syncEntityToDb(projectId, 'note', md.frontmatter.id as string, md.frontmatter);
}

export function scanProject(projectId: string, projectPath: string): void {
  if (!fs.existsSync(projectPath)) return;

  syncProjectMetadata(projectId);
  const seenIds = new Set<string>();

  const scanDir = (fullDir: string, entityType: EntityType) => {
    if (!fs.existsSync(fullDir)) return;
    for (const file of fs.readdirSync(fullDir).filter((f) => f.endsWith('.md'))) {
      const md = readMarkdownFile(path.join(fullDir, file));
      if (!md) continue;
      const id = md.frontmatter.id as string;
      if (!id) continue;
      if (seenIds.has(id)) {
        reportFileProblem(path.join(fullDir, file), `Duplicate entity id: ${id}`);
        continue;
      }
      seenIds.add(id);
      try {
        syncEntityToDb(projectId, entityType, id, md.frontmatter);
      } catch (cause) {
        reportFileProblem(path.join(fullDir, file), String(cause));
        console.error(`Cannot index ${path.join(fullDir, file)}`, cause);
      }
    }
  };

  for (const [dir, entityType] of Object.entries(ENTITY_PATTERNS)) {
    scanDir(path.join(projectPath, dir), entityType);
  }

  // Scan notes (project-wide and per-story)
  scanDir(path.join(projectPath, 'notes', '_project'), 'note');

  // The filesystem is the source of truth — drop index rows with no backing file.
  pruneMissingEntities(projectId, seenIds);
}

export async function unwatchAllProjects(): Promise<void> {
  const closing = [...watchers.values()].map((watcher) => watcher.close());
  watchers.clear();
  await Promise.all(closing);
}
