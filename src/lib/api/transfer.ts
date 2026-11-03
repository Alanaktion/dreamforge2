// CSV export/import, project ZIP export/import and backups over the API
// (backend/src/dreamforge_api/routers/transfer.py).
import { api, apiUpload } from '$lib/api';
import type { FieldValue } from '$lib/api/entities';

const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

/** Download link for the project as a ZIP. */
export const projectExportUrl = (projectId: string) => `${projectPath(projectId)}/export`;

/** Download link for one entity type as CSV (`route` is e.g. "characters"). */
export const csvUrl = (projectId: string, route: string) =>
  `${projectPath(projectId)}/csv/${encodeURIComponent(route)}`;

/** Restores a project from an exported or backed-up ZIP. Returns the new project's id. */
export async function importProjectZip(file: File): Promise<string> {
  const { id } = await apiUpload<{ id: string }>(
    '/api/projects/import',
    file,
    'Could not import that ZIP'
  );
  return id;
}

export interface CsvRow {
  id?: string;
  name: string;
  body?: string;
  tags?: string[];
  status?: string;
  fields: Record<string, FieldValue>;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export function importCsvRows(projectId: string, route: string, rows: CsvRow[]) {
  return api<CsvImportResult>(csvUrl(projectId, route), { method: 'POST', body: { rows } });
}

export interface Backup {
  name: string;
  size: number;
  createdAt: string;
}

const backupsPath = (projectId: string) => `${projectPath(projectId)}/backups`;

export const backupUrl = (projectId: string, name: string) =>
  `${backupsPath(projectId)}/${encodeURIComponent(name)}`;

export function listBackups(projectId: string, fetch?: typeof globalThis.fetch) {
  return api<{ backups: Backup[]; enabled: boolean }>(backupsPath(projectId), { fetch });
}

export function backUpNow(projectId: string) {
  return api<{ name: string }>(backupsPath(projectId), { method: 'POST' });
}

export function setBackupsEnabled(projectId: string, enabled: boolean) {
  return api(`${backupsPath(projectId)}/settings`, { method: 'PUT', body: { enabled } });
}
