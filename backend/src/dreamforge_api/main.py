"""The FastAPI application: the JSON API under /api, and the SvelteKit SPA for everything else.

Run with ``uvicorn dreamforge_api.main:app``.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session

from .config import get_settings
from .db import get_engine
from .migrate import migrate
from .routers import account, admin, auth, health, invites, projects
from .services.seed import seed
from .services.sessions import purge_expired_sessions
from .spa import mount_spa
from .storage import ConflictError, StorageError

log = logging.getLogger("dreamforge")
SESSION_PURGE_SECONDS = 86400
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def startup() -> None:
    """Migrate, create the first admin, and drop expired sessions. Failing here is fatal."""
    migrate()
    with Session(get_engine()) as db:
        seed(db)
        purge_expired_sessions(db)
    settings = get_settings()
    print(
        f"DreamForge startup complete (database={settings.database_path}, "
        f"dataDir={settings.data_dir})",
        flush=True,
    )


async def _purge_sessions_daily() -> None:
    while True:
        await asyncio.sleep(SESSION_PURGE_SECONDS)
        try:
            with Session(get_engine()) as db:
                purge_expired_sessions(db)
        except Exception:  # keep the loop alive; try again tomorrow
            log.exception("Session purge failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    startup()
    task = asyncio.create_task(_purge_sessions_daily())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


def _same_origin(request: Request) -> bool:
    """Refuse cross-site writes (CSRF). Browsers send Origin on every cross-origin POST,
    PUT, PATCH and DELETE, so a missing header means a same-origin or non-browser client."""
    origin = request.headers.get("origin")
    if origin is None:
        return True
    configured = get_settings().origin
    if configured:
        return origin.rstrip("/") == configured.rstrip("/")
    return urlsplit(origin).netloc == request.headers.get("host")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DreamForge API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )

    @app.middleware("http")
    async def csrf(request: Request, call_next):
        if (
            request.method in UNSAFE_METHODS
            and request.url.path.startswith("/api/")
            and not _same_origin(request)
        ):
            return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)
        return await call_next(request)

    @app.exception_handler(ConflictError)
    async def conflict(request: Request, err: ConflictError):
        return JSONResponse({"detail": str(err)}, status_code=409)

    @app.exception_handler(StorageError)
    async def storage(request: Request, err: StorageError):
        log.error("Storage error on %s %s: %s", request.method, request.url.path, err)
        return JSONResponse({"detail": str(err)}, status_code=500)

    for module in (health, auth, account, admin, invites, projects):
        app.include_router(module.router, prefix="/api")
    app.include_router(health.router)  # /healthz, for existing container health checks

    mount_spa(app, settings.frontend_dir)  # last: it catches every other GET
    return app


app = create_app()
