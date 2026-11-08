import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { PageLoad } from './$types';

export interface SearchResult {
  primaryImageUrl?: string | null;
  kind: 'entity' | 'scene';
  id: string;
  type: string;
  name: string;
  context: string;
  href: string;
  tags: string[];
  status: string;
  modifiedAt: string;
  matchedIn: 'name' | 'body' | 'field' | 'summary';
  snippet: string | null;
}

/** The API refuses longer queries; a pasted or shared URL is cut to fit instead. */
export const _MAX_QUERY = 200;

export const load: PageLoad = async ({ fetch, params, parent, url }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const query = new URLSearchParams();
  for (const key of ['q', 'kind', 'type']) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, key === 'q' ? value.slice(0, _MAX_QUERY) : value);
  }
  return await get<{
    query: string;
    kind: string;
    type: string;
    results: SearchResult[];
    projectName: string;
    role: string;
  }>(`/api/projects/${params.id}/search?${query}`, fetch);
};
