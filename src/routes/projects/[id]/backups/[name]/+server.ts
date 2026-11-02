import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { getProjectAccess } from '$lib/server/members';
import { backupDirectory, listBackups } from '$lib/server/backups';

export function GET({ params, locals }) {
  if (!locals.user || getProjectAccess(params.id, locals.user.id)?.role !== 'owner')
    error(403, 'Only the owner can download backups');
  if (!listBackups(params.id).some((entry) => entry.name === params.name))
    error(404, 'Backup not found');
  return new Response(
    Readable.toWeb(
      fs.createReadStream(path.join(backupDirectory(params.id), params.name))
    ) as ReadableStream<Uint8Array>,
    {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${params.name}"`
      }
    }
  );
}
