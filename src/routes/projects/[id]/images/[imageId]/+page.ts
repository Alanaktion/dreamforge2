import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import type { EntitySummary } from '$lib/api/entities';
import { imagesPath, type ProjectImage } from '$lib/api/images';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const data = await get<{
    image: ProjectImage;
    entities: EntitySummary[];
    projectName: string;
    role: string;
  }>(`${imagesPath(params.id)}/${encodeURIComponent(params.imageId)}/details`, fetch);
  return {
    image: data.image,
    allEntities: data.entities,
    linkedIds: data.image.linkedEntities.map((e) => e.id),
    project: { id: params.id, name: data.projectName },
    role: data.role
  };
};
