"""Request dependencies: the signed-in user.

The browser authenticates with the ``dreamforge-session`` cookie, set by /api/auth/login as
HttpOnly and SameSite=Lax. Scripts may send ``Authorization: Bearer <session id>`` instead.
Cross-site writes are refused by the origin check in main.py.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException

from .db import Db
from .models import Session as LoginSession
from .models import User
from .services.sessions import COOKIE_NAME, resolve_session


@dataclass
class Auth:
    user: User
    session: LoginSession


def session_token(
    authorization: Annotated[str | None, Header()] = None,
    cookie: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return cookie or None


Token = Annotated[str | None, Depends(session_token)]


def optional_auth(db: Db, token: Token) -> Auth | None:
    if not token:
        return None
    resolved = resolve_session(db, token)
    return Auth(session=resolved[0], user=resolved[1]) if resolved else None


def auth_allowing_password_change(auth: Annotated[Auth | None, Depends(optional_auth)]) -> Auth:
    if auth is None:
        raise HTTPException(401, "Sign in to continue")
    return auth


def require_auth(auth: Annotated[Auth, Depends(auth_allowing_password_change)]) -> Auth:
    # Until a temporary password is replaced, the account page is all a user can use.
    if auth.user.must_change_password:
        raise HTTPException(403, "Choose a new password on the Account page first")
    return auth


def require_admin(auth: Annotated[Auth, Depends(require_auth)]) -> Auth:
    if not auth.user.is_admin:
        raise HTTPException(403, "Administrators only")
    return auth


OptionalAuth = Annotated[Auth | None, Depends(optional_auth)]
PendingAuth = Annotated[Auth, Depends(auth_allowing_password_change)]
CurrentAuth = Annotated[Auth, Depends(require_auth)]
AdminAuth = Annotated[Auth, Depends(require_admin)]
