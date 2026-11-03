import fs from 'node:fs';
import path from 'node:path';
import db from './db';
import { fileRevision, assertRevision, moveAndWriteAtomic } from './storage';
import { entities as entitiesTable } from './schema';
import { eq, and, like, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  readMarkdownFile,
  writeMarkdownFile,
  serializeMarkdown,
  type Frontmatter
} from './markdown';
import { generateId, slugify, isSafePathSegment } from '$lib/utils';
import type { EntityType } from '$lib/types';

const drizzleDb = drizzle(db);

export const ENTITY_DIRS: Record<EntityType, string> = {
  character: 'characters',
  organization: 'organizations',
  location: 'locations',
  culture: 'cultures',
  species: 'species',
  item: 'items',
  note: 'notes'
};

export interface EntityData {
  revision?: string;
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  tags: string[];
  status: string;
  imagePath: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
  createdAt: string;
  modifiedAt: string;
}

export function getEntityDir(projectPath: string, type: EntityType): string {
  if (type === 'note') {
    return path.join(projectPath, 'notes', '_project');
  }
  return path.join(projectPath, ENTITY_DIRS[type]);
}

function slugifyPath(slug: string): string {
  return slug.replace(/\//g, '-');
}

export function generateUniqueSlug(
  projectPath: string,
  type: EntityType,
  name: string,
  excludeId?: string
): string {
  let slug = slugifyPath(slugify(name));
  if (!slug) slug = 'untitled';

  const dir = getEntityDir(projectPath, type);
  if (!fs.existsSync(dir)) return slug;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const existingSlugs = new Set<string>();
  for (const file of files) {
    if (excludeId) {
      const filePath = path.join(dir, file);
      const md = readMarkdownFile(filePath);
      if (md && md.frontmatter.id === excludeId) continue;
    }
    existingSlugs.add(file.replace(/\.md$/, ''));
  }

  if (!existingSlugs.has(slug)) return slug;

  let counter = 1;
  while (existingSlugs.has(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}

export function resolveEntityPath(
  projectPath: string,
  type: EntityType,
  id: string
): string | null {
  if (!isSafePathSegment(id)) return null;
  const dir = getEntityDir(projectPath, type);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(dir, file);
    const md = readMarkdownFile(filePath);
    if (md && md.frontmatter.id === id) {
      return filePath;
    }
  }

  const idPath = path.join(dir, `${id}.md`);
  if (fs.existsSync(idPath)) return idPath;

  return null;
}

export function listEntities(
  projectId: string,
  projectPath: string,
  type: EntityType
): EntityData[] {
  const dir = getEntityDir(projectPath, type);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const results: EntityData[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const md = readMarkdownFile(filePath);
    if (!md) continue;

    results.push({
      revision: fileRevision(filePath),
      id: md.frontmatter.id as string,
      projectId,
      type,
      name: String(md.frontmatter.name ?? '') || file.replace('.md', ''),
      tags: Array.isArray(md.frontmatter.tags) ? md.frontmatter.tags.map(String) : [],
      status: typeof md.frontmatter.status === 'string' ? md.frontmatter.status : 'draft',
      imagePath: typeof md.frontmatter.imagePath === 'string' ? md.frontmatter.imagePath : null,
      body: md.body,
      frontmatter: md.frontmatter as Record<string, unknown>,
      createdAt:
        typeof md.frontmatter.created === 'string'
          ? md.frontmatter.created
          : new Date().toISOString(),
      modifiedAt:
        typeof md.frontmatter.modified === 'string'
          ? md.frontmatter.modified
          : new Date().toISOString()
    });
  }

  results.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

  return results;
}

export function getEntity(
  projectId: string,
  projectPath: string,
  type: EntityType,
  id: string
): EntityData | null {
  const filePath = resolveEntityPath(projectPath, type, id);
  if (!filePath) return null;

  const md = readMarkdownFile(filePath);
  if (!md) return null;

  return {
    revision: fileRevision(filePath),
    id: md.frontmatter.id as string,
    projectId,
    type,
    name: String(md.frontmatter.name ?? '') || id,
    tags: Array.isArray(md.frontmatter.tags) ? md.frontmatter.tags.map(String) : [],
    status: typeof md.frontmatter.status === 'string' ? md.frontmatter.status : 'draft',
    imagePath: typeof md.frontmatter.imagePath === 'string' ? md.frontmatter.imagePath : null,
    body: md.body,
    frontmatter: md.frontmatter as Record<string, unknown>,
    createdAt:
      typeof md.frontmatter.created === 'string'
        ? md.frontmatter.created
        : new Date().toISOString(),
    modifiedAt:
      typeof md.frontmatter.modified === 'string'
        ? md.frontmatter.modified
        : new Date().toISOString()
  };
}

export function createEntity(
  projectId: string,
  projectPath: string,
  type: EntityType,
  data: { name: string; body?: string; tags?: string[]; [key: string]: unknown }
): EntityData {
  const now = new Date().toISOString();
  const id = generateId();
  const slug = generateUniqueSlug(projectPath, type, data.name);

  const frontmatter: Frontmatter = {
    id,
    name: data.name,
    slug,
    type,
    tags: data.tags || [],
    status: 'draft',
    imagePath: null,
    created: now,
    modified: now,
    ...Object.fromEntries(
      Object.entries(data).filter(
        ([k]) => !['id', 'type', 'slug', 'created', 'modified', 'name', 'body', 'tags'].includes(k)
      )
    )
  };

  const body = (data.body as string) || '';
  const dir = getEntityDir(projectPath, type);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${slug}.md`);
  writeMarkdownFile(filePath, frontmatter as Record<string, unknown>, body);

  syncEntityToDb(projectId, type, id, frontmatter);

  return {
    revision: fileRevision(filePath),
    id,
    projectId,
    type,
    name: data.name,
    tags: data.tags || [],
    status: 'draft',
    imagePath: null,
    body,
    frontmatter: frontmatter as Record<string, unknown>,
    createdAt: now,
    modifiedAt: now
  };
}

export function updateEntity(
  projectId: string,
  projectPath: string,
  type: EntityType,
  id: string,
  data: Record<string, unknown>,
  expectedRevision?: string
): EntityData | null {
  const existing = getEntity(projectId, projectPath, type, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nameChanged = data.name && data.name !== existing.name;

  const resolvedPath = resolveEntityPath(projectPath, type, id);
  if (!resolvedPath) return null;
  assertRevision(resolvedPath, expectedRevision);
  const currentSlug = path.basename(resolvedPath, '.md');

  let newSlug = currentSlug;
  if (nameChanged) {
    newSlug = generateUniqueSlug(projectPath, type, data.name as string, id);
  }

  const frontmatter: Record<string, unknown> = {
    ...existing.frontmatter,
    ...data,
    id,
    type,
    modified: now,
    slug: newSlug
  };

  delete frontmatter.body;

  const body = (data.body as string) ?? existing.body;

  if (nameChanged && newSlug !== currentSlug) {
    const dir = getEntityDir(projectPath, type);
    const oldPath = resolvedPath;
    const newPath = path.join(dir, `${newSlug}.md`);

    moveAndWriteAtomic(oldPath, newPath, serializeMarkdown(frontmatter, body));
  } else {
    const dir = getEntityDir(projectPath, type);
    const filePath = resolveEntityPath(projectPath, type, id) || path.join(dir, `${newSlug}.md`);
    writeMarkdownFile(filePath, frontmatter, body);
  }

  syncEntityToDb(projectId, type, id, frontmatter);

  return {
    ...existing,
    ...(data as Record<string, unknown>),
    body,
    frontmatter,
    modifiedAt: now,
    revision: fileRevision(resolveEntityPath(projectPath, type, id)!)
  } as EntityData;
}

/**
 * Copies an entity's body, tags, and every custom field into a new one named
 * "<name> (Copy)". Relations pointing at the original are deliberately not
 * copied — a duplicate is a starting point, not a second identity.
 */
export function duplicateEntity(
  projectId: string,
  projectPath: string,
  type: EntityType,
  id: string
): EntityData | null {
  const source = getEntity(projectId, projectPath, type, id);
  if (!source) return null;

  const carried = Object.fromEntries(
    Object.entries(source.frontmatter).filter(
      ([key]) => !['id', 'name', 'slug', 'type', 'created', 'modified', 'tags'].includes(key)
    )
  );

  return createEntity(projectId, projectPath, type, {
    ...carried,
    name: `${source.name} (Copy)`,
    body: source.body,
    tags: [...source.tags]
  });
}

export function deleteEntity(
  projectId: string,
  projectPath: string,
  type: EntityType,
  id: string
): boolean {
  const filePath = resolveEntityPath(projectPath, type, id);
  if (!filePath) return false;

  fs.unlinkSync(filePath);

  drizzleDb
    .delete(entitiesTable)
    .where(and(eq(entitiesTable.id, id), eq(entitiesTable.projectId, projectId)))
    .run();

  return true;
}

export function syncEntityToDb(
  projectId: string,
  type: EntityType,
  id: string,
  frontmatter: Record<string, unknown>
): void {
  if (typeof id !== 'string' || !id) throw new Error('Entity id must be a nonempty string');
  const now = new Date().toISOString();
  const existing = drizzleDb
    .select()
    .from(entitiesTable)
    .where(and(eq(entitiesTable.id, id), eq(entitiesTable.projectId, projectId)))
    .get();

  const record = {
    id,
    projectId,
    type,
    name: String(frontmatter.name ?? id),
    slug: typeof frontmatter.slug === 'string' ? frontmatter.slug : null,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
    status: typeof frontmatter.status === 'string' ? frontmatter.status : 'draft',
    imagePath: typeof frontmatter.imagePath === 'string' ? frontmatter.imagePath : null,
    createdAt: typeof frontmatter.created === 'string' ? frontmatter.created : now,
    modifiedAt: typeof frontmatter.modified === 'string' ? frontmatter.modified : now
  };

  if (existing) {
    drizzleDb
      .update(entitiesTable)
      .set(record)
      .where(and(eq(entitiesTable.id, id), eq(entitiesTable.projectId, projectId)))
      .run();
  } else {
    drizzleDb.insert(entitiesTable).values(record).run();
  }
}

export function pruneMissingEntities(projectId: string, existingIds: Set<string>): void {
  const rows = drizzleDb
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(eq(entitiesTable.projectId, projectId))
    .all();

  for (const row of rows) {
    if (existingIds.has(row.id)) continue;
    drizzleDb
      .delete(entitiesTable)
      .where(and(eq(entitiesTable.id, row.id), eq(entitiesTable.projectId, projectId)))
      .run();
  }
}

export function removeEntityFromDbBySlug(projectId: string, type: EntityType, slug: string): void {
  drizzleDb
    .delete(entitiesTable)
    .where(
      and(
        eq(entitiesTable.projectId, projectId),
        eq(entitiesTable.type, type),
        eq(entitiesTable.slug, slug)
      )
    )
    .run();
}

export function searchEntities(
  projectId: string,
  query: string,
  typeFilter?: EntityType
): EntityData[] {
  const conditions = [eq(entitiesTable.projectId, projectId)];

  if (typeFilter) {
    conditions.push(eq(entitiesTable.type, typeFilter));
  }

  if (query) {
    conditions.push(like(entitiesTable.name, `%${query}%`));
  }

  const dbResults = drizzleDb
    .select()
    .from(entitiesTable)
    .where(and(...conditions))
    .orderBy(desc(entitiesTable.modifiedAt))
    .all();

  return dbResults.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    type: r.type as EntityType,
    name: r.name,
    tags: r.tags || [],
    status: r.status,
    imagePath: r.imagePath,
    body: '',
    frontmatter: {},
    createdAt: r.createdAt,
    modifiedAt: r.modifiedAt
  }));
}
