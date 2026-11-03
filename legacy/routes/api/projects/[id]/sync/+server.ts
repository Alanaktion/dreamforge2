import { json } from '@sveltejs/kit';
import { getProjectAccess } from '$lib/server/members';
import { scanProject, watchProject } from '$lib/server/watcher';

export async function POST({ params, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) {
    return json({ error: 'Project not found' }, { status: 404 });
  }

  const { project, role } = access;
  if (role === 'commenter') {
    return json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  scanProject(params.id, project.dataPath);
  watchProject(params.id, project.dataPath);

  return json({ success: true });
}
