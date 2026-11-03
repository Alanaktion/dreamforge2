# DreamForge

Open-source, self-hosted web app for fiction worldbuilding and writing. Markdown-first, with a
SvelteKit single-page frontend and a FastAPI (Python) backend.

> **Backend rework in progress.** The server is moving from SvelteKit server routes to FastAPI
> (`backend/`). Sign-in, accounts, instance admin, invites, members, pins and the project list
> are on the new backend. Project content (entities, stories, plots, images, search, trash,
> backups, import/export) is not yet: those pages show "Not available yet". The previous
> server code is kept under `legacy/routes/` and `src/lib/server/` as the reference for porting.

## Quick Start (Docker)

```bash
# Pull the pre-built image
docker pull ghcr.io/sola-ryu/dreamforge2:latest

# Create a data directory and run
mkdir -p ./dreamforge-data
docker run -d \
  --name dreamforge \
  -p 3000:3000 \
  -e ADMIN_EMAIL=admin@dreamforge.local \
  -e ORIGIN=http://localhost:3000 \
  -e PUBLIC_ALLOW_REGISTRATION=false \
  -v ./dreamforge-data:/data \
  ghcr.io/sola-ryu/dreamforge2:latest
```

Open http://localhost:3000. Read the generated administrator password once from `docker logs dreamforge`, then log in as `admin@dreamforge.local`. Set `ADMIN_PASSWORD` explicitly to supply your own password. Registration is disabled by default.

### Using docker-compose

```bash
wget https://raw.githubusercontent.com/sola-ryu/dreamforge2/main/docker-compose.yml
docker compose up -d
```

## Configuration

Set via environment variables:

| Variable                    | Default                  | Description                                                               |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `DATABASE_PATH`             | `/data/dreamforge.db`    | SQLite database path                                                      |
| `DATA_DIR`                  | `/data/projects`         | Projects directory                                                        |
| `PUBLIC_ALLOW_REGISTRATION` | `false`                  | Allow new user signups                                                    |
| `ADMIN_EMAIL`               | `admin@dreamforge.local` | Initial admin email                                                       |
| `ADMIN_PASSWORD`            | Generated once           | Initial admin password                                                    |
| `ORIGIN`                    | unset                    | Public URL(s), comma-separated; API writes from other origins are refused |
| `FRONTEND_DIR`              | `./build`                | The built SPA that FastAPI serves                                         |
| `BODY_SIZE_LIMIT`           | `20971520` (20 MB)       | Largest accepted request body in bytes                                    |
| `FORWARDED_ALLOW_IPS`       | `127.0.0.1`              | Reverse proxies to trust for X-Forwarded-* headers                        |

## Development

