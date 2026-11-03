import { fail, redirect } from '@sveltejs/kit';
import { listProjectImages, uploadImages, scanExistingImages } from '$lib/server/images';
import { getProjectAccess } from '$lib/server/members';
import type { PageServerLoad } from './$types';

export const config = {
  bodySizeLimit: parseInt(process.env.BODY_SIZE_LIMIT || '') || 20 * 1024 * 1024
};

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project, role } = access;

  scanExistingImages(params.id, project.dataPath);
  const images = listProjectImages(params.id, project.dataPath);

  return {
    project: { ...project, pinned: Boolean(project.pinned) },
    images,
    role
  };
};

export const actions = {
  upload: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const access = getProjectAccess(params.id, locals.user.id);
    if (!access) return fail(404, { error: 'Project not found' });
    if (access.role === 'commenter') return fail(403, { error: 'Insufficient permissions' });
    const { project } = access;

    const form = await request.formData();
    const files = form.getAll('files') as File[];

    if (!files || files.length === 0) {
      return fail(400, { error: 'No files provided' });
    }

    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const uploads: { name: string; buffer: Buffer }[] = [];

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowed.includes(ext)) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      uploads.push({ name: file.name, buffer });
    }

    if (uploads.length === 0) {
      return fail(400, { error: 'No valid image files provided' });
    }

    uploadImages(params.id, project.dataPath, uploads);

    return { success: true, count: uploads.length };
  }
};
