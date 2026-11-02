import { redirect } from '@sveltejs/kit';
import { searchProjectContent } from '$lib/server/search';
import { getProjectAccess } from '$lib/server/members';
import { routeToEntityType } from '$lib/utils/entityTypes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  const query = url.searchParams.get('q') || '';
  const kindParam = url.searchParams.get('kind') || '';
  const typeParam = url.searchParams.get('type') || '';

  const kind = kindParam === 'entity' || kindParam === 'scene' ? kindParam : undefined;
  const typeFilter = routeToEntityType(typeParam) || undefined;

  const results = query
    ? searchProjectContent(params.id, project.dataPath, query, { kind, typeFilter })
    : [];

  return {
    query,
    kind: kind || '',
    type: typeFilter ? typeParam : '',
    results,
    projectName: project.name,
    role
  };
};
