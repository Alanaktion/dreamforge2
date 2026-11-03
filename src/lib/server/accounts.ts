import { randomBytes } from 'node:crypto';
import { and, count, eq, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import db from './db';
import {
  bookmarks,
  comments,
  projectInvites,
  projectMembers,
  projectPins,
  projects,
  sessions,
  users
} from './schema';
import { hash } from './password';
import { generateId } from '$lib/utils';

const index = drizzle(db);

export class AccountError extends Error {}

export interface UserSummary {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
  ownedProjects: number;
  sharedProjects: number;
}

export function listUsers(): UserSummary[] {
  const rows = index.select().from(users).orderBy(users.createdAt).all();
  const owned = new Map(
    index
      .select({ userId: projects.userId, n: count() })
      .from(projects)
      .groupBy(projects.userId)
      .all()
      .map((r) => [r.userId, r.n])
  );
  const shared = new Map(
    index
      .select({ userId: projectMembers.userId, n: count() })
      .from(projectMembers)
      .groupBy(projectMembers.userId)
      .all()
      .map((r) => [r.userId, r.n])
  );
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    isAdmin: u.isAdmin,
    disabled: u.disabled,
    createdAt: u.createdAt,
    ownedProjects: owned.get(u.id) ?? 0,
    sharedProjects: shared.get(u.id) ?? 0
  }));
}

function activeAdminCount(exceptUserId?: string): number {
  const where = exceptUserId
    ? and(eq(users.isAdmin, true), eq(users.disabled, false), ne(users.id, exceptUserId))
    : and(eq(users.isAdmin, true), eq(users.disabled, false));
  return index.select({ n: count() }).from(users).where(where).get()?.n ?? 0;
}

function requireUser(userId: string) {
  const user = index.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AccountError('User not found');
  return user;
}

export function setAdmin(actorId: string, userId: string, isAdmin: boolean): void {
  requireUser(userId);
  if (!isAdmin && activeAdminCount(userId) === 0)
    throw new AccountError('At least one active administrator must remain');
  if (!isAdmin && actorId === userId)
    throw new AccountError('Ask another administrator to remove your admin role');
  index.update(users).set({ isAdmin }).where(eq(users.id, userId)).run();
}

export function setDisabled(actorId: string, userId: string, disabled: boolean): void {
  requireUser(userId);
  if (actorId === userId) throw new AccountError('You cannot disable your own account');
  if (disabled && activeAdminCount(userId) === 0)
    throw new AccountError('At least one active administrator must remain');
  index.transaction((tx) => {
    tx.update(users).set({ disabled }).where(eq(users.id, userId)).run();
    if (disabled) tx.delete(sessions).where(eq(sessions.userId, userId)).run();
  });
}

export const MIN_PASSWORD_LENGTH = 8;

/** Finds a user by email (case-insensitive) or exact username. */
export function findUser(identifier: string) {
  const email = identifier.trim().toLowerCase();
  return index
    .select()
    .from(users)
    .where(or(sql`lower(${users.email}) = ${email}`, eq(users.username, identifier.trim())))
    .get();
}

export interface NewUser {
  email: string;
  username: string;
  password: string;
  isAdmin?: boolean;
  mustChangePassword?: boolean;
}

/** Creates an account with the same rules as the registration form. Returns the new user's ID. */
export async function createUser(input: NewUser): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  if (!email || !username || !input.password)
    throw new AccountError('Email, username and password are required');
  if (input.password.length < MIN_PASSWORD_LENGTH)
    throw new AccountError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const taken = index
    .select({ id: users.id })
    .from(users)
    .where(or(sql`lower(${users.email}) = ${email}`, eq(users.username, username)))
    .get();
  if (taken) throw new AccountError('Email or username already taken');
  const id = generateId();
  index
    .insert(users)
    .values({
      id,
      email,
      username,
      passwordHash: await hash(input.password),
      isAdmin: input.isAdmin ?? false,
      mustChangePassword: input.mustChangePassword ?? false,
      createdAt: new Date().toISOString()
    })
    .run();
  return id;
}

/** Sets a chosen password and signs the user out everywhere. */
export async function setPassword(
  userId: string,
  password: string,
  mustChangePassword = false
): Promise<void> {
  requireUser(userId);
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new AccountError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const passwordHash = await hash(password);
  index.transaction((tx) => {
    tx.update(users).set({ passwordHash, mustChangePassword }).where(eq(users.id, userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
  });
}

export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

export async function resetPassword(userId: string): Promise<string> {
  requireUser(userId);
  const temporary = generateTemporaryPassword();
  const passwordHash = await hash(temporary);
  index.transaction((tx) => {
    tx.update(users)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(users.id, userId))
      .run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
  });
  return temporary;
}

export function ownedProjectNames(userId: string): string[] {
  return index
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.userId, userId))
    .all()
    .map((p) => p.name);
}

export function deleteAccount(userId: string): void {
  const user = requireUser(userId);
  const owned = ownedProjectNames(userId);
  if (owned.length > 0)
    throw new AccountError(
      `Delete your projects first (${owned.join(', ')}). Other members keep nothing once a project is gone, so export anything you need.`
    );
  if (user.isAdmin && activeAdminCount(userId) === 0)
    throw new AccountError('Make someone else an administrator before deleting this account');
  index.transaction((tx) => {
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
    tx.delete(bookmarks).where(eq(bookmarks.userId, userId)).run();
    tx.delete(projectPins).where(eq(projectPins.userId, userId)).run();
    tx.delete(projectInvites).where(eq(projectInvites.createdBy, userId)).run();
    tx.delete(projectMembers).where(eq(projectMembers.userId, userId)).run();
    tx.delete(comments).where(eq(comments.userId, userId)).run();
    tx.delete(users).where(eq(users.id, userId)).run();
  });
}
