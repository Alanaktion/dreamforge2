// Stories, chapters and scenes over the API (backend/src/dreamforge_api/routers/stories.py).
import { api } from '$lib/api';
import type { EntitySummary, TrashedEntity } from '$lib/api/entities';
import type { SceneStatus } from '$lib/types';

export interface Story {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
}

export interface StoryStats {
  id: string;
  title: string;
  description: string | null;
  chapterCount: number;
  sceneCount: number;
  wordCount: number;
  modifiedAt: string;
}

export interface Scene {
  revision: string;
  id: string;
  chapterId: string;
  title: string | null;
  status: SceneStatus;
  narrator: string | null;
  time: string | null;
  place: string | null;
  participants: string[];
  backgroundImage: string | null;
  summary: string | null;
  plotThreads: Array<Record<string, unknown>>;
  sortOrder: number;
  body: string;
  createdAt: string;
  modifiedAt: string;
}

export interface Chapter {
  id: string;
  storyId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
}

export interface ChapterWithScenes extends Chapter {
  scenes: Scene[];
}

export interface PlotBeat {
  id: string;
  title: string;
  sceneId: string | null;
  sortOrder: number;
}

export interface Plotline {
  id: string;
  storyId: string;
  title: string;
  template: string | null;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
  beats: PlotBeat[];
}

export interface StoryDetail {
  story: Story;
  chapters: ChapterWithScenes[];
  entities: EntitySummary[];
  images: Array<{ id: string; filename: string; originalName: string; altText: string | null }>;
  plotlines: Plotline[];
  projectName: string;
  role: 'owner' | 'editor' | 'commenter';
}

export type SceneChanges = Partial<
  Pick<
    Scene,
    | 'title'
    | 'status'
    | 'narrator'
    | 'time'
    | 'place'
    | 'participants'
    | 'backgroundImage'
    | 'summary'
    | 'body'
  >
>;

export const storiesPath = (projectId: string) => `/api/projects/${projectId}/stories`;
export const storyPath = (projectId: string, storyId: string) =>
  `${storiesPath(projectId)}/${encodeURIComponent(storyId)}`;
const chapterPath = (projectId: string, storyId: string, chapterId: string) =>
  `${storyPath(projectId, storyId)}/chapters/${encodeURIComponent(chapterId)}`;
const scenePath = (projectId: string, storyId: string, chapterId: string, sceneId: string) =>
  `${chapterPath(projectId, storyId, chapterId)}/scenes/${encodeURIComponent(sceneId)}`;

export function createStory(projectId: string, title: string, description: string) {
  return api<{ storyId: string; chapterId: string; sceneId: string }>(storiesPath(projectId), {
    method: 'POST',
    body: { title, description }
  });
}

export function updateStory(
  projectId: string,
  storyId: string,
  title: string,
  description?: string | null
) {
  return api<Story>(storyPath(projectId, storyId), {
    method: 'PATCH',
    body: { title, description }
  });
}

export function setStoryTarget(projectId: string, storyId: string, target: number) {
  return api(`${storyPath(projectId, storyId)}/target`, { method: 'PUT', body: { target } });
}

export function deleteStory(projectId: string, storyId: string) {
  return api<TrashedEntity>(storyPath(projectId, storyId), { method: 'DELETE' });
}

export function createChapter(projectId: string, storyId: string, title: string) {
  return api<Chapter>(`${storyPath(projectId, storyId)}/chapters`, {
    method: 'POST',
    body: { title }
  });
}

export function renameChapter(
  projectId: string,
  storyId: string,
  chapterId: string,
  title: string
) {
  return api<Chapter>(chapterPath(projectId, storyId, chapterId), {
    method: 'PATCH',
    body: { title }
  });
}

export function deleteChapter(projectId: string, storyId: string, chapterId: string) {
  return api<TrashedEntity>(chapterPath(projectId, storyId, chapterId), { method: 'DELETE' });
}

export function reorderChapters(projectId: string, storyId: string, ids: string[]) {
  return api(`${storyPath(projectId, storyId)}/chapters/order`, { method: 'PUT', body: { ids } });
}

export function createScene(projectId: string, storyId: string, chapterId: string) {
  return api<Scene>(`${chapterPath(projectId, storyId, chapterId)}/scenes`, { method: 'POST' });
}

/** `revision: null` overwrites whatever is on disk (the user chose to). */
export function updateScene(
  projectId: string,
  storyId: string,
  chapterId: string,
  sceneId: string,
  changes: SceneChanges,
  revision: string | null
) {
  return api<{ revision: string; scene: Scene; warning: string }>(
    scenePath(projectId, storyId, chapterId, sceneId),
    {
      method: 'PATCH',
      body: { ...changes, revision: revision ?? undefined, overwrite: revision === null }
    }
  );
}

export function deleteScene(
  projectId: string,
  storyId: string,
  chapterId: string,
  sceneId: string
) {
  return api<TrashedEntity>(scenePath(projectId, storyId, chapterId, sceneId), {
    method: 'DELETE'
  });
}

export function reorderScenes(
  projectId: string,
  storyId: string,
  chapterId: string,
  ids: string[]
) {
  return api(`${chapterPath(projectId, storyId, chapterId)}/scenes/order`, {
    method: 'PUT',
    body: { ids }
  });
}

export function sceneToNote(
  projectId: string,
  storyId: string,
  chapterId: string,
  sceneId: string
) {
  return api<{ noteId: string }>(
    `${scenePath(projectId, storyId, chapterId, sceneId)}/convert-to-note`,
    { method: 'POST' }
  );
}

export function noteToScene(
  projectId: string,
  noteId: string,
  storyId: string,
  chapterId: string | null,
  newChapterTitle = ''
) {
  return api<{ storyId: string; sceneId: string }>(
    `/api/projects/${projectId}/entities/notes/${encodeURIComponent(noteId)}/convert-to-scene`,
    { method: 'POST', body: { storyId, chapterId, newChapterTitle } }
  );
}

export function exportUrl(projectId: string, storyId: string, query: string) {
  return `${storyPath(projectId, storyId)}/export${query ? `?${query}` : ''}`;
}
