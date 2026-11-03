"""Database engine and sessions (SQLModel over SQLite).

The schema itself is owned by migrate.py, which works on a plain sqlite3 connection.
"""

import sqlite3
from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
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
        conn.exec_driver_sql("BEGIN")

    return engine


def get_engine() -> Engine:
    return _engine(get_settings().database_path)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one Session per request. Writes commit explicitly."""
    with Session(get_engine()) as session:
        yield session


Db = Annotated[Session, Depends(get_session)]
