# DreamForge

Open-source, self-hosted web app for fiction worldbuilding and writing. Markdown-first, SvelteKit-based.

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

| Variable                    | Default                  | Description                                          |
| --------------------------- | ------------------------ | ---------------------------------------------------- |
| `DATABASE_PATH`             | `/data/dreamforge.db`    | SQLite database path                                 |
| `DATA_DIR`                  | `/data/projects`         | Projects directory                                   |
| `PUBLIC_ALLOW_REGISTRATION` | `false`                  | Allow new user signups                               |
| `ADMIN_EMAIL`               | `admin@dreamforge.local` | Initial admin email                                  |
| `ADMIN_PASSWORD`            | Generated once           | Initial admin password                               |
| `BODY_SIZE_LIMIT`           | `20971520` (20 MB)       | Max upload size in bytes (e.g. `52428800` for 50 MB) |

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

Or with Docker for hot-reload:

```bash
docker compose -f docker-compose.dev.yml up
```

## Scripts

| Command              | Description                                     |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start dev server with hot-reload                |
| `npm run build`      | Production build                                |
| `npm run preview`    | Preview production build                        |
| `npm test`           | Run tests                                       |
| `npm run check`      | Type-check                                      |
| `npm run lint`       | Lint                                            |
| `npm run format`     | Format code                                     |
| `npm run db:migrate` | Apply database migrations (also run on startup) |

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
`ORIGIN=http://localhost:3000`. Do not disable SvelteKit's CSRF protection.

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

For deployments serving multiple origins, configure `PROTOCOL_HEADER=x-forwarded-proto`
instead of `ORIGIN` only when the app is accessible exclusively through a trusted
proxy that replaces that header.

The container runs as the `node` user (UID 1000). When upgrading an existing
installation, ensure its mounted `/data` directory and files are writable by UID 1000. Initial administrator accounts must change their password on first login;
the Account page also changes email and username and revokes other sessions.
