import { withProjectMetadata, persistProjectMetadata } from './projectMetadata';
import fs from 'node:fs';
import path from 'node:path';
import db from './db';
import {
  trashItems as trashTable,
  entities,
  projectImages,
  imageEntityLinks,
  projects,
  bookmarks as bookmarksTable
} from './schema';
import { eq, and, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readMarkdownFile } from './markdown';
import { ENTITY_DIRS, resolveEntityPath, generateUniqueSlug } from './entities';
import { removeRelationsForEntity, restoreRelations, type RelationEntry } from './relations';
import {
  getStoryDir,
  getChapterDir,
  getScenesDir,
  getScenePath,
  readStoryFile,
  readChapterFile,
  readSceneFile,
  getStoryMeta,
  getChapterMeta
} from './stories';
import { generateId, isSafePathSegment } from '$lib/utils';
import type { EntityType } from '$lib/types';

interface EntityTrashMetadata {
  relations: RelationEntry[];
  bookmarks: { id: string; userId: string; createdAt: string }[];
  imageLinks: { id: string; imageId: string }[];
}

const TRASH_DIR = '.trash';
const TRASH_TTL_DAYS = 30;

const drizzleDb = drizzle(db);

export interface TrashItem {
  id: string;
  projectId: string;
  entityId: string;
  entityType: string;
  originalPath: string;
  deletedAt: string;
  expiresAt: string;
  name: string;
  body: string;
  frontmatter: Record<string, unknown>;
  kind: 'entity' | 'image' | 'story' | 'chapter' | 'scene';
  metadata: Record<string, unknown> | null;
}

interface ChapterTrashMetadata {
  storyId: string;
}

interface SceneTrashMetadata {
  storyId: string;
  chapterId: string;
}

function getEntityDir(projectPath: string, type: EntityType): string {
  if (type === 'note') {
    return path.join(projectPath, 'notes', '_project');
  }
  return path.join(projectPath, ENTITY_DIRS[type]);
}

function getTrashDir(projectPath: string): string {
  return path.join(projectPath, TRASH_DIR);
}

function getTrashEntityPath(projectPath: string, type: EntityType, id: string): string {
  return path.join(getTrashDir(projectPath), ENTITY_DIRS[type], `${id}.md`);
}

function getTrashImagePath(projectPath: string, filename: string): string {
  return path.join(getTrashDir(projectPath), 'images', filename);
}

function getTrashStoryPath(projectPath: string, storyId: string): string {
  return path.join(getTrashDir(projectPath), 'stories', storyId);
}

function getTrashChapterPath(projectPath: string, chapterId: string): string {
  return path.join(getTrashDir(projectPath), 'chapters', chapterId);
}

function getTrashScenePath(projectPath: string, sceneId: string): string {
  return path.join(getTrashDir(projectPath), 'scenes', `${sceneId}.md`);
}

