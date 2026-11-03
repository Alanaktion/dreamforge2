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
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlmodel import Session

from .config import get_settings
from .db import UNSAFE_METHODS, get_engine
from .migrate import migrate
from .routers import (
    account,
    admin,
    auth,
    dashboard,
    entities,
    health,
    images,
    invites,
    plots,
    projects,
    search,
    stories,
    timelines,
    transfer,
    trash,
)
from .services.archives import run_due_backups
from .services.seed import seed
from .services.sessions import purge_expired_sessions
from .services.trash import purge_expired as purge_expired_trash
from .spa import mount_spa
from .storage import ConflictError, StorageError

log = logging.getLogger("dreamforge")
SESSION_PURGE_SECONDS = 86400


def startup() -> None:
    """Migrate, create the first admin, and drop expired sessions. Failing here is fatal."""
    migrate()
    with Session(get_engine(write=True)) as db:
        seed(db)
        purge_expired_sessions(db)
    _purge_trash()
    settings = get_settings()
    print(
        f"DreamForge startup complete (database={settings.database_path}, "
        f"dataDir={settings.data_dir})",
        flush=True,
    )


def _purge_trash() -> None:
    try:
        with Session(get_engine(write=True)) as db:
            purge_expired_trash(db)
    except Exception:  # not fatal: expired items wait for the next run
        log.exception("Trash purge failed")


async def _purge_daily() -> None:
    while True:
        await asyncio.sleep(SESSION_PURGE_SECONDS)
        try:
            with Session(get_engine(write=True)) as db:
                purge_expired_sessions(db)
        except Exception:  # keep the loop alive; try again tomorrow
            log.exception("Session purge failed")
        await asyncio.to_thread(_purge_trash)


async def _backup_loop() -> None:
    """Automatic backups: every minute, back up the projects whose newest backup is older
    than BACKUP_INTERVAL. The first pass waits a minute, so startup stays quick."""
    while True:
        await asyncio.sleep(60)
        try:
            await asyncio.to_thread(run_due_backups)
        except Exception:  # keep the loop alive; each project's errors are logged already
            log.exception("Backup pass failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    startup()
    tasks = [asyncio.create_task(_purge_daily()), asyncio.create_task(_backup_loop())]
    yield
    for task in tasks:
        task.cancel()
    for task in tasks:
        with contextlib.suppress(asyncio.CancelledError):
            await task


def _same_origin(request: Request) -> bool:
    """Refuse cross-site writes (CSRF). Browsers send Origin on every cross-origin POST,
    PUT, PATCH and DELETE, so a missing header means a same-origin or non-browser client."""
    origin = request.headers.get("origin")
    if origin is None:
        return True
    allowed = get_settings().origins
    if allowed:
        return origin.rstrip("/") in allowed
    return urlsplit(origin).netloc == request.headers.get("host")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DreamForge API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.api_docs else None,
        openapi_url="/api/openapi.json" if settings.api_docs else None,
        redoc_url=None,
    )

    @app.middleware("http")
    async def body_limit(request: Request, call_next):
        # Refuses declared oversized bodies up front. Bodies without a Content-Length
        # (chunked) are not counted yet; upload endpoints must enforce their own limit.
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.body_size_limit:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
        return await call_next(request)

    @app.middleware("http")
    async def csrf(request: Request, call_next):
        if (
            request.method in UNSAFE_METHODS
            and request.url.path.startswith("/api/")
            and not _same_origin(request)
        ):
            return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def invalid(request: Request, err: RequestValidationError):
        # FastAPI's default echoes each bad value back, which would repeat passwords in
        # responses (and fails outright on strings that are not valid UTF-8).
        errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in err.errors()]
        return JSONResponse({"detail": errors}, status_code=422)

    @app.exception_handler(ConflictError)
    async def conflict(request: Request, err: ConflictError):
        return JSONResponse({"detail": str(err)}, status_code=409)

    @app.exception_handler(StorageError)
    async def storage(request: Request, err: StorageError):
        log.error("Storage error on %s %s: %s", request.method, request.url.path, err)
        return JSONResponse({"detail": str(err)}, status_code=500)

    for module in (
        health,
        auth,
        account,
        admin,
        invites,
        projects,
        entities,
        stories,
        plots,
        timelines,
        dashboard,
        images,
        search,
        trash,
        transfer,
    ):
        app.include_router(module.router, prefix="/api")
    app.include_router(health.router)  # /healthz, for existing container health checks

    mount_spa(app, settings.frontend_dir)  # last: it catches every other GET
    return app


app = create_app()
