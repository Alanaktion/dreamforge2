import { restoreProject } from '$lib/server/backups';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { writeFileAtomic } from '$lib/server/storage';
import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db';
import { projects } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getMemberProjects, getProjectAccess } from '$lib/server/members';
import { pinnedProjectIds, togglePin } from '$lib/server/pins';
import { resolveProjectPath } from '$lib/server/paths';
import { createProject, deleteProject } from '$lib/server/projects';
import {
  applyPreset,
  createSampleWorld,
  isPreset,
  PROJECT_PRESETS,
  SAMPLE_WORLD_NAME
} from '$lib/server/starter';
import { getProjectSummary } from '$lib/server/stats';
import fs from 'node:fs';
import path from 'node:path';
import type { PageServerLoad } from './$types';

const drizzleDb = drizzle(db);

function seedOrDiscard(project: { id: string; dataPath: string }, seed: () => void): void {
  try {
    seed();
  } catch (cause) {
    deleteProject(project.id, project.dataPath);
    throw cause;
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const ownedProjects = drizzleDb
    .select()
    .from(projects)
    .where(eq(projects.userId, locals.user.id))
    .orderBy(desc(projects.modifiedAt))
    .all();
  const pins = pinnedProjectIds(locals.user.id);
  const byPinThenActivity = (a: { id: string; modifiedAt: string }, b: typeof a) =>
    Number(pins.has(b.id)) - Number(pins.has(a.id)) || (a.modifiedAt < b.modifiedAt ? 1 : -1);

  const memberProjects = getMemberProjects(locals.user.id);

  const allProjectIds = new Set(ownedProjects.map((p) => p.id));
  const sharedProjects = memberProjects.filter((p) => !allProjectIds.has(p.id));

  const withSummary = <T extends { id: string; dataPath: string }>(p: T) => {
    try {
      return { ...p, summary: getProjectSummary(resolveProjectPath(p.id, p.dataPath)) };
    } catch {
      return { ...p, summary: null };
    }
  };

  return {
    presets: PROJECT_PRESETS,
    projects: ownedProjects
      .sort(byPinThenActivity)
      .map((p) => withSummary({ ...p, pinned: pins.has(p.id), isOwner: true })),
    sharedProjects: sharedProjects
      .sort(byPinThenActivity)
      .map((p) => withSummary({ ...p, pinned: pins.has(p.id), isOwner: false }))
  };
};

export const actions = {
  import: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const form = await request.formData();
    const file = form.get('archive');
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024)
      return fail(400, { error: 'Choose a ZIP file up to 20 MB' });
    const temporary = path.join(os.tmpdir(), `dreamforge-${randomUUID()}.zip`);
    try {
      writeFileAtomic(temporary, Buffer.from(await file.arrayBuffer()));
      const projectId = await restoreProject(temporary, locals.user.id);
      return { success: true, projectId };
    } catch (cause) {
      return fail(400, { error: cause instanceof Error ? cause.message : 'Restore failed' });
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  },
  create: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const form = await request.formData();
    const name = String(form.get('name') || '').trim();
    const description = String(form.get('description') || '').trim();
    const preset = form.get('preset') || 'blank';

    if (!name) return fail(400, { error: 'Name is required' });
    if (!isPreset(preset)) return fail(400, { error: 'Unknown starter' });

    const project = createProject(locals.user.id, { name, description });
    seedOrDiscard(project, () => applyPreset(project.id, project.dataPath, preset));

    redirect(303, `/projects/${project.id}`);
  },

  sample: async ({ locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const project = createProject(locals.user.id, {
      name: SAMPLE_WORLD_NAME,
      description: 'A small example world to explore. Delete it from Settings when you are done.'
    });
    seedOrDiscard(project, () => createSampleWorld(project.id, project.dataPath));
    redirect(303, `/projects/${project.id}`);
  },

  togglePin: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const form = await request.formData();
    const projectId = String(form.get('projectId') || '');
    if (!getProjectAccess(projectId, locals.user.id))
      return fail(404, { error: 'Project not found' });

    togglePin(locals.user.id, projectId);
    return { success: true };
  }
};
