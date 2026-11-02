import { redirect } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import { getProjectAccess } from '$lib/server/members';
import { projectArchive } from '$lib/server/backups';

export async function GET({ params, locals }) {
  if (!locals.user) throw redirect(302, '/login');
  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const archive = projectArchive(params.id, access.project.dataPath);
  const stream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
  void archive.finalize().catch((cause) => archive.destroy(cause));
  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${access.project.name.replace(/[^a-zA-Z0-9]/g, '_')}.zip"`
    }
  });
}