function softDeleteEntityImpl(
  projectId: string,
  projectPath: string,
  type: EntityType,
  id: string
): TrashItem | null {
  const sourcePath = resolveEntityPath(projectPath, type, id);
  if (!sourcePath) return null;

  const md = readMarkdownFile(sourcePath);
  if (!md) return null;

  const trashDir = getTrashDir(projectPath);
  const typeDir = path.join(trashDir, ENTITY_DIRS[type]);
  const destPath = path.join(typeDir, `${id}.md`);

  fs.mkdirSync(typeDir, { recursive: true });

  fs.renameSync(sourcePath, destPath);

  drizzleDb
    .delete(entities)
    .where(and(eq(entities.id, id), eq(entities.projectId, projectId)))
    .run();

  // Relations, bookmarks, and image links referencing this entity would otherwise
  // dangle: RelationGraph silently filters them out, but they'd stay in
  // relations.json forever and misattach if a different entity later reuses the id.
  // Stash them in the trash row so restoreEntity can bring them back.
  const removedRelations = removeRelationsForEntity(projectPath, id);

  const removedBookmarks = drizzleDb
    .select({
      id: bookmarksTable.id,
      userId: bookmarksTable.userId,
      createdAt: bookmarksTable.createdAt
    })
    .from(bookmarksTable)
    .where(and(eq(bookmarksTable.entityId, id), eq(bookmarksTable.projectId, projectId)))
    .all();
  if (removedBookmarks.length > 0) {
    drizzleDb
      .delete(bookmarksTable)
      .where(and(eq(bookmarksTable.entityId, id), eq(bookmarksTable.projectId, projectId)))
      .run();
  }

  const removedImageLinks = drizzleDb
    .select({ id: imageEntityLinks.id, imageId: imageEntityLinks.imageId })
    .from(imageEntityLinks)
    .where(and(eq(imageEntityLinks.entityId, id), eq(imageEntityLinks.projectId, projectId)))
    .all();
  if (removedImageLinks.length > 0) {
    drizzleDb
      .delete(imageEntityLinks)
      .where(and(eq(imageEntityLinks.entityId, id), eq(imageEntityLinks.projectId, projectId)))
      .run();
  }

  const metadata: EntityTrashMetadata = {
    relations: removedRelations,
    bookmarks: removedBookmarks,
    imageLinks: removedImageLinks
  };
  const hasMetadata =
    metadata.relations.length > 0 ||
    metadata.bookmarks.length > 0 ||
    metadata.imageLinks.length > 0;

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trashId = generateId();

  drizzleDb
    .insert(trashTable)
    .values({
      id: trashId,
      projectId,
      entityId: id,
      entityType: type,
      originalPath: path.relative(projectPath, sourcePath),
      deletedAt: now,
      expiresAt,
      kind: 'entity',
      metadata: hasMetadata ? JSON.stringify(metadata) : null
    })
    .run();

  return {
    id: trashId,
    projectId,
    entityId: id,
    entityType: type,
    originalPath: path.relative(projectPath, sourcePath),
    deletedAt: now,
    expiresAt,
    name: (md.frontmatter.name as string) || id,
    body: md.body,
    frontmatter: md.frontmatter as Record<string, unknown>,
    kind: 'entity',
    metadata: hasMetadata ? (metadata as unknown as Record<string, unknown>) : null
  };
}

function softDeleteStoryImpl(
  projectId: string,
  projectPath: string,
  storyId: string
): TrashItem | null {
  // getStoryDir throws on an unsafe id rather than returning null — the routes
  // already validate before calling this, but guard here too since this is a
  // library function other callers could reach directly.
  if (!isSafePathSegment(storyId)) return null;

  const sourcePath = getStoryDir(projectPath, storyId);
  if (!fs.existsSync(sourcePath)) return null;

  const meta = readStoryFile(path.join(sourcePath, 'story.json'));

  const trashDir = path.join(getTrashDir(projectPath), 'stories');
  const destPath = getTrashStoryPath(projectPath, storyId);
  fs.mkdirSync(trashDir, { recursive: true });
  fs.renameSync(sourcePath, destPath);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trashId = generateId();

  drizzleDb
    .insert(trashTable)
    .values({
      id: trashId,
      projectId,
      entityId: storyId,
      entityType: 'story',
      originalPath: path.relative(projectPath, sourcePath),
      deletedAt: now,
      expiresAt,
      kind: 'story',
      metadata: null
    })
    .run();

  return {
    id: trashId,
    projectId,
    entityId: storyId,
    entityType: 'story',
    originalPath: path.relative(projectPath, sourcePath),
    deletedAt: now,
    expiresAt,
    name: meta?.title || storyId,
    body: meta?.description || '',
    frontmatter: {},
    kind: 'story',
    metadata: null
  };
}

