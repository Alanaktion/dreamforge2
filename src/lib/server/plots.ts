import { writeFileAtomic } from './storage';
import fs from 'node:fs';
import path from 'node:path';
import { generateId, isSafePathSegment } from '$lib/utils';
import { getTemplateBeats } from './plotTemplates';

export interface PlotBeat {
  id: string;
  title: string;
  sceneId: string | null;
  sortOrder: number;
}

export interface Plotline {
  id: string;
  projectId: string;
  storyId: string;
  title: string;
  template: string | null;
  beats: PlotBeat[];
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
}

function getPlotlinesDir(projectPath: string): string {
  return path.join(projectPath, 'plotlines');
}

function getPlotlinePath(projectPath: string, plotlineId: string): string {
  return path.join(getPlotlinesDir(projectPath), `${plotlineId}.json`);
}

export function listPlotlines(projectPath: string): Plotline[] {
  const dir = getPlotlinesDir(projectPath);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const data = fs.readFileSync(path.join(dir, f), 'utf-8');
        return backfillBeatIds(projectPath, JSON.parse(data) as Plotline);
      } catch {
        return null;
      }
    })
    .filter((p): p is Plotline => p !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Beats predate having their own id — they were matched on `title`, which breaks
// as soon as two beats share a title. Assigns one to any beat read from disk that
// doesn't have one yet, and persists the fix so every subsequent read is stable.
function backfillBeatIds(projectPath: string, plotline: Plotline): Plotline {
  let changed = false;
  const beats = plotline.beats.map((beat) => {
    if (beat.id) return beat;
    changed = true;
    return { ...beat, id: generateId() };
  });

  if (!changed) return plotline;

  const filePath = getPlotlinePath(projectPath, plotline.id);
  const updated = { ...plotline, beats };
  writeFileAtomic(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

export function getPlotline(projectPath: string, plotlineId: string): Plotline | null {
  if (!isSafePathSegment(plotlineId)) return null;
  const filePath = getPlotlinePath(projectPath, plotlineId);
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const plotline = JSON.parse(data) as Plotline;
    return backfillBeatIds(projectPath, plotline);
  } catch {
    return null;
  }
}

export function createPlotline(
  projectPath: string,
  data: { title: string; storyId: string; template?: string | null }
): Plotline {
  const id = generateId();
  const now = new Date().toISOString();
  const existing = listPlotlines(projectPath);
  const maxOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1);

  const templateBeats = getTemplateBeats(data.template || null);
  const beats: PlotBeat[] = templateBeats
    ? templateBeats.map((title, i) => ({ id: generateId(), title, sceneId: null, sortOrder: i }))
    : [];

  const plotline: Plotline = {
    id,
    projectId: path.basename(projectPath),
    storyId: data.storyId,
    title: data.title,
    template: data.template || null,
    beats,
    sortOrder: maxOrder + 1,
    createdAt: now,
    modifiedAt: now
  };

  const dir = getPlotlinesDir(projectPath);
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(getPlotlinePath(projectPath, id), JSON.stringify(plotline, null, 2));

  return plotline;
}

export function updatePlotline(
  projectPath: string,
  plotlineId: string,
  data: Partial<Plotline>
): Plotline | null {
  const plotline = getPlotline(projectPath, plotlineId);
  if (!plotline) return null;

  const updated: Plotline = {
    ...plotline,
    ...data,
    modifiedAt: new Date().toISOString()
  };

  writeFileAtomic(getPlotlinePath(projectPath, plotlineId), JSON.stringify(updated, null, 2));
  return updated;
}

export function deletePlotline(projectPath: string, plotlineId: string): boolean {
  if (!isSafePathSegment(plotlineId)) return false;
  const filePath = getPlotlinePath(projectPath, plotlineId);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function reorderBeats(
  projectPath: string,
  plotlineId: string,
  beatIds: string[]
): Plotline | null {
  const plotline = getPlotline(projectPath, plotlineId);
  if (!plotline) return null;

  const beatMap = new Map(plotline.beats.map((b) => [b.id, b]));
  const reordered: PlotBeat[] = beatIds
    .map((id, i) => {
      const beat = beatMap.get(id);
      return beat ? { ...beat, sortOrder: i } : null;
    })
    .filter((b): b is PlotBeat => b !== null);

  return updatePlotline(projectPath, plotlineId, { beats: reordered });
}

export function addBeat(projectPath: string, plotlineId: string, title: string): Plotline | null {
  const plotline = getPlotline(projectPath, plotlineId);
  if (!plotline) return null;

  const maxOrder = plotline.beats.reduce((max, b) => Math.max(max, b.sortOrder), -1);
  const beat: PlotBeat = { id: generateId(), title, sceneId: null, sortOrder: maxOrder + 1 };

  return updatePlotline(projectPath, plotlineId, { beats: [...plotline.beats, beat] });
}

export function renameBeat(
  projectPath: string,
  plotlineId: string,
  beatId: string,
  title: string
): Plotline | null {
  const plotline = getPlotline(projectPath, plotlineId);
  if (!plotline) return null;

  const beats = plotline.beats.map((b) => (b.id === beatId ? { ...b, title } : b));
  return updatePlotline(projectPath, plotlineId, { beats });
}

export function deleteBeat(
  projectPath: string,
  plotlineId: string,
  beatId: string
): Plotline | null {
  const plotline = getPlotline(projectPath, plotlineId);
  if (!plotline) return null;

  const beats = plotline.beats.filter((b) => b.id !== beatId);
  return updatePlotline(projectPath, plotlineId, { beats });
}

export function linkSceneToBeat(
  projectPath: string,
  plotlineId: string,
  beatId: string,
  sceneId: string | null
): Plotline | null {
  const plotline = getPlotline(projectPath, plotlineId);
  if (!plotline) return null;

  const beats = plotline.beats.map((b) => (b.id === beatId ? { ...b, sceneId } : b));
  return updatePlotline(projectPath, plotlineId, { beats });
}