You need Node 22 and [uv](https://docs.astral.sh/uv/) (which installs Python 3.12 for you).

```bash
cp .env.example .env
npm install
uv sync --project backend
npm run dev
```

`npm run dev` starts both apps: Vite on http://localhost:5173 with hot reload, and FastAPI on
port 8000, reloading when Python files change. Open the Vite URL; it proxies `/api` to FastAPI,
so the browser sees one origin, as in production. Run either side alone with `npm run dev:web`
(point it at another API with `API_URL`) or `npm run dev:api`. FastAPI's interactive API docs
are at http://localhost:5173/api/docs (development only; set `API_DOCS=true` to enable them elsewhere).

In production there is one process: `npm run build` writes the SPA to `build/`, and
`npm start` runs FastAPI, which serves `/api/*`, the built assets, and `index.html` for every
other path so client-side routing works on reload and deep links.

Or with Docker for hot-reload:

```bash
docker compose -f docker-compose.dev.yml up
```

### Layout

| Path                         | What                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `src/`                       | SvelteKit SPA (`adapter-static`, `ssr = false`)             |
| `src/lib/api/`               | Typed client for the API, and `use:apiForm` for JSON forms  |
| `backend/src/dreamforge_api` | FastAPI app: `routers/`, `services/`, SQLModel `models.py`  |
| `backend/.../migrate.py`     | Hand-written SQLite migrations (`PRAGMA user_version`)      |
| `legacy/routes/`             | Old SvelteKit server routes, kept until each area is ported |

## Scripts

| Command                         | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `npm run dev`                   | Vite + FastAPI, both reloading                   |
| `npm run dev:web`               | Vite only (proxies `/api` to `API_URL`)          |
| `npm run dev:api`               | FastAPI only, with reload                        |
| `npm run build`                 | Build the SPA into `build/`                      |
| `npm start`                     | Serve the built SPA and the API on `PORT` (3000) |
| `npm test` / `npm run test:api` | Frontend (Vitest) / backend (pytest) tests       |
| `npm run test:e2e`              | Playwright, against `npm start` (build first)    |
| `npm run check`                 | Type-check                                       |
| `npm run lint` / `lint:api`     | Lint the frontend / the backend (ruff)           |
| `npm run format`                | Format code                                      |
| `npm run db:migrate`            | Apply database migrations (also run on startup)  |
| `npm run user:add`              | Create an account (see below)                    |
| `npm run user:reset-password`   | Reset an account's password (see below)          |

### Managing accounts from the command line

These work without starting the server and honour `DATABASE_PATH`, like the app.

```bash
# Create a user. Add --admin for an instance administrator.
npm run user:add -- --email ada@example.com --username ada --admin

# Reset a password, by email or username. Signs the user out everywhere.
npm run user:reset-password -- ada@example.com
```

These run the backend's CLI (`uv run --project backend dreamforge --help`). Without `--password`, both commands print a temporary password that must be changed at the next
sign-in. Pass `--password <password>` (at least 8 characters) to set one directly; note that it
will end up in your shell history.

## Features

- Entity management (characters, locations, organizations, cultures, species, items, notes)
- Story / chapter / scene hierarchy with drag-and-drop reorder
- Tiptap rich-text editor with tables, colors, mentions, and spellcheck
- Plot timeline with drag-and-drop beats and scene linking
- Summaries view with synopsis editing and plot thread indicators
- Note templates (Character Profile, Location Description, Scene Outline, Chapter Plan, Worldbuilding Note)
- Note-to-scene and scene-to-note conversion
- Relation graph (cytoscape.js, fcose/circle layouts)
- Global search across all content
- Bookmarks
- ZIP export
- Zen mode
- PDF export (browser print-to-PDF)
- Multi-user with session-based auth
- Light / dark themes

## Backups and restore

Automatic ZIP backups run every `BACKUP_INTERVAL` seconds (default 86400), retain
`BACKUP_RETENTION` archives (default 10), and live in `BACKUP_DIR` (default a
`backups` directory beside the projects directory). Keep that directory on a
persistent volume. Project settings provide a per-project enable switch, **Back
up now**, and downloads. Import a ZIP on the projects page to restore into a new
project. Uploads are limited to 20 MB, with a 512 MB / 20,000-entry extraction
limit. Export streams the project files and portable metadata; instance users,
sessions, and membership remain instance-local. Store a database backup separately
if you need to recover instance accounts and permissions.

## Deploying behind a reverse proxy

Set `ORIGIN` to the exact externally visible URL, including scheme and port, such
as `https://writing.example.com`. Direct local HTTP uses
`ORIGIN=http://localhost:3000`. The API refuses writes whose `Origin` header doesn't match.
Without `ORIGIN`, it compares against the request's `Host` header instead.

Set `FORWARDED_ALLOW_IPS` to the proxy's address or range (for example `172.16.0.0/12` for a
proxy on a Docker network; never `*`, which lets any client spoof its IP) so
uvicorn trusts its `X-Forwarded-For` and `X-Forwarded-Proto` headers. Those feed the login
throttle and decide whether the session cookie is marked `Secure`.

Caddy:

```caddy
writing.example.com {
    reverse_proxy dreamforge:3000
}
```

nginx (inside an HTTPS server block with your certificate configured):

```nginx
location / {
    proxy_pass http://dreamforge:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The container runs as an unprivileged user with UID 1000, as before. When upgrading an existing
installation, ensure its mounted `/data` directory and files are writable by UID 1000. Initial administrator accounts must change their password on first login;
the Account page also changes email and username and revokes other sessions.
