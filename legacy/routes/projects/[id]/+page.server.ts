import { redirect } from '@sveltejs/kit';
import { getProjectAccess } from '$lib/server/members';
import { getGettingStarted, getProjectStats } from '$lib/server/stats';
import { getWritingProgress } from '$lib/server/writingLog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) {
    throw redirect(302, '/projects');
  }

  const { project, role } = access;

  const stats = getProjectStats(params.id, project.dataPath);

  return {
    gettingStarted: getGettingStarted(stats, project.dataPath),
    project: {
      ...project,
      pinned: Boolean(project.pinned)
    },
    stats,
    progress: getWritingProgress(project.dataPath),
    role
  };
};
