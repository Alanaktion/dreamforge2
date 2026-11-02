import { isSafePathSegment } from '$lib/utils';
import { resolveProjectPath } from './paths';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import db from './db';
import {
  projects,
  users,
  customFieldDefs,
  projectImages,
  imageEntityLinks,
  comments,
  bookmarks,
  trashItems
} from './schema';
import { readJson, writeJson, StorageError } from './storage';

const index = drizzle(db);
const tables = {
  fields: customFieldDefs,
  images: projectImages,
  imageLinks: imageEntityLinks,
  comments,
  bookmarks,
  trash: trashItems
};
type Metadata = { version: 1; [key: string]: unknown };

export function persistProjectMetadata(projectId: string): void {
  const project = index.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return;
  project.dataPath = resolveProjectPath(projectId, project.dataPath);
  const data: Metadata = { version: 1 };
  for (const [key, table] of Object.entries(tables)) {
    data[key] = index.select().from(table).where(eq(table.projectId, projectId)).all();
  }
  writeJson(path.join(project.dataPath, 'metadata.json'), data);
}

export function syncProjectMetadata(projectId: string): void {
  const project = index.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return;
  project.dataPath = resolveProjectPath(projectId, project.dataPath);
  const file = path.join(project.dataPath, 'metadata.json');
  if (!fs.existsSync(file)) {
    persistProjectMetadata(projectId);
    return;
  }
  const data = readJson<Metadata>(
    file,
    { version: 1 },
    (value) =>
      !!value &&
      (value as Metadata).version === 1 &&
      Object.keys(tables).every((key) => Array.isArray((value as Metadata)[key]))
  );
  const remap = (id: string) =>
    createHash('sha256').update(`${projectId}:${id}`).digest('hex').slice(0, 32);
  const localUsers = new Set(
    index
      .select({ id: users.id })
      .from(users)
      .all()
      .map((user) => user.id)
  );
  try {
    index.transaction((tx) => {
      for (const table of [
        imageEntityLinks,
        ...Object.values(tables).filter((table) => table !== imageEntityLinks)
      ])
        tx.delete(table).where(eq(table.projectId, projectId)).run();
      for (const [key, table] of Object.entries(tables)) {
        const records = data[key] as Array<Record<string, unknown>>;
        for (const source of records) {
          if (key === 'images' && !isSafePathSegment(source.filename))
            throw new Error('Unsafe image filename');
          if (key === 'trash') {
            if (!isSafePathSegment(source.entityId)) throw new Error('Unsafe trash entity ID');
            const metadata =
              typeof source.metadata === 'string' ? JSON.parse(source.metadata) : null;
            if (metadata?.filename && !isSafePathSegment(metadata.filename))
              throw new Error('Unsafe trash image filename');
          }
          const row = {
            ...source,
            id: source.projectId === projectId ? String(source.id) : remap(String(source.id)),
            projectId
          };
          if ('originalPath' in row) {
            const original = path.resolve(project.dataPath, String(row.originalPath));
            if (!original.startsWith(project.dataPath + path.sep))
              throw new Error('Unsafe trash path in metadata');
            if (path.isAbsolute(String(row.originalPath)))
              throw new Error('Trash paths must be relative');
          }
          if ('imageId' in row && source.projectId !== projectId)
            row.imageId = remap(String(row.imageId));
          if ('userId' in row && !localUsers.has(String(row.userId))) row.userId = project.userId;
          if (source.projectId !== projectId && key === 'trash') {
            if ('entityId' in row && source.kind === 'image')
              row.entityId = remap(String(row.entityId));
            if ('metadata' in row && typeof row.metadata === 'string') {
              const metadata = JSON.parse(row.metadata);
              if (Array.isArray(metadata.bookmarks))
                metadata.bookmarks = metadata.bookmarks.map(
                  (bookmark: Record<string, unknown>) => ({
                    ...bookmark,
                    id: remap(String(bookmark.id)),
                    userId: localUsers.has(String(bookmark.userId))
                      ? bookmark.userId
                      : project.userId
                  })
                );
              if (Array.isArray(metadata.imageLinks))
                metadata.imageLinks = metadata.imageLinks.map((link: Record<string, unknown>) => ({
                  ...link,
                  id: remap(String(link.id)),
                  imageId: remap(String(link.imageId))
                }));
              row.metadata = JSON.stringify(metadata);
            }
          }
          tx.insert(table)
            .values(row as never)
            .run();
        }
      }
    });
  } catch (cause) {
    throw new StorageError(file, cause);
  }
}

export function withProjectMetadata<T>(projectId: string, change: () => T): T {
  const project = index.select().from(projects).where(eq(projects.id, projectId)).get();
  if (project) syncProjectMetadata(projectId);
  return index.transaction(() => {
    const result = change();
    persistProjectMetadata(projectId);
    return result;
  });
}
