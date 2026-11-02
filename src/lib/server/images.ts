import { validImageSignature } from './imageSignature';
import { withProjectMetadata } from './projectMetadata';
import { writeFileAtomic } from './storage';
import fs from 'node:fs';
import path from 'node:path';
import db from './db';
import { projectImages, imageEntityLinks, entities } from './schema';
import { eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';
import { softDeleteImage } from '$lib/server/trash';

const drizzleDb = drizzle(db);

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

export interface ProjectImage {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  caption: string | null;
  altText: string | null;
  createdAt: string;
  url: string;
  linkedEntities: { id: string; name: string; type: string }[];
}

function getImageDir(projectPath: string): string {
  return path.join(projectPath, 'images');
}

function allowedFile(ext: string): boolean {
  return ALLOWED_EXTENSIONS.includes(ext.toLowerCase());
}

function uploadImagesImpl(
  projectId: string,
  projectPath: string,
  files: { name: string; buffer: Buffer }[]
): ProjectImage[] {
  const imageDir = getImageDir(projectPath);
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  const results: ProjectImage[] = [];

  for (const file of files) {
    const ext = path.extname(file.name);
    if (!allowedFile(ext) || !validImageSignature(ext, file.buffer)) continue;

    const now = new Date().toISOString();
    const id = generateId();
    const filename = `${id}${ext}`;
    const filePath = path.join(imageDir, filename);

    writeFileAtomic(filePath, file.buffer);

    drizzleDb
      .insert(projectImages)
      .values({
        id,
        projectId,
        filename,
        originalName: file.name,
        mimeType: MIME_MAP[ext.toLowerCase()] || 'application/octet-stream',
        size: file.buffer.length,
        caption: null,
        altText: null,
        createdAt: now
      })
      .run();

    results.push({
      id,
      projectId,
      filename,
      originalName: file.name,
      mimeType: MIME_MAP[ext.toLowerCase()] || 'application/octet-stream',
      size: file.buffer.length,
      caption: null,
      altText: null,
      createdAt: now,
      url: `/api/projects/${projectId}/images/${filename}`,
      linkedEntities: []
    });
  }

  return results;
}

export function listProjectImages(projectId: string, _projectPath: string): ProjectImage[] {
  const rows = drizzleDb
    .select()
    .from(projectImages)
    .where(eq(projectImages.projectId, projectId))
    .orderBy(projectImages.createdAt)
    .all();

  const links = drizzleDb
    .select()
    .from(imageEntityLinks)
    .where(eq(imageEntityLinks.projectId, projectId))
    .all();

  const linkMap = new Map<string, { id: string; name: string; type: string }[]>();

  if (links.length > 0) {
    const entityIds = [...new Set(links.map((l) => l.entityId))];
    const entityRows = drizzleDb
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.projectId, projectId), inArray(entities.id, entityIds)))
      .all();
    const entityMap = new Map(entityRows.map((e) => [e.id, e]));

    for (const link of links) {
      if (!linkMap.has(link.imageId)) linkMap.set(link.imageId, []);
      const entity = entityMap.get(link.entityId);
      if (entity) linkMap.get(link.imageId)!.push(entity);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    filename: r.filename,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: r.size,
    caption: r.caption,
    altText: r.altText,
    createdAt: r.createdAt,
    url: `/api/projects/${projectId}/images/${r.filename}`,
    linkedEntities: linkMap.get(r.id) || []
  }));
}

export function getProjectImage(
  projectId: string,
  projectPath: string,
  imageId: string
): ProjectImage | null {
  const row = drizzleDb
    .select()
    .from(projectImages)
    .where(and(eq(projectImages.id, imageId), eq(projectImages.projectId, projectId)))
    .get();

  if (!row) return null;

  const links = drizzleDb
    .select()
    .from(imageEntityLinks)
    .where(and(eq(imageEntityLinks.imageId, imageId), eq(imageEntityLinks.projectId, projectId)))
    .all();

  let linkedEntities: { id: string; name: string; type: string }[] = [];
  if (links.length > 0) {
    const entityRows = drizzleDb
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(
        and(
          eq(entities.projectId, projectId),
          inArray(
            entities.id,
            links.map((link) => link.entityId)
          )
        )
      )
      .all();
    linkedEntities = entityRows;
  }

  return {
    id: row.id,
    projectId: row.projectId,
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    caption: row.caption,
    altText: row.altText,
    createdAt: row.createdAt,
    url: `/api/projects/${projectId}/images/${row.filename}`,
    linkedEntities
  };
}

