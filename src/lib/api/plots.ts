// Plotlines and beats over the API (backend/src/dreamforge_api/routers/plots.py).
import { api } from '$lib/api';
import type { Plotline } from '$lib/api/stories';

export type { PlotBeat, Plotline } from '$lib/api/stories';

export const PLOT_TEMPLATES = {
  heros_journey: "Hero's Journey",
  save_the_cat: 'Save the Cat',
  snowflake: 'Snowflake Method'
} as const;
export type PlotTemplate = keyof typeof PLOT_TEMPLATES;

export const plotlinesPath = (projectId: string) => `/api/projects/${projectId}/plotlines`;
export const plotlinePath = (projectId: string, plotlineId: string) =>
  `${plotlinesPath(projectId)}/${encodeURIComponent(plotlineId)}`;
const beatPath = (projectId: string, plotlineId: string, beatId: string) =>
  `${plotlinePath(projectId, plotlineId)}/beats/${encodeURIComponent(beatId)}`;

export function createPlotline(
  projectId: string,
  title: string,
  storyId: string,
  template: PlotTemplate | null
) {
  return api<Plotline>(plotlinesPath(projectId), {
    method: 'POST',
    body: { title, storyId, template }
  });
}

export function renamePlotline(projectId: string, plotlineId: string, title: string) {
  return api<Plotline>(plotlinePath(projectId, plotlineId), { method: 'PATCH', body: { title } });
}

export function deletePlotline(projectId: string, plotlineId: string) {
  return api(plotlinePath(projectId, plotlineId), { method: 'DELETE' });
}

export function addBeat(projectId: string, plotlineId: string, title: string) {
  return api<Plotline>(`${plotlinePath(projectId, plotlineId)}/beats`, {
    method: 'POST',
    body: { title }
  });
}

export function updateBeat(
  projectId: string,
  plotlineId: string,
  beatId: string,
  changes: { title?: string; sceneId?: string | null }
) {
  return api<Plotline>(beatPath(projectId, plotlineId, beatId), { method: 'PATCH', body: changes });
}

export function deleteBeat(projectId: string, plotlineId: string, beatId: string) {
  return api<Plotline>(beatPath(projectId, plotlineId, beatId), { method: 'DELETE' });
}

export function reorderBeats(projectId: string, plotlineId: string, ids: string[]) {
  return api<Plotline>(`${plotlinePath(projectId, plotlineId)}/beats/order`, {
    method: 'PUT',
    body: { ids }
  });
}