function softDeleteChapterImpl(
  projectId: string,
  projectPath: string,
  storyId: string,
  chapterId: string
): TrashItem | null {
  if (!isSafePathSegment(storyId) || !isSafePathSegment(chapterId)) return null;

  const sourcePath = getChapterDir(projectPath, storyId, chapterId);
  if (!fs.existsSync(sourcePath)) return null;

  const meta = readChapterFile(path.join(sourcePath, 'chapter.md'), chapterId);

  const trashDir = path.join(getTrashDir(projectPath), 'chapters');
  const destPath = getTrashChapterPath(projectPath, chapterId);
  fs.mkdirSync(trashDir, { recursive: true });
  fs.renameSync(sourcePath, destPath);

  const metadata: ChapterTrashMetadata = { storyId };
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trashId = generateId();

  drizzleDb
    .insert(trashTable)
    .values({
      id: trashId,
      projectId,
      entityId: chapterId,
      entityType: 'chapter',
      originalPath: path.relative(projectPath, sourcePath),
      deletedAt: now,
      expiresAt,
      kind: 'chapter',
      metadata: JSON.stringify(metadata)
    })
    .run();

  return {
    id: trashId,
    projectId,
    entityId: chapterId,
    entityType: 'chapter',
    originalPath: path.relative(projectPath, sourcePath),
    deletedAt: now,
    expiresAt,
    name: meta?.title || chapterId,
    body: '',
    frontmatter: {},
    kind: 'chapter',
    metadata: metadata as unknown as Record<string, unknown>
  };
}

function softDeleteSceneImpl(
  projectId: string,
  projectPath: string,
  storyId: string,
  chapterId: string,
  sceneId: string
): TrashItem | null {
  if (!isSafePathSegment(storyId) || !isSafePathSegment(chapterId) || !isSafePathSegment(sceneId)) {
    return null;
  }

  const sourcePath = getScenePath(projectPath, storyId, chapterId, sceneId);
  if (!fs.existsSync(sourcePath)) return null;

  const meta = readSceneFile(sourcePath, chapterId);

  const trashDir = path.join(getTrashDir(projectPath), 'scenes');
  const destPath = getTrashScenePath(projectPath, sceneId);
  fs.mkdirSync(trashDir, { recursive: true });
  fs.renameSync(sourcePath, destPath);

  const metadata: SceneTrashMetadata = { storyId, chapterId };
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trashId = generateId();

  drizzleDb
    .insert(trashTable)
    .values({
      id: trashId,
      projectId,
      entityId: sceneId,
      entityType: 'scene',
      originalPath: path.relative(projectPath, sourcePath),
      deletedAt: now,
      expiresAt,
      kind: 'scene',
      metadata: JSON.stringify(metadata)
    })
    .run();

  return {
    id: trashId,
    projectId,
    entityId: sceneId,
    entityType: 'scene',
    originalPath: path.relative(projectPath, sourcePath),
    deletedAt: now,
    expiresAt,
    name: meta?.title || 'Untitled Scene',
    body: meta?.body || '',
    frontmatter: {},
    kind: 'scene',
    metadata: metadata as unknown as Record<string, unknown>
  };
}

function softDeleteImageImpl(
  projectId: string,
  projectPath: string,
  imageId: string
): TrashItem | null {
  const row = drizzleDb
    .select()
    .from(projectImages)
    .where(and(eq(projectImages.id, imageId), eq(projectImages.projectId, projectId)))
    .get();

  if (!row) return null;

  const imageDir = path.join(projectPath, 'images');
  const sourcePath = path.join(imageDir, row.filename);
  const trashDir = path.join(getTrashDir(projectPath), 'images');
  const destPath = path.join(trashDir, row.filename);

  if (fs.existsSync(sourcePath)) {
    fs.mkdirSync(trashDir, { recursive: true });
    fs.renameSync(sourcePath, destPath);
  }

  drizzleDb
    .delete(imageEntityLinks)
    .where(and(eq(imageEntityLinks.imageId, imageId), eq(imageEntityLinks.projectId, projectId)))
    .run();

  drizzleDb
    .delete(projectImages)
    .where(and(eq(projectImages.id, imageId), eq(projectImages.projectId, projectId)))
    .run();

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trashId = generateId();

  const metadata = {
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    caption: row.caption,
    altText: row.altText
  };

  drizzleDb
    .insert(trashTable)
    .values({
      id: trashId,
      projectId,
      entityId: imageId,
      entityType: 'image',
      originalPath: path.join('images', row.filename),
      deletedAt: now,
      expiresAt,
      kind: 'image',
      metadata: JSON.stringify(metadata)
    })
    .run();

  return {
    id: trashId,
    projectId,
    entityId: imageId,
    entityType: 'image',
    originalPath: path.join('images', row.filename),
    deletedAt: now,
    expiresAt,
    name: row.originalName,
    body: '',
    frontmatter: {},
    kind: 'image',
    metadata
  };
}

