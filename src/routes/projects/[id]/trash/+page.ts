import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { PageLoad } from './$types';

export interface TrashItem {
  id: string;
  entityId: string;
  entityType: string;
  kind: 'entity' | 'image' | 'story' | 'chapter' | 'scene';
  name: string;
  storyId: string | null;
  preview: string;
  mimeType: string | null;
  size: number | null;
  deletedAt: string;
  expiresAt: string;
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  return await get<{ items: TrashItem[]; projectName: string; role: string }>(
    `/api/projects/${params.id}/trash`,
    fetch
  );
};
