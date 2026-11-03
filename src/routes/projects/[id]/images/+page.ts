import { redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { imagesPath, type ProjectImage } from '$lib/api/images';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const data = await get<{ images: ProjectImage[]; projectName: string; role: string }>(
    imagesPath(params.id),
    fetch
  );
  return { ...data, project: { id: params.id, name: data.projectName } };
};
