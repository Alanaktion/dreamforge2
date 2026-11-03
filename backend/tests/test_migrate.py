import sqlite3

import pytest

from dreamforge_api.db import raw_connect as connect
from dreamforge_api.migrate import LATEST_VERSION, migrate, user_version


def tables(conn):
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_fresh_database_reaches_latest(tmp_path):
    conn = connect(tmp_path / "fresh.db")
    migrate(conn)
    assert user_version(conn) == LATEST_VERSION
    assert {"users", "sessions", "instance_settings", "project_pins", "project_invites"} <= tables(
        conn
    )
    migrate(conn)  # idempotent
    assert user_version(conn) == LATEST_VERSION


def test_upgrades_v0_database_and_keeps_data(tmp_path):
    path = tmp_path / "old.db"
    raw = sqlite3.connect(path)
    raw.executescript(
        """
        CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          name TEXT NOT NULL, description TEXT, data_path TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, modified_at TEXT NOT NULL);
        CREATE TABLE entities (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
          name TEXT NOT NULL, tags TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft',
          image_path TEXT, created_at TEXT NOT NULL, modified_at TEXT NOT NULL);
        CREATE TABLE trash_items (id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
          entity_id TEXT NOT NULL, entity_type TEXT NOT NULL, original_path TEXT NOT NULL,
          deleted_at TEXT NOT NULL, expires_at TEXT NOT NULL);
        INSERT INTO users VALUES ('u1', 'first@example.test', 'first', 'x', '2024-01-01'),
                                 ('u2', 'second@example.test', 'second', 'x', '2024-02-01');
        INSERT INTO projects VALUES ('p1', 'u1', 'World', NULL, '/x', 1, '2024', '2024');
        INSERT INTO entities VALUES ('e1', 'p1', 'character', 'Ada', '[]', 'draft', NULL, 'a', 'b');
        """
    )
    raw.close()
    conn = connect(path)
    migrate(conn)
    assert user_version(conn) == LATEST_VERSION
    assert conn.execute("SELECT slug FROM entities WHERE id = 'e1'").fetchone()[0] is None
    # The earliest user becomes the instance admin when nobody is called "admin".
    admins = [r[0] for r in conn.execute("SELECT id FROM users WHERE is_admin = 1")]
    assert admins == ["u1"]
    # Legacy per-project pin becomes a per-user pin for the owner.
    assert [tuple(r) for r in conn.execute("SELECT user_id, project_id FROM project_pins")] == [
        ("u1", "p1")
    ]


def test_refuses_newer_schema(tmp_path):
    conn = connect(tmp_path / "new.db")
    migrate(conn)
    conn.execute(f"PRAGMA user_version = {LATEST_VERSION + 1}")
    with pytest.raises(RuntimeError, match="newer DreamForge"):
        migrate(conn)