function restoreStory(projectPath: string, item: typeof trashTable.$inferSelect): boolean {
  const trashPath = getTrashStoryPath(projectPath, item.entityId);
  if (!fs.existsSync(trashPath)) {
    drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
    return false;
  }

  const destPath = getStoryDir(projectPath, item.entityId);
  if (fs.existsSync(destPath)) return false;

  const parentDir = path.dirname(destPath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

  fs.renameSync(trashPath, destPath);
  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
  return true;
}

function restoreChapter(projectPath: string, item: typeof trashTable.$inferSelect): boolean {
  const metadata = JSON.parse(item.metadata || '{}') as Partial<ChapterTrashMetadata>;
  if (!metadata.storyId) return false;

  const trashPath = getTrashChapterPath(projectPath, item.entityId);
  if (!fs.existsSync(trashPath)) {
    drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
    return false;
  }

  // The parent story must still exist — restoring a chapter into a story that was
  // itself deleted (and not yet, or never, restored) would orphan it. The trash
  // item is left alone so it can be restored once the story comes back.
  if (!getStoryMeta(projectPath, metadata.storyId)) return false;

  const destPath = getChapterDir(projectPath, metadata.storyId, item.entityId);
  if (fs.existsSync(destPath)) return false;

  fs.renameSync(trashPath, destPath);
  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
  return true;
}

function restoreScene(projectPath: string, item: typeof trashTable.$inferSelect): boolean {
  const metadata = JSON.parse(item.metadata || '{}') as Partial<SceneTrashMetadata>;
  if (!metadata.storyId || !metadata.chapterId) return false;

  const trashPath = getTrashScenePath(projectPath, item.entityId);
  if (!fs.existsSync(trashPath)) {
    drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
    return false;
  }

  // Same reasoning as restoreChapter: don't restore into a chapter that's gone.
  if (!getChapterMeta(projectPath, metadata.storyId, metadata.chapterId)) return false;

  const scenesDir = getScenesDir(projectPath, metadata.storyId, metadata.chapterId);
  if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true });

  const destPath = getScenePath(projectPath, metadata.storyId, metadata.chapterId, item.entityId);
  if (fs.existsSync(destPath)) return false;

  fs.renameSync(trashPath, destPath);
  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
  return true;
}

function permanentDeleteStory(projectPath: string, item: typeof trashTable.$inferSelect): boolean {
  const trashPath = getTrashStoryPath(projectPath, item.entityId);
  if (fs.existsSync(trashPath)) fs.rmSync(trashPath, { recursive: true, force: true });
  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
  return true;
}

function permanentDeleteChapter(
  projectPath: string,
  item: typeof trashTable.$inferSelect
): boolean {
  const trashPath = getTrashChapterPath(projectPath, item.entityId);
  if (fs.existsSync(trashPath)) fs.rmSync(trashPath, { recursive: true, force: true });
  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
  return true;
}

function permanentDeleteScene(projectPath: string, item: typeof trashTable.$inferSelect): boolean {
  const trashPath = getTrashScenePath(projectPath, item.entityId);
  if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
  return true;
}

