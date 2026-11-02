import { readJson, writeJson } from './storage';
import fs from 'node:fs';
import path from 'node:path';
import db from './db';
import {
  projects,
  comments,
  bookmarks,
  imageEntityLinks,
  projectImages,
  customFieldDefs,
  projectMembers,
  trashItems,
  entities
} from './schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { unwatchProject } from './watcher';

const drizzleDb = drizzle(db);

export function updateProject(
  projectId: string,
  dataPath: string,
  data: { name: string; description: string | null }
): void {
  const now = new Date().toISOString();

  const projectJsonPath = path.join(dataPath, 'project.json');
  const existing = readJson<Record<string, unknown>>(projectJsonPath, {});
  writeJson(projectJsonPath, {
    ...existing,
    id: projectId,
    name: data.name,
    description: data.description,
    modifiedAt: now
  });
  drizzleDb
    .update(projects)
    .set({ name: data.name, description: data.description, modifiedAt: now })
    .where(eq(projects.id, projectId))
    .run();
}

export function deleteProject(projectId: string, dataPath: string): void {
  unwatchProject(projectId);

  drizzleDb.transaction(() => {
    // Delete child rows before the project row so foreign keys hold.
    drizzleDb.delete(comments).where(eq(comments.projectId, projectId)).run();
    drizzleDb.delete(bookmarks).where(eq(bookmarks.projectId, projectId)).run();
    drizzleDb.delete(imageEntityLinks).where(eq(imageEntityLinks.projectId, projectId)).run();
    drizzleDb.delete(projectImages).where(eq(projectImages.projectId, projectId)).run();
    drizzleDb.delete(customFieldDefs).where(eq(customFieldDefs.projectId, projectId)).run();
    drizzleDb.delete(projectMembers).where(eq(projectMembers.projectId, projectId)).run();
    drizzleDb.delete(trashItems).where(eq(trashItems.projectId, projectId)).run();
    drizzleDb.delete(entities).where(eq(entities.projectId, projectId)).run();
    drizzleDb.delete(projects).where(eq(projects.id, projectId)).run();
  });

  if (fs.existsSync(dataPath)) {
    fs.rmSync(dataPath, { recursive: true, force: true });
  }
}
