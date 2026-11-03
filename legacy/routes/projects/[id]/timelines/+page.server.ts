import { fail, redirect } from '@sveltejs/kit';
import {
  loadTimeline,
  addEvent,
  updateEvent,
  deleteEvent,
  updateCalendar
} from '$lib/server/timelines';
import db from '$lib/server/db';
import { entities as entitiesTable } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getProjectAccess } from '$lib/server/members';
import type { PageServerLoad } from './$types';

const drizzleDb = drizzle(db);

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const timeline = loadTimeline(project.dataPath);
  const allEntities = drizzleDb
    .select({ id: entitiesTable.id, name: entitiesTable.name, type: entitiesTable.type })
    .from(entitiesTable)
    .where(eq(entitiesTable.projectId, params.id))
    .all();

  return {
    timeline,
    entities: allEntities,
    projectName: project.name,
    role
  };
};

export const actions = {
  createEvent: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const year = parseInt(form.get('year') as string);
    const title = form.get('title') as string;

    if (!title || isNaN(year)) return fail(400, { error: 'Title and year are required' });

    const monthRaw = form.get('month') as string;
    const dayRaw = form.get('day') as string;
    const entityIdsRaw = form.get('entityIds') as string;

    addEvent(project.dataPath, {
      year,
      month: monthRaw ? parseInt(monthRaw) : null,
      day: dayRaw ? parseInt(dayRaw) : null,
      era: (form.get('era') as string) || 'CE',
      title,
      description: (form.get('description') as string) || '',
      significance: (form.get('significance') as 'major' | 'minor' | 'trivial') || 'minor',
      entityIds: entityIdsRaw ? JSON.parse(entityIdsRaw) : []
    });

    return { success: true };
  },

  updateEvent: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const eventId = form.get('eventId') as string;
    const yearRaw = form.get('year') as string;
    const monthRaw = form.get('month') as string;
    const dayRaw = form.get('day') as string;
    const entityIdsRaw = form.get('entityIds') as string;

    if (!eventId) return fail(400, { error: 'Event ID required' });

    const updates: Record<string, unknown> = {};
    if (form.has('title')) updates.title = form.get('title') as string;
    if (form.has('description')) updates.description = form.get('description') as string;
    if (form.has('era')) updates.era = form.get('era') as string;
    if (form.has('significance')) updates.significance = form.get('significance') as string;
    if (yearRaw) updates.year = parseInt(yearRaw);
    if (monthRaw) updates.month = parseInt(monthRaw);
    if (form.has('month')) updates.month = monthRaw ? parseInt(monthRaw) : null;
    if (form.has('day')) updates.day = dayRaw ? parseInt(dayRaw) : null;
    if (entityIdsRaw) updates.entityIds = JSON.parse(entityIdsRaw);

    const result = updateEvent(project.dataPath, eventId, updates as any);
    if (!result) return fail(404, { error: 'Event not found' });

    return { success: true };
  },

  deleteEvent: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const eventId = form.get('eventId') as string;
    if (!eventId) return fail(400, { error: 'Event ID required' });

    deleteEvent(project.dataPath, eventId);
    return { success: true };
  },

  updateCalendar: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const monthsRaw = form.get('months') as string;

    updateCalendar(project.dataPath, {
      name: (form.get('calendarName') as string) || 'Custom',
      months: monthsRaw
        ? monthsRaw
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean)
        : undefined
    } as any);

    return { success: true };
  }
};
