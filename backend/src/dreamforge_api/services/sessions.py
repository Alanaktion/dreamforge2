"""Login sessions. The id is the ``dreamforge-session`` cookie value, as before."""

from sqlalchemy import delete
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
    delete_session(db, session_id)
    return None


def purge_expired_sessions(db: Session) -> int:
    result = db.exec(delete(LoginSession).where(col(LoginSession.expires_at) <= unix_now()))
    db.commit()
    return result.rowcount
