import { createBackup, listBackups, backupSettings } from '$lib/server/backups';
import { writeJson } from '$lib/server/storage';
import path from 'node:path';
import { fail, redirect } from '@sveltejs/kit';
import {
  getCustomFieldDefs,
  addCustomFieldDef,
  deleteCustomFieldDef
} from '$lib/server/customFields';
import {
  getProjectAccess,
  listMembers,
  addMember,
  removeMember,
  updateMemberRole,
  getUserByEmailOrUsername
} from '$lib/server/members';
import { updateProject, deleteProject } from '$lib/server/projects';
import { readWritingLog, setDailyGoal } from '$lib/server/writingLog';
import type { EntityType } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');

  const { project, role } = access;

  const customFields = getCustomFieldDefs(params.id);
  const members = role === 'owner' ? listMembers(params.id) : [];

  return {
    project: { ...project, pinned: Boolean(project.pinned) },
    customFields,
    backups: role === 'owner' ? listBackups(params.id) : [],
    backupEnabled: backupSettings(project.dataPath).enabled,
    members,
    dailyGoal: readWritingLog(project.dataPath).dailyGoal,
    role
  };
};

export const actions = {
  backup: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (access?.role !== 'owner') return fail(403, { error: 'Only the owner can manage backups' });
    try {
      await createBackup(params.id, access.project.dataPath);
      return { success: true };
    } catch (cause) {
      return fail(500, { error: cause instanceof Error ? cause.message : 'Backup failed' });
    }
  },
  backupSettings: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });
    const access = getProjectAccess(params.id, locals.user.id);
    if (access?.role !== 'owner') return fail(403, { error: 'Only the owner can manage backups' });
    const form = await request.formData();
    writeJson(path.join(access.project.dataPath, 'backup-settings.json'), {
      enabled: form.get('enabled') === 'on'
    });
    return { success: true };
  },
  updateProject: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can edit project details' });

    const form = await request.formData();
    const name = (form.get('name') as string)?.trim();
    const description = ((form.get('description') as string) || '').trim();

    if (!name) return fail(400, { error: 'Name is required' });

    updateProject(params.id, access.project.dataPath, {
      name,
      description: description || null
    });

    return { success: true };
  },

  updateDailyGoal: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });

    const form = await request.formData();
    const goal = Number(form.get('dailyGoal'));
    if (!Number.isFinite(goal) || goal < 0) return fail(400, { error: 'Invalid daily goal' });

    setDailyGoal(access.project.dataPath, goal);

    return { success: true };
  },

  deleteProject: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can delete this project' });

    const form = await request.formData();
    const confirmName = (form.get('confirmName') as string) || '';
    if (confirmName !== access.project.name) {
      return fail(400, { error: 'Project name did not match' });
    }

    deleteProject(params.id, access.project.dataPath);

    throw redirect(302, '/projects');
  },

  addField: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can manage fields' });

    const form = await request.formData();
    const entityType = form.get('entityType') as string;
    const key = form.get('key') as string;
    const label = form.get('label') as string;
    const fieldType = form.get('fieldType') as string;
    const refEntityType = (form.get('refEntityType') as string) || undefined;
    const placeholder = (form.get('placeholder') as string) || undefined;
    const required = form.get('required') === 'true';

    if (!entityType || !key || !label || !fieldType) {
      return fail(400, { error: 'entityType, key, label, and fieldType are required' });
    }

    const validEntityTypes = [
      'character',
      'organization',
      'location',
      'culture',
      'species',
      'item',
      'note'
    ];
    if (!validEntityTypes.includes(entityType)) {
      return fail(400, { error: 'Invalid entity type' });
    }
    const resolvedType = entityType as EntityType;

    const validFieldTypes = [
      'text',
      'textarea',
      'number',
      'tags',
      'markdown',
      'entityRef',
      'boolean',
      'date'
    ];
    if (!validFieldTypes.includes(fieldType)) {
      return fail(400, { error: 'Invalid field type' });
    }

    addCustomFieldDef(params.id, resolvedType, {
      key,
      label,
      fieldType: fieldType as any,
      refEntityType: (refEntityType && validEntityTypes.includes(refEntityType)
        ? refEntityType
        : null) as EntityType | null,
      placeholder,
      required
    });

    return { success: true };
  },

  deleteField: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can manage fields' });

    const form = await request.formData();
    const fieldId = form.get('fieldId') as string;

    if (!fieldId) return fail(400, { error: 'Field ID required' });

    deleteCustomFieldDef(params.id, fieldId);

    return { success: true };
  },

  addMember: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can manage members' });

    const form = await request.formData();
    const query = form.get('query') as string;
    const role = form.get('role') as string;

    if (!query) return fail(400, { error: 'Email or username is required' });
    if (!['editor', 'commenter'].includes(role)) return fail(400, { error: 'Invalid role' });

    const user = getUserByEmailOrUsername(query);
    if (!user) return fail(404, { error: 'User not found' });
    if (user.id === locals.user.id) return fail(400, { error: 'Cannot add yourself as a member' });

    addMember(params.id, user.id, role as 'editor' | 'commenter');

    return { success: true };
  },

  removeMember: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can manage members' });

    const form = await request.formData();
    const userId = form.get('userId') as string;
    if (!userId) return fail(400, { error: 'User ID required' });

    removeMember(params.id, userId);

    return { success: true };
  },

  updateMemberRole: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role !== 'owner')
      return fail(403, { error: 'Only the project owner can manage members' });

    const form = await request.formData();
    const userId = form.get('userId') as string;
    const role = form.get('role') as string;

    if (!userId) return fail(400, { error: 'User ID required' });
    if (!['editor', 'commenter'].includes(role)) return fail(400, { error: 'Invalid role' });

    updateMemberRole(params.id, userId, role as 'editor' | 'commenter');

    return { success: true };
  }
};
