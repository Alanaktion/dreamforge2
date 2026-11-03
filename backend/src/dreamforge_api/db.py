"""Database engine and sessions (SQLModel over SQLite).

The schema itself is owned by migrate.py, which works on a plain sqlite3 connection.
"""

import sqlite3
from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

from .config import get_settings

PRAGMAS = ("PRAGMA journal_mode = WAL", "PRAGMA foreign_keys = ON", "PRAGMA busy_timeout = 10000")


def raw_connect(path: Path | None = None) -> sqlite3.Connection:
    """A plain autocommit sqlite3 connection, for migrations."""
    path = path or get_settings().database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    for pragma in PRAGMAS:
        conn.execute(pragma)
    return conn


@lru_cache(maxsize=4)
def _engine(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{path}", connect_args={"check_same_thread": False, "timeout": 10}
    )

    # pysqlite's own transaction handling is unreliable; take it over, as the SQLAlchemy
    # docs recommend, so a Session's transaction is a real BEGIN ... COMMIT.
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _record):
        dbapi_conn.isolation_level = None
        for pragma in PRAGMAS:
            dbapi_conn.execute(pragma)

    @event.listens_for(engine, "begin")
    def _on_begin(conn):
        # Writers take the write lock up front. A deferred transaction that reads first and
        # writes later fails at once with SQLITE_BUSY if another connection committed in
        # between (WAL snapshot conflict; busy_timeout cannot help), and taking the lock up
        # front also keeps check-then-write rules (last admin, duplicate email) race-free.
        immediate = conn.get_execution_options().get("immediate", False)
        conn.exec_driver_sql("BEGIN IMMEDIATE" if immediate else "BEGIN")

    return engine


def get_engine(*, write: bool = False) -> Engine:
    """``write=True`` gives an engine whose transactions are BEGIN IMMEDIATE."""
    engine = _engine(get_settings().database_path)
    return engine.execution_options(immediate=True) if write else engine


UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def get_session(request: Request) -> Iterator[Session]:
    """FastAPI dependency: one Session per request. Requests that may write get IMMEDIATE
    transactions; reads stay deferred so they never wait on writers."""
    with Session(get_engine(write=request.method in UNSAFE_METHODS)) as session:
        yield session


Db = Annotated[Session, Depends(get_session)]
