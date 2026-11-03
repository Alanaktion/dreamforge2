# Stage 1: build the SvelteKit single-page app
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the SPA build runs no package install scripts.
RUN npm ci --ignore-scripts
COPY . .
RUN npx svelte-kit sync && npm run build

# Stage 2: the FastAPI server, which serves the API and the built app
FROM python:3.12-slim AS runner
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./backend/
RUN uv sync --project backend --locked --no-dev --no-install-project
COPY backend/src ./backend/src
RUN uv sync --project backend --locked --no-dev
COPY --from=web /app/build ./build

ENV PATH=/app/.venv/bin:$PATH \
    PORT=3000 \
    DATABASE_PATH=/data/dreamforge.db \
    DATA_DIR=/data/projects \
    FRONTEND_DIR=/app/build
# uid 1000 matches the previous Node image's user, so existing /data volumes stay writable.
RUN useradd --system --uid 1000 --no-create-home dreamforge && mkdir -p /data && chown dreamforge /data
USER dreamforge
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz')"
EXPOSE 3000
VOLUME ["/data"]
# Behind a reverse proxy in another container, set FORWARDED_ALLOW_IPS to its address so
# uvicorn trusts its X-Forwarded-For (used by the login throttle) and X-Forwarded-Proto.
CMD ["sh", "-c", "exec uvicorn dreamforge_api.main:app --host 0.0.0.0 --port \"$PORT\" --proxy-headers"]
