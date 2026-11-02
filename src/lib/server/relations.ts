import { readJson, writeJson } from './storage';
import path from 'node:path';
import { generateId } from '$lib/utils';

export interface RelationEntry {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  label: string | null;
}

function getRelationsPath(projectPath: string): string {
  return path.join(projectPath, 'relations.json');
}

export function loadRelations(projectPath: string): RelationEntry[] {
  return readJson(getRelationsPath(projectPath), [], Array.isArray);
}

export function saveRelations(projectPath: string, relations: RelationEntry[]): void {
  writeJson(getRelationsPath(projectPath), relations);
}

export function addRelation(projectPath: string, data: Omit<RelationEntry, 'id'>): RelationEntry {
  const relations = loadRelations(projectPath);
  const relation: RelationEntry = { id: generateId(), ...data };
  relations.push(relation);
  saveRelations(projectPath, relations);
  return relation;
}

export function deleteRelation(projectPath: string, relationId: string): void {
  const relations = loadRelations(projectPath).filter((r) => r.id !== relationId);
  saveRelations(projectPath, relations);
}

/**
 * Removes relations touching `entityId` and returns them, so a caller (soft-delete)
 * can stash them for later restoration rather than losing them outright.
 */
export function removeRelationsForEntity(projectPath: string, entityId: string): RelationEntry[] {
  const relations = loadRelations(projectPath);
  const removed = relations.filter((r) => r.sourceId === entityId || r.targetId === entityId);
  if (removed.length === 0) return [];

  const kept = relations.filter((r) => r.sourceId !== entityId && r.targetId !== entityId);
  saveRelations(projectPath, kept);
  return removed;
}

/**
 * Re-adds previously removed relations, skipping any that already exist (by id) —
 * relevant if the entity was restored more than once or relations were edited
 * manually while it was in the trash.
 */
export function restoreRelations(projectPath: string, restored: RelationEntry[]): void {
  if (restored.length === 0) return;
  const relations = loadRelations(projectPath);
  const existingIds = new Set(relations.map((r) => r.id));
  for (const r of restored) {
    if (!existingIds.has(r.id)) relations.push(r);
  }
  saveRelations(projectPath, relations);
}
