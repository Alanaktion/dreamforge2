# AGENTS.md — DreamForge

## Project Overview

Open-source, self-hosted web app for fiction worldbuilding and writing.
Markdown-first: all content stored as Markdown files on disk; SQLite is a query index rebuilt from disk when a project's shell loads.

The app has two parts: a SvelteKit single-page frontend (`src/`) and a FastAPI backend (`backend/`). In production FastAPI serves both the API (`/api/...`) and the built SPA.

## Tech Stack

| Layer           | Choice                                                     |
| --------------- | ---------------------------------------------------------- |
| Frontend        | SvelteKit 2 + Svelte 5 (runes mode), adapter-static SPA    |
| Language        | TypeScript (strict) in `src/`, Python 3.12 in `backend/`   |
| Styling         | Tailwind CSS v4 + shadcn-svelte theme vars                 |
| Backend         | FastAPI + SQLModel on SQLite (WAL)                         |
| Editor          | Tiptap 3 / ProseMirror via svelte-tiptap                   |
| Auth            | Custom (scrypt hashing, session-based, httpOnly cookies)   |
| Package manager | npm for the frontend (NOT pnpm or bun), uv for the backend |
| Deployment      | Docker (multi-stage) + docker-compose                      |

## Project Structure

```
src/
  lib/
    api/             — Typed API client: api(), load(), apiUpload() and per-area helpers
    components/      — Editor.svelte (Tiptap), Sidebar.svelte (nav/bookmarks)
    stores/          — Svelte runes stores (theme.svelte.ts, zenMode.svelte.ts)
    types/           — TypeScript interfaces (EntityType, Story, Scene, etc.)
    utils/           — Shared helpers (cn, generateId, slugify, formatDate)
    entityFields.ts  — Per-entity-type field definitions
  routes/            — Pages; each loads its data in +page.ts through $lib/api
backend/
  src/dreamforge_api/
    main.py          — App factory, middleware, background tasks (trash purge, backups)
    migrate.py       — Hand-written schema migrations (the schema's owner)
    models.py        — SQLModel tables mirroring that schema
    schemas.py       — Request/response models (camelCase on the wire)
    routers/         — One module per API area
    services/        — Logic shared by routers (entities, stories, archives, ...)
    cli.py           — `dreamforge migrate | user add | user reset-password`
  tests/             — pytest suite
e2e/                 — Playwright smoke tests against the production build
```

## Entity Types (7)

`character`, `organization`, `location`, `culture`, `species`, `item`, `note`

Entity fields are declared declaratively in `src/lib/entityFields.ts` — routes are generic over `[type]` param.

## Data Architecture

- **Filesystem is the source of truth.** Each entity is a `.md` file with YAML frontmatter (the YAML 1.2 core schema; existing files must round-trip byte for byte).
- **SQLite is a query index** plus the tables that only live in the database (users, sessions, members). Rows that belong to a project (fields, bookmarks, comments, trash, images) are mirrored to the project's `metadata.json`.
- Project data lives at a configurable path (default `data/projects/{projectId}/`).

## Key Conventions

### Code style

- **No comments** in code unless absolutely necessary for understanding a non-obvious edge case
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) instead of Svelte 4 stores
- Prefer `let` over `const` for reactive Svelte variables
- Use `$lib/` alias for imports from `src/lib/`
- Use `@/*` alias for imports from `src/`
- Type imports should use `type` keyword: `import type { Foo } from '...'`
- Do not add explanatory code summary after edits

### Backend

- Pages load data in `+page.ts` with `load()` from `$lib/api` and refresh with `invalidateAll()`; there are no `+page.server.ts` files
- Unsafe HTTP methods get a write (BEGIN IMMEDIATE) session. Take the SQLite write lock before the per-project `project_lock`, never the other way round
- Upload endpoints check access and roll back before streaming the body, so a slow upload does not hold the write lock
- Schema changes go in `migrate.py` as a new numbered step; never use `create_all`

### Components

- Editor component (`Editor.svelte`) uses svelte-tiptap wrapper — do NOT use Tiptap's Vue-only or React-only APIs
- Sidebar component handles projects list, search, export, theme toggle, and bookmarks
- Theme toggle uses CSS class on `<html>`: `dark` or none (light)

### Testing

- Frontend: vitest (`src/**/*.test.ts`, node environment, globals enabled). `npm test`, `npm run test:watch`
- Backend: pytest. `npm run test:api` (or `uv run pytest` in `backend/`)
- End to end: `npm run build`, then `npm run test:e2e`

### Build & Check

- `npm run build` — build the SPA into `build/`
- `npm run check` — type-check + svelte-check (run after any type change)
- `npm run lint` — prettier + eslint; `npm run lint:api` — ruff
- `npm run format` — prettier auto-format
- `npm run dev` — Vite (5173, proxying `/api`) and uvicorn with reload (8000)

## What NOT To Do

- Do NOT add emojis unless asked
- Do NOT create documentation files (`.md` READMEs) unless explicitly requested — AGENTS.md is an exception
- Do NOT change package manager (npm only)
- Do NOT add new dependencies without checking if existing ones can do the job
- Do NOT suppress `a11y_` warnings — fix them. `npm run check` and the build report them; keep both at zero

## Docker

```bash
# Production
docker compose up --build

# Development (hot-reload)
docker compose -f docker-compose.dev.yml up --build
```

- `Dockerfile` — multi-stage production build
- `Dockerfile.dev` — mounts source for hot reload
- `.dockerignore` — excludes node_modules, build, data

## Environment

Copy `.env.example` to `.env` — see that file for all variables.
Key: `PUBLIC_ALLOW_REGISTRATION`, `DATABASE_PATH`, `DATA_DIR`, `ORIGIN`.

## Auth System

- Passwords use scrypt (`backend/src/dreamforge_api/passwords.py`), compatible with hashes from the earlier Node server
- Sessions stored in SQLite `sessions` table
- Admin user seeded automatically (email/password from env) with `users.is_admin`; admins manage users and registration at `/admin`
- Registration toggle via `PUBLIC_ALLOW_REGISTRATION`, overridable at runtime from `/admin` (stored in `instance_settings`)
- Project invite links let people join a project for 7 days, even when registration is closed
- Pins are per user (`project_pins`); `projects.pinned` is legacy and no longer read
- Logout deletes session from DB and clears cookie