function updateImageImpl(
  projectId: string,
  imageId: string,
  data: { caption?: string | null; altText?: string | null }
): boolean {
  const result = drizzleDb
    .update(projectImages)
    .set({
      ...(data.caption !== undefined ? { caption: data.caption } : {}),
      ...(data.altText !== undefined ? { altText: data.altText } : {})
    })
    .where(and(eq(projectImages.id, imageId), eq(projectImages.projectId, projectId)))
    .run();

  return result.changes > 0;
}

export function deleteImage(projectId: string, projectPath: string, imageId: string): boolean {
  const result = softDeleteImage(projectId, projectPath, imageId);
  return result !== null;
}

function linkEntityToImageImpl(projectId: string, imageId: string, entityId: string): boolean {
  const existing = drizzleDb
    .select()
    .from(imageEntityLinks)
    .where(
      and(
        eq(imageEntityLinks.imageId, imageId),
        eq(imageEntityLinks.entityId, entityId),
        eq(imageEntityLinks.projectId, projectId)
      )
    )
    .get();

  if (existing) return true;

  drizzleDb
    .insert(imageEntityLinks)
    .values({
      id: generateId(),
      imageId,
      entityId,
      projectId
    })
    .run();

  return true;
}

function unlinkEntityFromImageImpl(projectId: string, imageId: string, entityId: string): boolean {
  const result = drizzleDb
    .delete(imageEntityLinks)
    .where(
      and(
        eq(imageEntityLinks.imageId, imageId),
        eq(imageEntityLinks.entityId, entityId),
        eq(imageEntityLinks.projectId, projectId)
      )
    )
    .run();

  return result.changes > 0;
}

export function getImagesForEntity(projectId: string, entityId: string): ProjectImage[] {
  const links = drizzleDb
    .select()
    .from(imageEntityLinks)
    .where(and(eq(imageEntityLinks.entityId, entityId), eq(imageEntityLinks.projectId, projectId)))
    .all();

  if (links.length === 0) return [];

  const imageIds = links.map((l) => l.imageId);
  const rows = drizzleDb
    .select()
    .from(projectImages)
    .where(and(eq(projectImages.projectId, projectId), inArray(projectImages.id, imageIds)))
    .all();

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    filename: r.filename,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: r.size,
    caption: r.caption,
    altText: r.altText,
    createdAt: r.createdAt,
    url: `/api/projects/${projectId}/images/${r.filename}`,
    linkedEntities: []
  }));
}

function scanExistingImagesImpl(projectId: string, projectPath: string): void {
  const imageDir = getImageDir(projectPath);
  if (!fs.existsSync(imageDir)) return;

  const files = fs.readdirSync(imageDir).filter((f) => allowedFile(path.extname(f)));

  const existing = new Set(
    drizzleDb
      .select()
      .from(projectImages)
      .where(eq(projectImages.projectId, projectId))
      .all()
      .map((r) => r.filename)
  );

  for (const filename of files) {
    if (existing.has(filename)) continue;

    const filePath = path.join(imageDir, filename);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const now = new Date().toISOString();
    const id = generateId();

    drizzleDb
      .insert(projectImages)
      .values({
        id,
        projectId,
        filename,
        originalName: filename,
        mimeType: MIME_MAP[ext] || 'application/octet-stream',
        size: stat.size,
        caption: null,
        altText: null,
        createdAt: now
      })
      .run();
  }
}

export const uploadImages = (
  ...args: Parameters<typeof uploadImagesImpl>
): ReturnType<typeof uploadImagesImpl> =>
  withProjectMetadata(args[0], () => uploadImagesImpl(...args));

export const updateImage = (
  ...args: Parameters<typeof updateImageImpl>
): ReturnType<typeof updateImageImpl> =>
  withProjectMetadata(args[0], () => updateImageImpl(...args));

export const linkEntityToImage = (
  ...args: Parameters<typeof linkEntityToImageImpl>
): ReturnType<typeof linkEntityToImageImpl> =>
  withProjectMetadata(args[0], () => linkEntityToImageImpl(...args));

export const unlinkEntityFromImage = (
  ...args: Parameters<typeof unlinkEntityFromImageImpl>
): ReturnType<typeof unlinkEntityFromImageImpl> =>
  withProjectMetadata(args[0], () => unlinkEntityFromImageImpl(...args));

export const scanExistingImages = (
  ...args: Parameters<typeof scanExistingImagesImpl>
): ReturnType<typeof scanExistingImagesImpl> =>
  withProjectMetadata(args[0], () => scanExistingImagesImpl(...args));
