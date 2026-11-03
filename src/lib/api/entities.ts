// Entities over the API (backend/src/dreamforge_api/routers/entities.py), plus the value
// coercion the old form actions did on the server: the API takes typed JSON, so forms and
// grid cells turn their strings into lists, booleans and numbers here.
import { api, ApiError } from '$lib/api';
import { applyPromptAnswer, getPrompt } from '$lib/brainstorm';
import { ENTITY_FIELDS, mergeFields, type FieldDef } from '$lib/entityFields';
import type { EntityType } from '$lib/types';
import { entityTypeToRoute } from '$lib/utils/entityTypes';

export interface Entity {
  revision: string;
  id: string;
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

export interface EntitySummary {
  id: string;
  type: EntityType;
  name: string;
  status: string;
  tags: string[];
}

export interface CustomField {
  id: string;
  entityType: EntityType;
  key: string;
  label: string;
  fieldType: FieldDef['type'];
  refEntityType: EntityType | null;
  placeholder: string | null;
  required: boolean;
  sortOrder: number;
}

export interface TrashedEntity {
  id: string;
  entityId: string;
  entityType: EntityType;
  name: string;
  deletedAt: string;
  expiresAt: string;
}

export type FieldValue = string | number | boolean | null | string[];

export function entitiesPath(projectId: string, type: EntityType): string {
  return `/api/projects/${projectId}/entities/${entityTypeToRoute(type)}`;
}

export function entityPath(projectId: string, type: EntityType, id: string): string {
  return `${entitiesPath(projectId, type)}/${encodeURIComponent(id)}`;
}

/** The built-in fields for a type, with the project's custom fields merged in. */
export function fieldsFor(type: EntityType, custom: CustomField[]): FieldDef[] {
  return mergeFields(
    ENTITY_FIELDS[type],
    custom.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.fieldType,
      entityType: f.refEntityType || undefined,
      placeholder: f.placeholder || undefined,
      required: f.required
    }))
  );
}

export function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One edited value, as the grid's quick update coerced it. Throws on a bad number. */
export function cellValue(type: FieldDef['type'] | undefined, raw: string): FieldValue {
  if (type === 'tags') return splitList(raw);
  if (type === 'boolean') return raw === 'true';
  if (type === 'number') {
    if (raw === '') return '';
    const number = Number(raw);
    if (Number.isNaN(number)) throw new ApiError(400, 'Invalid number');
    return number;
  }
  return raw;
}

/** Field values from the create form: empty inputs are left out, checkboxes become true. */
export function createFormValues(form: HTMLFormElement, fields: FieldDef[]) {
  const data = new FormData(form);
  const values: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.type === 'image') continue;
    const raw = data.get(field.key);
    if (field.type === 'boolean') {
      if (raw !== null) values[field.key] = true;
      continue;
    }
    if (typeof raw !== 'string' || !raw.trim()) continue;
    if (field.type === 'number' && Number.isNaN(Number(raw))) {
      throw new ApiError(400, `Invalid number for ${field.label}`);
    }
    values[field.key] = cellValue(field.type, raw);
  }
  return values;
}

/** Field values from the entity editor: every named input, typed by its field. */
export function editFormValues(form: HTMLFormElement, fields: FieldDef[]) {
  const types = new Map<string, FieldDef['type']>(fields.map((f) => [f.key, f.type]));
  types.set('tags', 'tags');
  const values: Record<string, FieldValue> = {};
  let body: string | undefined;
  for (const [key, value] of new FormData(form)) {
    if (key === 'revision' || key === 'overwrite' || typeof value !== 'string') continue;
    if (key === 'body') {
      body = value;
      continue;
    }
    const type = types.get(key);
    if (type === 'boolean') values[key] = value === 'true' || value === 'on';
    else if (type === 'tags') values[key] = splitList(value);
    else values[key] = value;
  }
  return { fields: values, body };
}

export function createEntity(
  projectId: string,
  type: EntityType,
  name: string,
  fields: Record<string, FieldValue> = {},
  body = ''
) {
  return api<Entity>(entitiesPath(projectId, type), {
    method: 'POST',
    body: { name, fields, body }
  });
}

export function updateEntity(
  projectId: string,
  type: EntityType,
  id: string,
  change: { fields?: Record<string, FieldValue>; body?: string },
  revision: string | null
) {
  return api<{ revision: string; entity: Entity }>(entityPath(projectId, type, id), {
    method: 'PATCH',
    body: { ...change, revision: revision ?? undefined, overwrite: revision === null }
  });
}

export function deleteEntity(projectId: string, type: EntityType, id: string) {
  return api<TrashedEntity>(entityPath(projectId, type, id), { method: 'DELETE' });
}

export function restoreFromTrash(projectId: string, trashId: string) {
  return api(`/api/projects/${projectId}/trash/${encodeURIComponent(trashId)}/restore`, {
    method: 'POST'
  });
}

/**
 * Save a brainstorm answer into the entity. Reads the latest file first and saves against
 * its revision, so an answer never overwrites an edit made elsewhere in the meantime.
 */
export async function answerPrompt(
  projectId: string,
  type: EntityType,
  id: string,
  promptId: string,
  answer: string
) {
  const prompt = getPrompt(type, promptId);
  if (!prompt) throw new ApiError(400, 'Unknown prompt');
  const text = answer.trim();
  if (!text) throw new ApiError(400, 'Answer is empty');
  const entity = await api<Entity>(`${entityPath(projectId, type, id)}/content`);
  const { body, ...fields } = applyPromptAnswer(type, entity, prompt, text);
  return updateEntity(
    projectId,
    type,
    id,
    {
      fields: fields as Record<string, FieldValue>,
      body: typeof body === 'string' ? body : undefined
    },
    entity.revision
  );
}
