import fs from 'node:fs';
import path from 'node:path';
import { getProjectAccess } from '$lib/server/members';
import { isSafePathSegment } from '$lib/utils';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

export async function GET({ params, locals }) {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) return new Response('Not found', { status: 404 });
  const { project } = access;

  if (!isSafePathSegment(params.file)) return new Response('Not found', { status: 404 });

  const ext = path.extname(params.file).toLowerCase();
  if (!(ext in MIME)) return new Response('Not found', { status: 404 });

  const filePath = path.join(project.dataPath, 'images', params.file);
  if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 });

  const content = fs.readFileSync(filePath);
  const headers: Record<string, string> = {
    'content-type': MIME[ext],
    'x-content-type-options': 'nosniff'
  };

  // Uploaded SVGs are same-origin documents; sandbox them so embedded script cannot run.
  if (ext === '.svg') {
    headers['content-security-policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  }

  return new Response(content, { headers });
}
