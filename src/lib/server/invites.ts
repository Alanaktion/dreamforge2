import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import db from './db';
import { projectInvites, projects } from './schema';
import { addMember, getProjectAccess } from './members';

const index = drizzle(db);
const DAY_MS = 86_400_000;

export type InviteRole = 'editor' | 'commenter';

export interface Invite {
  token: string;
  projectId: string;
  role: InviteRole;
  createdAt: string;
  expiresAt: string;
}

export function createInvite(
  projectId: string,
  createdBy: string,
  role: InviteRole,
  days = 7,
  now = Date.now()
): Invite {
  const invite = {
    token: randomBytes(18).toString('base64url'),
    projectId,
    role,
    createdBy,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + days * DAY_MS).toISOString(),
    revoked: false
  };
  index.insert(projectInvites).values(invite).run();
  return invite;
}

export function listInvites(projectId: string, now = Date.now()): Invite[] {
  return index
    .select()
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.projectId, projectId),
        eq(projectInvites.revoked, false),
        gt(projectInvites.expiresAt, new Date(now).toISOString())
      )
    )
    .all()
    .map((row) => ({ ...row, role: row.role as InviteRole }));
}

export function revokeInvite(projectId: string, token: string): boolean {
  return (
    index
      .update(projectInvites)
      .set({ revoked: true })
      .where(and(eq(projectInvites.projectId, projectId), eq(projectInvites.token, token)))
      .run().changes > 0
  );
}

export function findInvite(
  token: string,
  now = Date.now()
): (Invite & { projectName: string }) | null {
  const row = index
    .select({ invite: projectInvites, projectName: projects.name })
    .from(projectInvites)
    .innerJoin(projects, eq(projectInvites.projectId, projects.id))
    .where(eq(projectInvites.token, token))
    .get();
  if (!row || row.invite.revoked || row.invite.expiresAt <= new Date(now).toISOString())
    return null;
  return { ...row.invite, role: row.invite.role as InviteRole, projectName: row.projectName };
}

export function acceptInvite(token: string, userId: string, now = Date.now()): string | null {
  const invite = findInvite(token, now);
  if (!invite) return null;
  const access = getProjectAccess(invite.projectId, userId);
  if (!access || (access.role === 'commenter' && invite.role === 'editor'))
    addMember(invite.projectId, userId, invite.role);
  return invite.projectId;
}
