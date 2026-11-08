export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  dataPath: string;
  pinned: boolean;
  createdAt: string;
  modifiedAt: string;
}

export type EntityType =
  'character' | 'organization' | 'location' | 'culture' | 'species' | 'item' | 'note';

export interface EntityIndex {
  primaryImageUrl?: string | null;
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  tags: string[];
  status: 'draft' | 'wip' | 'complete';
  imagePath: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface Story {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  sortOrder: number;
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

export type SceneStatus = 'draft' | 'revised' | 'final';

export interface Scene {
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
  plotThreads: PlotThread[];
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
}

export interface PlotThread {
  thread: string;
  type: 'setup' | 'payoff' | 'ongoing';
}

export interface Relation {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  label: string | null;
}

export interface Bookmark {
  id: string;
  userId: string;
  projectId: string;
  entityId: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
}

export type Theme = 'light' | 'dark';

export type BacklinkReason = 'mention' | 'participant' | 'narrator' | 'place' | 'field';

export interface Backlink {
  primaryImageUrl?: string | null;
  kind: 'entity' | 'scene';
  id: string;
  name: string;
  context: string;
  href: string;
  reason: BacklinkReason;
}

export interface WritingProgress {
  dailyGoal: number;
  storyTargets: Record<string, number>;
  todayWords: number;
  streak: number;
  best: number;
  total30: number;
  recent: Array<{ date: string; words: number }>;
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

export interface RecentItem {
  primaryImageUrl?: string | null;
  kind: 'entity' | 'scene';
  id: string;
  name: string;
  context: string;
  href: string;
  modifiedAt: string;
}

export interface ProjectStats {
  entityCounts: Record<EntityType, number>;
  totalEntities: number;
  storyCount: number;
  chapterCount: number;
  sceneCount: number;
  wordCount: number;
  stories: StoryStats[];
  recent: RecentItem[];
  lastScene: { storyId: string; sceneId: string; title: string; storyTitle: string } | null;
}
