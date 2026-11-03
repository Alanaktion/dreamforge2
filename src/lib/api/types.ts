// Shapes returned by the FastAPI backend (backend/src/dreamforge_api/schemas.py).

export interface User {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface Me {
  user: User | null;
  allowRegistration: boolean;
}

export interface AuthResult {
  user: User;
  redirect: string;
}

export type ProjectRole = 'owner' | 'editor' | 'commenter';
export type MemberRole = 'editor' | 'commenter';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  modifiedAt: string;
  pinned: boolean;
  isOwner: boolean;
}

export interface Preset {
  label: string;
  description: string;
}

export interface ProjectList {
  projects: Project[];
  sharedProjects: Project[];
  presets: Record<string, Preset>;
}

export interface ProjectAccess {
  project: Project;
  role: ProjectRole;
}

export interface ProjectShell {
  projectName: string;
  role: ProjectRole;
  entityCounts: Record<string, number>;
  bookmarks: Array<{ id: string; entityId: string; entityName: string; entityType: string }>;
  /** Project files the server could not read, relative to the project folder. */
  storageProblems: Array<{ file: string; message: string }>;
}

export interface Member {
  id: string;
  userId: string;
  email: string;
  username: string;
  role: MemberRole;
  createdAt: string;
}

export interface Invite {
  token: string;
  projectId: string;
  role: MemberRole;
  createdAt: string;
  expiresAt: string;
}

export interface InvitePreview {
  projectId: string;
  projectName: string;
  role: MemberRole;
  alreadyMember: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
  ownedProjects: number;
  sharedProjects: number;
}

export interface AdminOverview {
  users: AdminUser[];
  currentUserId: string;
  registration: 'open' | 'closed' | 'default';
  registrationOpen: boolean;
}
