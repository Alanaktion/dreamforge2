# DreamForge API

The FastAPI backend for DreamForge. See the repository README for running it alongside the
SvelteKit frontend (`npm run dev`).

- `src/dreamforge_api/main.py`: the app, the CSRF origin check, and SPA serving (`spa.py`).
- `routers/`: HTTP endpoints under `/api`. `services/`: the logic, on SQLModel sessions.
- `models.py`: SQLModel tables mirroring the existing SQLite schema. The schema itself is owned by
  the hand-written migrations in `migrate.py`, never by `create_all`.
- `passwords.py`: scrypt hashes compatible with the previous Node server, so existing accounts
  keep working.
- `cli.py`: `dreamforge migrate`, `dreamforge user add`, `dreamforge user reset-password`.
- `markdown.py`: entity and scene files. Frontmatter is YAML read and written with the YAML 1.2
  core schema the old server used (PyYAML alone follows 1.1, where `yes` is a boolean and
  `2024-01-01` a date), so existing files read the same and re-save without churn.
- `storage.py`: atomic writes, edit-conflict revisions, and `project_lock`. Sync endpoints run on
  a thread pool, so every read-modify-write of a project's files holds that project's lock. The
  lock is per process: run one server process per data directory.
- `services/metadata.py`: `metadata.json`, the copy of a project's database rows (custom fields,
  bookmarks, comments, trash, images) kept in its folder so the folder can move between
  instances.
- `services/stories.py`: stories (`story.json`), chapters and scenes on disk in the old layout.
  `services/writing.py` counts words the way the editor does and keeps `writing-log.json`.
- `services/trash.py`: soft delete and restore for entities, stories, chapters, scenes and
  images, and the daily purge of items older than 30 days.

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
