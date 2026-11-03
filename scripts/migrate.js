// Applies DreamForge's database migrations (src/lib/server/migrate.ts) without
// starting the app. The server also runs these on every startup; this script is
// for running them on demand, e.g. before deploying or against a copy of a DB.
// Honours DATABASE_PATH, like the app.
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null }
});

try {
  const { default: db, dbPath } = await server.ssrLoadModule('/src/lib/server/db.ts');
  // Loaded through Vite, db.ts sees dev = true and switches to an in-memory
  // journal. Use the production journal so a crash mid-migration is recoverable.
  db.pragma('journal_mode = WAL');
  const { migrate } = await server.ssrLoadModule('/src/lib/server/migrate.ts');
  const before = db.pragma('user_version', { simple: true });
  migrate();
  const after = db.pragma('user_version', { simple: true });
  db.close();
  console.log(
    before === after
      ? `${dbPath} is up to date (schema v${after}).`
      : `Migrated ${dbPath} from schema v${before} to v${after}.`
  );
} finally {
  await server.close();
}
