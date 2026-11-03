# AGENTS.md — DreamForge

## Project Overview

Open-source, self-hosted web app for fiction worldbuilding and writing.
Markdown-first: all content stored as Markdown files on disk; SQLite is a query index synced on startup + file watcher (chokidar).

## Tech Stack

| Layer           | Choice                                                   |
| --------------- | -------------------------------------------------------- |
| Framework       | SvelteKit 2 + Svelte 5 (runes mode)                      |
| Language        | TypeScript (strict)                                      |
| Styling         | Tailwind CSS v4 + shadcn-svelte theme vars               |
| Database        | SQLite via better-sqlite3 + Drizzle ORM                  |
| Editor          | Tiptap 3 / ProseMirror via svelte-tiptap                 |
| Auth            | Custom (scrypt hashing, session-based, httpOnly cookies) |
| Package manager | npm (NOT pnpm or bun)                                    |
| Deployment      | Docker (multi-stage) + docker-compose                    |
| Adapter         | @sveltejs/adapter-node                                   |

## Project Structure

```
src/
  lib/
    components/     — Editor.svelte (Tiptap), Sidebar.svelte (nav/bookmarks)
    server/          — All server-only code (db, auth, entities, markdown, stories, etc.)
      __tests__/     — Server unit tests (vitest)
    stores/          — Svelte runes stores (theme.svelte.ts, zenMode.svelte.ts)
    types/           — TypeScript interfaces (EntityType, Story, Scene, etc.)
    utils/           — Shared helpers (cn, generateId, slugify, formatDate)
      __tests__/     — Util unit tests
    entityFields.ts  — Per-entity-type field definitions
  routes/
    login/register/logout — Auth pages
    projects/              — Project list + CRUD
    projects/[id]/         — Dashboard, per-project pages
    projects/[id]/[type]/  — Generic entity routes (characters, locations, etc.)
    projects/[id]/stories/ — Story/chapter/scene hierarchy
    projects/[id]/plots/     — Plotlines and beat tracking
    projects/[id]/timelines/ — World timeline with custom calendars
    projects/[id]/relations/ — Relation graph (cytoscape.js)
    projects/[id]/search/    — Global search
    projects/[id]/settings/  — Project settings, custom fields, members
    projects/[id]/images/    — Project image library
    projects/[id]/trash/     — Soft-deleted entities (30-day TTL)
    projects/[id]/export/    — ZIP export (archiver v8)
    api/projects/[id]/images/ — Image upload + serving
  app.css            — Tailwind + shadcn-svelte theme variables
  hooks.server.ts    — Auth session check on every request
```

## Entity Types (7)

`character`, `organization`, `location`, `culture`, `species`, `item`, `note`

Entity fields are declared declaratively in `src/lib/entityFields.ts` — routes are generic over `[type]` param.

## Data Architecture

- **Filesystem is the source of truth.** Each entity is a `.md` file with YAML frontmatter.
- **SQLite is a query index.** Synced on startup (`migrate.ts` → read all files → upsert into `entities` table) and kept in sync via chokidar file watcher (`watcher.ts`).
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

### Server code

- Server-only logic lives in `src/lib/server/` — never import into `+page.svelte` or `+layout.svelte`
- Route loaders use `+page.server.ts` and `+layout.server.ts`
- Database calls go through Drizzle ORM; raw SQL is rare
- Auth: session cookie checked in `hooks.server.ts`, user available as `event.locals.user`
- Images are stored on disk under `<project>/images/` and streamed by `api/projects/[id]/images/[file]`

### Components

- Editor component (`Editor.svelte`) uses svelte-tiptap wrapper — do NOT use Tiptap's Vue-only or React-only APIs
- Sidebar component handles projects list, search, export, theme toggle, and bookmarks
- Theme toggle uses CSS class on `<html>`: `dark` or none (light)

### Testing

- Framework: vitest v4
- Test files co-located in `__tests__/` directories next to the code they test
- Test files matching pattern: `src/**/*.test.ts`
- Environment: `node` (not jsdom) — no browser/component tests yet
- Globals enabled: `describe`, `it`, `expect` are available without imports
- Commands:
  - `npm test` — run all tests once
  - `npm run test:watch` — watch mode
  - `npx vitest run src/lib/server/__tests__/markdown.test.ts` — single file

### Build & Check

- `npm run build` — full production build (svelte-kit sync + vite build)
- `npm run check` — type-check + svelte-check (run after any type change)
- `npm run lint` — prettier + eslint
- `npm run format` — prettier auto-format

## What NOT To Do

- Do NOT add emojis unless asked
- Do NOT create documentation files (`.md` READMEs) unless explicitly requested — AGENTS.md is an exception
- Do NOT change package manager (npm only)
- Do NOT add new dependencies without checking if existing ones can do the job
- archiver is on v8, which removed the default function export — import the named `ZipArchive` export instead
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
Key: `PUBLIC_ALLOW_REGISTRATION` (default true — set to `false` to disable signups), `DATABASE_PATH`, `DATA_DIR`.

## Auth System

- Custom implementation in `src/lib/server/password.ts` using Node's `crypto.scrypt`
- Sessions stored in SQLite `sessions` table
- Admin user seeded automatically (email/password from env)
- Registration toggle via `PUBLIC_ALLOW_REGISTRATION`
- Logout deletes session from DB and clears cookie
