import { withProjectMetadata } from './projectMetadata';
import db from './db';
import { customFieldDefs } from './schema';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';
import type { EntityType } from '$lib/types';

const drizzleDb = drizzle(db);

export interface CustomFieldDef {
  id: string;
  projectId: string;
  entityType: EntityType;
  key: string;
  label: string;
  fieldType:
    'text' | 'textarea' | 'number' | 'tags' | 'markdown' | 'entityRef' | 'boolean' | 'date';
  refEntityType: EntityType | null;
  placeholder: string | null;
  required: boolean;
  sortOrder: number;
}

export function getCustomFieldDefs(projectId: string, entityType?: EntityType): CustomFieldDef[] {
  const conditions = [eq(customFieldDefs.projectId, projectId)];
  if (entityType) {
    conditions.push(eq(customFieldDefs.entityType, entityType));
  }

  const rows = drizzleDb
    .select()
    .from(customFieldDefs)
    .where(and(...conditions))
    .orderBy(customFieldDefs.sortOrder)
    .all();

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    entityType: r.entityType as EntityType,
    key: r.key,
    label: r.label,
    fieldType: r.fieldType as CustomFieldDef['fieldType'],
    refEntityType: r.refEntityType as EntityType | null,
    placeholder: r.placeholder,
    required: r.required,
    sortOrder: r.sortOrder
  }));
}

function setCustomFieldDefsImpl(
  projectId: string,
  defs: Omit<CustomFieldDef, 'id' | 'projectId'>[]
): CustomFieldDef[] {
  drizzleDb.delete(customFieldDefs).where(eq(customFieldDefs.projectId, projectId)).run();

  const records = defs.map((def, i) => ({
    id: generateId(),
    projectId,
    entityType: def.entityType,
    key: def.key,
    label: def.label,
    fieldType: def.fieldType,
    refEntityType: def.refEntityType || null,
    placeholder: def.placeholder || null,
    required: def.required,
    sortOrder: i
  }));

  for (const record of records) {
    drizzleDb.insert(customFieldDefs).values(record).run();
  }

  return records;
}

function addCustomFieldDefImpl(
  projectId: string,
  entityType: EntityType,
  def: {
    key: string;
    label: string;
    fieldType: CustomFieldDef['fieldType'];
    refEntityType?: EntityType | null;
    placeholder?: string;
    required?: boolean;
  }
): CustomFieldDef {
  const existing = drizzleDb
    .select()
    .from(customFieldDefs)
    .where(
      and(eq(customFieldDefs.projectId, projectId), eq(customFieldDefs.entityType, entityType))
    )
    .all();

  const record = {
    id: generateId(),
    projectId,
    entityType,
    key: def.key,
    label: def.label,
    fieldType: def.fieldType,
    refEntityType: def.refEntityType || null,
    placeholder: def.placeholder || null,
    required: def.required || false,
    sortOrder: existing.length
  };

  drizzleDb.insert(customFieldDefs).values(record).run();

  return record;
}

function deleteCustomFieldDefImpl(projectId: string, fieldId: string): boolean {
  const result = drizzleDb
    .delete(customFieldDefs)
    .where(and(eq(customFieldDefs.id, fieldId), eq(customFieldDefs.projectId, projectId)))
    .run();
  return result.changes > 0;
}

export const setCustomFieldDefs = (
  ...args: Parameters<typeof setCustomFieldDefsImpl>
): ReturnType<typeof setCustomFieldDefsImpl> =>
  withProjectMetadata(args[0], () => setCustomFieldDefsImpl(...args));

export const addCustomFieldDef = (
  ...args: Parameters<typeof addCustomFieldDefImpl>
): ReturnType<typeof addCustomFieldDefImpl> =>
  withProjectMetadata(args[0], () => addCustomFieldDefImpl(...args));

export const deleteCustomFieldDef = (
  ...args: Parameters<typeof deleteCustomFieldDefImpl>
): ReturnType<typeof deleteCustomFieldDefImpl> =>
  withProjectMetadata(args[0], () => deleteCustomFieldDefImpl(...args));