function restoreImage(
  projectId: string,
  projectPath: string,
  item: typeof trashTable.$inferSelect
): boolean {
  const metadata = JSON.parse(item.metadata || '{}');

  const trashPath = getTrashImagePath(projectPath, metadata.filename || item.entityId);
  const destDir = path.join(projectPath, 'images');
  const destPath = path.join(destDir, metadata.filename || item.entityId);

  if (fs.existsSync(trashPath)) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.renameSync(trashPath, destPath);
  }

  drizzleDb
    .insert(projectImages)
    .values({
      id: item.entityId,
      projectId,
      filename: metadata.filename || item.entityId,
      originalName: metadata.originalName || 'Unknown',
      mimeType: metadata.mimeType || 'application/octet-stream',
      size: metadata.size || 0,
      caption: metadata.caption || null,
      altText: metadata.altText || null,
      createdAt: item.deletedAt
    })
    .run();

  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();

  return true;
}

function permanentDeleteImage(
  projectId: string,
  projectPath: string,
  item: typeof trashTable.$inferSelect
): boolean {
  const metadata = JSON.parse(item.metadata || '{}');
  const trashPath = getTrashImagePath(projectPath, metadata.filename || item.entityId);

  if (fs.existsSync(trashPath)) {
    fs.unlinkSync(trashPath);
  }

  drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();

  return true;
}

function restoreEntityImpl(projectId: string, projectPath: string, trashId: string): boolean {
  const item = drizzleDb
    .select()
    .from(trashTable)
    .where(and(eq(trashTable.id, trashId), eq(trashTable.projectId, projectId)))
    .get();

  if (!item) return false;

  if (item.kind === 'image') {
    return restoreImage(projectId, projectPath, item);
  }
  if (item.kind === 'story') {
    return restoreStory(projectPath, item);
  }
  if (item.kind === 'chapter') {
    return restoreChapter(projectPath, item);
  }
  if (item.kind === 'scene') {
    return restoreScene(projectPath, item);
  }

  const trashPath = getTrashEntityPath(projectPath, item.entityType as EntityType, item.entityId);

  if (!fs.existsSync(trashPath)) {
    drizzleDb.delete(trashTable).where(eq(trashTable.id, trashId)).run();
    return false;
  }

  const md = readMarkdownFile(trashPath);
  const name = md ? (md.frontmatter.name as string) || item.entityId : item.entityId;
  const type = item.entityType as EntityType;
  const slug = generateUniqueSlug(projectPath, type, name, item.entityId);
  const destDir = getEntityDir(projectPath, type);
  const destPath = path.join(destDir, `${slug}.md`);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.renameSync(trashPath, destPath);

  if (item.metadata) {
    try {
      const metadata = JSON.parse(item.metadata) as Partial<EntityTrashMetadata>;

      restoreRelations(projectPath, metadata.relations || []);

      for (const b of metadata.bookmarks || []) {
        const exists = drizzleDb
          .select({ id: bookmarksTable.id })
          .from(bookmarksTable)
          .where(eq(bookmarksTable.id, b.id))
          .get();
        if (!exists) {
          drizzleDb
            .insert(bookmarksTable)
            .values({
              id: b.id,
              userId: b.userId,
              projectId,
              entityId: item.entityId,
              createdAt: b.createdAt
            })
            .run();
        }
      }

      for (const l of metadata.imageLinks || []) {
        const exists = drizzleDb
          .select({ id: imageEntityLinks.id })
          .from(imageEntityLinks)
          .where(eq(imageEntityLinks.id, l.id))
          .get();
        if (!exists) {
          drizzleDb
            .insert(imageEntityLinks)
            .values({ id: l.id, imageId: l.imageId, entityId: item.entityId, projectId })
            .run();
        }
      }
    } catch {
      // Corrupt or unrecognized metadata — restore the entity file anyway.
    }
  }

  drizzleDb.delete(trashTable).where(eq(trashTable.id, trashId)).run();

  return true;
}

