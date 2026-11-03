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

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
