"""Login sessions. The id is the ``dreamforge-session`` cookie value, as before."""

from sqlalchemy import delete
from sqlalchemy.exc import OperationalError
from sqlmodel import Session, col

from ..models import Session as LoginSession
from ..models import User
from ..utils import generate_id, unix_now

SESSION_SECONDS = 60 * 60 * 24 * 30  # 30 days
COOKIE_NAME = "dreamforge-session"


def create_session(db: Session, user_id: str) -> LoginSession:
    session = LoginSession(
        id=generate_id(), user_id=user_id, expires_at=unix_now() + SESSION_SECONDS
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: Session, session_id: str) -> None:
    db.exec(delete(LoginSession).where(col(LoginSession.id) == session_id))
    db.commit()


def _discard_session(session_id: str) -> None:
    """Delete a dead session in its own write transaction. The caller's session may be a
    deferred read (a GET), where a write after another commit fails with SQLITE_BUSY. The
    cleanup is best effort: the daily purge removes anything left behind."""
    from ..db import get_engine  # local import: db imports nothing from services

    try:
        with Session(get_engine(write=True)) as db:
            delete_session(db, session_id)
    except OperationalError:
        pass


def resolve_session(db: Session, session_id: str) -> tuple[LoginSession, User] | None:
    """Returns (session, user) for a live session. Expired sessions and sessions of disabled
    or deleted users are removed, as hooks.server.ts did."""
    session = db.get(LoginSession, session_id)
    if session is None:
        return None
    if session.expires_at > unix_now():
        user = db.get(User, session.user_id)
        if user is not None and not user.disabled:
            return session, user
    db.rollback()  # end this request's read so the cleanup below cannot conflict with it
    _discard_session(session_id)
    return None


def purge_expired_sessions(db: Session) -> int:
    result = db.exec(delete(LoginSession).where(col(LoginSession.expires_at) <= unix_now()))
    db.commit()
    return result.rowcount
