import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { Me, ProjectShell } from '$lib/api/types';
import type { LayoutLoad } from './$types';

// A single-page app: FastAPI serves the static build and the JSON API (see backend/).
export const ssr = false;
export const prerender = false;

const ALWAYS_OPEN = ['/account'];

export const load: LayoutLoad = async ({ fetch, url }) => {
  const me = await get<Me>('/api/auth/me', fetch);

  // A temporary password must be replaced before anything else.
  if (me.user?.mustChangePassword && !ALWAYS_OPEN.includes(url.pathname)) redirect(303, '/account');

  const projectId = url.pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? '';
  let shell: ProjectShell | null = null;
  if (projectId && me.user) {
    // A missing project is the page's to report; the shell just stays empty.
    shell = await get<ProjectShell>(`/api/projects/${projectId}/shell`, fetch).catch(() => null);
  }

  return {
    user: me.user,
    allowRegistration: me.allowRegistration,
    projectId,
    projectName: shell?.projectName ?? '',
    entityCounts: shell?.entityCounts ?? {},
    bookmarks: shell?.bookmarks ?? [],
    storageProblems: shell?.storageProblems ?? []
  };
};
