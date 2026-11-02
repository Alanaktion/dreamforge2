import { json } from '@sveltejs/kit';
import db from '$lib/server/db';

export function GET() {
  db.prepare('SELECT 1').get();
  return json({ status: 'ok' });
}