function permanentDeleteEntityImpl(
  projectId: string,
  projectPath: string,
  trashId: string
): boolean {
  const item = drizzleDb
    .select()
    .from(trashTable)
    .where(and(eq(trashTable.id, trashId), eq(trashTable.projectId, projectId)))
    .get();

  if (!item) return false;

  if (item.kind === 'image') {
    return permanentDeleteImage(projectId, projectPath, item);
  }
  if (item.kind === 'story') {
    return permanentDeleteStory(projectPath, item);
  }
  if (item.kind === 'chapter') {
    return permanentDeleteChapter(projectPath, item);
  }
  if (item.kind === 'scene') {
    return permanentDeleteScene(projectPath, item);
  }

  const trashPath = getTrashEntityPath(projectPath, item.entityType as EntityType, item.entityId);
  if (fs.existsSync(trashPath)) {
    fs.unlinkSync(trashPath);
  }

  drizzleDb.delete(trashTable).where(eq(trashTable.id, trashId)).run();

  return true;
}

export function listTrashItems(projectId: string, projectPath: string): TrashItem[] {
  const items = drizzleDb
    .select()
    .from(trashTable)
    .where(eq(trashTable.projectId, projectId))
    .orderBy(trashTable.deletedAt)
    .all();

  return items.map((item) => {
    if (item.kind === 'image') {
      const metadata = JSON.parse(item.metadata || '{}');
      return {
        id: item.id,
        projectId: item.projectId,
        entityId: item.entityId,
        entityType: 'image',
        originalPath: item.originalPath,
        deletedAt: item.deletedAt,
        expiresAt: item.expiresAt,
        name: metadata.originalName || item.entityId,
        body: '',
        frontmatter: {},
        kind: 'image' as const,
        metadata
      };
    }

    if (item.kind === 'story') {
      const meta = readStoryFile(
        path.join(getTrashStoryPath(projectPath, item.entityId), 'story.json')
      );
      return {
        id: item.id,
        projectId: item.projectId,
        entityId: item.entityId,
        entityType: 'story',
        originalPath: item.originalPath,
        deletedAt: item.deletedAt,
        expiresAt: item.expiresAt,
        name: meta?.title || item.entityId,
        body: meta?.description || '',
        frontmatter: {},
        kind: 'story' as const,
        metadata: null
      };
    }

    if (item.kind === 'chapter') {
      const metadata = JSON.parse(item.metadata || '{}') as Partial<ChapterTrashMetadata>;
      const meta = readChapterFile(
        path.join(getTrashChapterPath(projectPath, item.entityId), 'chapter.md'),
        item.entityId
      );
      return {
        id: item.id,
        projectId: item.projectId,
        entityId: item.entityId,
        entityType: 'chapter',
        originalPath: item.originalPath,
        deletedAt: item.deletedAt,
        expiresAt: item.expiresAt,
        name: meta?.title || item.entityId,
        body: '',
        frontmatter: {},
        kind: 'chapter' as const,
        metadata: metadata as Record<string, unknown>
      };
    }

    if (item.kind === 'scene') {
      const metadata = JSON.parse(item.metadata || '{}') as Partial<SceneTrashMetadata>;
      const meta = readSceneFile(
        getTrashScenePath(projectPath, item.entityId),
        metadata.chapterId || ''
      );
      return {
        id: item.id,
        projectId: item.projectId,
        entityId: item.entityId,
        entityType: 'scene',
        originalPath: item.originalPath,
        deletedAt: item.deletedAt,
        expiresAt: item.expiresAt,
        name: meta?.title || 'Untitled Scene',
        body: meta?.body || '',
        frontmatter: {},
        kind: 'scene' as const,
        metadata: metadata as Record<string, unknown>
      };
    }

    const trashPath = getTrashEntityPath(projectPath, item.entityType as EntityType, item.entityId);
    const md = readMarkdownFile(trashPath);

    return {
      id: item.id,
      projectId: item.projectId,
      entityId: item.entityId,
      entityType: item.entityType,
      originalPath: item.originalPath,
      deletedAt: item.deletedAt,
      expiresAt: item.expiresAt,
      name: md ? (md.frontmatter.name as string) || item.entityId : item.entityId,
      body: md?.body || '',
      frontmatter: (md?.frontmatter as Record<string, unknown>) || {},
      kind: 'entity' as const,
      metadata: null
    };
  });
}

