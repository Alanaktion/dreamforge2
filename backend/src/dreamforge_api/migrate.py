"""Database migrations, ported from src/lib/server/migrate.ts.

The schema version lives in ``PRAGMA user_version``. Versions 1-3 match the TypeScript
migrations exactly, so existing databases upgrade in place. New migrations go here.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from .db import raw_connect

LATEST_VERSION = 3

BASE_SCHEMA = """
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
"""

V1 = """
CREATE TABLE entities_v1 (
  id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL, name TEXT NOT NULL, slug TEXT, tags TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft', image_path TEXT,
  created_at TEXT NOT NULL, modified_at TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
);
INSERT INTO entities_v1 SELECT id, project_id, type, name, slug, tags, status, image_path,
  created_at, modified_at FROM entities;
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
"""

V3 = """
CREATE TABLE IF NOT EXISTS instance_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_pins (
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
INSERT OR IGNORE INTO project_pins (user_id, project_id, created_at)
  SELECT user_id, id, modified_at FROM projects WHERE pinned = 1;
CREATE TABLE IF NOT EXISTS project_invites (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  role TEXT NOT NULL CHECK(role IN ('editor', 'commenter')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invites_project ON project_invites(project_id);
UPDATE users SET is_admin = 1 WHERE username = 'admin';
UPDATE users SET is_admin = 1
  WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1);
PRAGMA user_version = 3;
"""


def _run(conn: sqlite3.Connection, script: str) -> None:
    # executescript() would COMMIT the surrounding transaction, so run statements one by one.
    # None of the statements above contain a semicolon inside a string literal.
    for statement in script.split(";"):
        if statement.strip():
            conn.execute(statement)


def _add_column(conn: sqlite3.Connection, table: str, name: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def user_version(conn: sqlite3.Connection) -> int:
    return conn.execute("PRAGMA user_version").fetchone()[0]


@contextmanager
def _transaction(conn: sqlite3.Connection) -> Iterator[None]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def migrate(conn: sqlite3.Connection | None = None) -> None:
    """Brings the database up to LATEST_VERSION. Opens its own connection if none is given."""
    if conn is None:
        own = raw_connect()
        try:
            return migrate(own)
        finally:
            own.close()
    with _transaction(conn):
        _run(conn, BASE_SCHEMA)
    with _transaction(conn):
        version = user_version(conn)
        if version > LATEST_VERSION:
            raise RuntimeError("Database was created by a newer DreamForge version")
        if version < 1:
            _add_column(conn, "entities", "slug", "TEXT")
            _add_column(conn, "trash_items", "kind", "TEXT NOT NULL DEFAULT 'entity'")
            _add_column(conn, "trash_items", "metadata", "TEXT")
            _run(conn, V1)
        if version < 2:
            _add_column(conn, "users", "must_change_password", "INTEGER NOT NULL DEFAULT 0")
            conn.execute("PRAGMA user_version = 2")
        if version < 3:
            _add_column(conn, "users", "is_admin", "INTEGER NOT NULL DEFAULT 0")
            _add_column(conn, "users", "disabled", "INTEGER NOT NULL DEFAULT 0")
            _run(conn, V3)
