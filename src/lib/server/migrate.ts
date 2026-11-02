import db from './db';

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      data_path TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT,
      tags TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      image_path TEXT,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trash_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      original_path TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_images (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      caption TEXT,
      alt_text TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS image_entity_links (
      id TEXT PRIMARY KEY,
      image_id TEXT NOT NULL REFERENCES project_images(id),
      entity_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS custom_field_defs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      entity_type TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL,
      ref_entity_type TEXT,
      placeholder TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('editor', 'commenter')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
  `);

  const addColumn = (table: string, name: string, definition: string) => {
    const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  db.transaction(() => {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version > 2) throw new Error('Database was created by a newer DreamForge version');
    if (version < 1) {
      addColumn('entities', 'slug', 'TEXT');
      addColumn('trash_items', 'kind', "TEXT NOT NULL DEFAULT 'entity'");
      addColumn('trash_items', 'metadata', 'TEXT');
      db.exec(`
        CREATE TABLE entities_v1 (
          id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),
          type TEXT NOT NULL, name TEXT NOT NULL, slug TEXT, tags TEXT DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'draft', image_path TEXT,
          created_at TEXT NOT NULL, modified_at TEXT NOT NULL,
          PRIMARY KEY (project_id, id)
        );
        INSERT INTO entities_v1 SELECT id, project_id, type, name, slug, tags, status, image_path, created_at, modified_at FROM entities;
        DROP TABLE entities;
        ALTER TABLE entities_v1 RENAME TO entities;
        CREATE INDEX entities_project_type ON entities(project_id, type);
        CREATE INDEX sessions_user ON sessions(user_id);
        CREATE INDEX sessions_expiry ON sessions(expires_at);
        CREATE INDEX bookmarks_user_project ON bookmarks(user_id, project_id);
        CREATE INDEX comments_target ON comments(project_id, target_type, target_id);
        CREATE INDEX images_project ON project_images(project_id);
        CREATE INDEX image_links_entity ON image_entity_links(project_id, entity_id);
        CREATE UNIQUE INDEX users_email_normalized ON users(lower(email));
        PRAGMA user_version = 1;
      `);
    }
    if (version < 2) {
      addColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
      db.pragma('user_version = 2');
    }
  })();
}