export function purgeExpiredTrashItems(): void {
  const now = new Date().toISOString();
  const expired = drizzleDb.select().from(trashTable).where(lt(trashTable.expiresAt, now)).all();
  if (expired.length === 0) return;

  const projectPaths = new Map(
    drizzleDb
      .select({ id: projects.id, dataPath: projects.dataPath })
      .from(projects)
      .all()
      .map((p) => [p.id, p.dataPath])
  );

  for (const item of expired) {
    const projectPath = projectPaths.get(item.projectId);

    if (projectPath) {
      try {
        if (item.kind === 'image') {
          const trashPath = getTrashImagePath(
            projectPath,
            (JSON.parse(item.metadata || '{}').filename as string) || item.entityId
          );
          if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
        } else if (item.kind === 'story') {
          const trashPath = getTrashStoryPath(projectPath, item.entityId);
          if (fs.existsSync(trashPath)) fs.rmSync(trashPath, { recursive: true, force: true });
        } else if (item.kind === 'chapter') {
          const trashPath = getTrashChapterPath(projectPath, item.entityId);
          if (fs.existsSync(trashPath)) fs.rmSync(trashPath, { recursive: true, force: true });
        } else if (item.kind === 'scene') {
          const trashPath = getTrashScenePath(projectPath, item.entityId);
          if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
        } else {
          const trashPath = getTrashEntityPath(
            projectPath,
            item.entityType as EntityType,
            item.entityId
          );
          if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
        }
      } catch {
        // Leave the DB row removal to proceed even if the file cannot be removed
      }
    }

    drizzleDb.delete(trashTable).where(eq(trashTable.id, item.id)).run();
    try {
      persistProjectMetadata(item.projectId);
    } catch (cause) {
      console.error(`Cannot persist trash expiry for ${item.projectId}`, cause);
    }
  }
}

export const softDeleteEntity = (
  ...args: Parameters<typeof softDeleteEntityImpl>
): ReturnType<typeof softDeleteEntityImpl> =>
  withProjectMetadata(args[0], () => softDeleteEntityImpl(...args));

export const softDeleteStory = (
  ...args: Parameters<typeof softDeleteStoryImpl>
): ReturnType<typeof softDeleteStoryImpl> =>
  withProjectMetadata(args[0], () => softDeleteStoryImpl(...args));

export const softDeleteChapter = (
  ...args: Parameters<typeof softDeleteChapterImpl>
): ReturnType<typeof softDeleteChapterImpl> =>
  withProjectMetadata(args[0], () => softDeleteChapterImpl(...args));

export const softDeleteScene = (
  ...args: Parameters<typeof softDeleteSceneImpl>
): ReturnType<typeof softDeleteSceneImpl> =>
  withProjectMetadata(args[0], () => softDeleteSceneImpl(...args));

export const softDeleteImage = (
  ...args: Parameters<typeof softDeleteImageImpl>
): ReturnType<typeof softDeleteImageImpl> =>
  withProjectMetadata(args[0], () => softDeleteImageImpl(...args));

export const restoreEntity = (
  ...args: Parameters<typeof restoreEntityImpl>
): ReturnType<typeof restoreEntityImpl> =>
  withProjectMetadata(args[0], () => restoreEntityImpl(...args));

export const permanentDeleteEntity = (
  ...args: Parameters<typeof permanentDeleteEntityImpl>
): ReturnType<typeof permanentDeleteEntityImpl> =>
  withProjectMetadata(args[0], () => permanentDeleteEntityImpl(...args));
