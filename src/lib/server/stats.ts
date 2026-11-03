import fs from 'node:fs';
import { ENTITY_DIRS, getEntityDir, listEntities } from './entities';
import { listStories, listChapters, listScenes } from './stories';
import { loadRelations } from './relations';
import { countWords } from '$lib/utils/wordCount';
import { entityTypeToRoute } from '$lib/utils/entityTypes';
import type { EntityType, ProjectStats, RecentItem, StoryStats } from '$lib/types';

const RECENT_LIMIT = 8;

export interface SceneRef {
  storyId: string;
  storyTitle: string;
  chapterTitle: string;
  sceneId: string;
  title: string;
  wordCount: number;
  modifiedAt: string;
}

/**
 * Reads every story once, returning both the per-story rollups and a flat list of
 * scenes so callers that need scene-level detail don't have to walk the files again.
 */
export function collectStories(projectPath: string): { stories: StoryStats[]; scenes: SceneRef[] } {
  const stories: StoryStats[] = [];
  const scenes: SceneRef[] = [];

  for (const story of listStories(projectPath)) {
    const chapters = listChapters(projectPath, story.id);
    let storyScenes = 0;
    let storyWords = 0;

    for (const chapter of chapters) {
      const chapterScenes = listScenes(projectPath, story.id, chapter.id);
      storyScenes += chapterScenes.length;

      chapterScenes.forEach((scene, i) => {
        const words = countWords(scene.body);
        storyWords += words;
        scenes.push({
          storyId: story.id,
          storyTitle: story.title,
          chapterTitle: chapter.title,
          sceneId: scene.id,
          title: scene.title || `Scene ${i + 1}`,
          wordCount: words,
          modifiedAt: scene.modifiedAt
        });
      });
    }

    stories.push({
      id: story.id,
      title: story.title,
      description: story.description,
      chapterCount: chapters.length,
      sceneCount: storyScenes,
      wordCount: storyWords,
      modifiedAt: story.modifiedAt
    });
  }

  return { stories, scenes };
}

/**
 * Walks every scene and entity file once and aggregates the numbers the dashboard
 * shows. This reads the filesystem rather than the SQLite index because word counts
 * live in the file bodies, which the index deliberately does not store.
 */
export function getProjectStats(projectId: string, projectPath: string): ProjectStats {
  const entityCounts = {} as Record<EntityType, number>;
  const recent: RecentItem[] = [];
  let totalEntities = 0;

  for (const type of Object.keys(ENTITY_DIRS) as EntityType[]) {
    const list = listEntities(projectId, projectPath, type);
    entityCounts[type] = list.length;
    totalEntities += list.length;

    for (const entity of list.slice(0, RECENT_LIMIT)) {
      recent.push({
        kind: 'entity',
        id: entity.id,
        name: entity.name,
        context: type,
        href: `/projects/${projectId}/${entityTypeToRoute(type)}/${entity.id}`,
        modifiedAt: entity.modifiedAt
      });
    }
  }

  const { stories, scenes } = collectStories(projectPath);

  let lastScene: ProjectStats['lastScene'] = null;
  let lastSceneModified = '';

  for (const scene of scenes) {
    recent.push({
      kind: 'scene',
      id: scene.sceneId,
      name: scene.title,
      context: `${scene.storyTitle} › ${scene.chapterTitle}`,
      href: `/projects/${projectId}/stories/${scene.storyId}?scene=${scene.sceneId}`,
      modifiedAt: scene.modifiedAt
    });

    if (scene.modifiedAt > lastSceneModified) {
      lastSceneModified = scene.modifiedAt;
      lastScene = {
        storyId: scene.storyId,
        sceneId: scene.sceneId,
        title: scene.title,
        storyTitle: scene.storyTitle
      };
    }
  }

  recent.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));

  return {
    entityCounts,
    totalEntities,
    storyCount: stories.length,
    chapterCount: stories.reduce((sum, s) => sum + s.chapterCount, 0),
    sceneCount: stories.reduce((sum, s) => sum + s.sceneCount, 0),
    wordCount: stories.reduce((sum, s) => sum + s.wordCount, 0),
    stories,
    recent: recent.slice(0, RECENT_LIMIT),
    lastScene
  };
}

export interface ProjectSummary {
  entityCount: number;
  storyCount: number;
  wordCount: number;
}

export function getProjectSummary(projectPath: string): ProjectSummary {
  let entityCount = 0;
  for (const type of Object.keys(ENTITY_DIRS) as EntityType[]) {
    const dir = getEntityDir(projectPath, type);
    if (fs.existsSync(dir))
      entityCount += fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  }
  const { stories } = collectStories(projectPath);
  return {
    entityCount,
    storyCount: stories.length,
    wordCount: stories.reduce((sum, s) => sum + s.wordCount, 0)
  };
}

export interface GettingStarted {
  character: boolean;
  scene: boolean;
  relation: boolean;
  mention: boolean;
}

export function getGettingStarted(stats: ProjectStats, projectPath: string): GettingStarted {
  let mention = false;
  outer: for (const story of listStories(projectPath))
    for (const chapter of listChapters(projectPath, story.id))
      for (const scene of listScenes(projectPath, story.id, chapter.id))
        if (scene.body.includes('](mention://')) {
          mention = true;
          break outer;
        }
  return {
    character: (stats.entityCounts.character ?? 0) > 0,
    scene: stats.wordCount > 0,
    relation: loadRelations(projectPath).length > 0,
    mention
  };
}
