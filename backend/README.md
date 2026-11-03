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
  `services/writing.py` counts words the way the editor does and keeps `writing-log.json`
  (daily goal, per-story targets, words per day).
- `services/plots.py` (`plotlines/<id>.json`) and `services/timelines.py` (`timeline.json`):
  file-only data, written under the project lock. `services/stats.py` walks the files once for
  the dashboard.
- `services/images.py`: uploads (one file per request, checked against its signature), served
  back at `/api/projects/{id}/images/{filename}` with SVGs sandboxed. `services/search.py`
  searches the Markdown files directly.
- `services/trash.py`: soft delete and restore for entities, stories, chapters, scenes and
  images, and the daily purge of items older than 30 days.
- `services/archives.py`: the project ZIP (export, backups) and restoring a ZIP as a new project,
  with limits on names, links, entry count and unpacked size. `main.py` checks every minute for
  projects whose newest backup is older than `BACKUP_INTERVAL`.
- `services/csv_io.py`: CSV export of one entity type, and the import of rows the browser has
  already mapped to fields. `services/starter.py`: the Novel, Series and Campaign starters and
  the sample world.

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
