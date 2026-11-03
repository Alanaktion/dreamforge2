const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  return { testDb: new Database(':memory:') };
});
vi.mock('../db', () => ({ default: testDb }));
import { migrate } from '../migrate';

it('upgrades a legacy entity table without losing rows and allows project-scoped IDs', () => {
  testDb.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, data_path TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, modified_at TEXT NOT NULL);
    CREATE TABLE entities (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, tags TEXT, status TEXT NOT NULL, image_path TEXT, created_at TEXT NOT NULL, modified_at TEXT NOT NULL);
    INSERT INTO users VALUES ('u','user@example.test','writer','hash','now');
    INSERT INTO projects VALUES ('a','u','A',NULL,'/a',0,'now','now'), ('b','u','B',NULL,'/b',0,'now','now');
    INSERT INTO entities VALUES ('shared','a','character','Original','[]','draft',NULL,'now','now');
  `);
  migrate();
  migrate();
  expect(testDb.pragma('user_version', { simple: true })).toBe(3);
  expect(testDb.prepare('SELECT name FROM entities WHERE project_id = ?').get('a')).toEqual({
    name: 'Original'
  });
  testDb
    .prepare(
      "INSERT INTO entities (id,project_id,type,name,status,created_at,modified_at) VALUES ('shared','b','character','Copy','draft','now','now')"
    )
    .run();
  expect(testDb.prepare('SELECT count(*) AS count FROM entities').get()).toEqual({ count: 2 });
  expect(
    (testDb.pragma('index_list(entities)') as Array<{ name: string }>).some(
      (entry) => entry.name === 'entities_project_type'
    )
  ).toBe(true);
});
