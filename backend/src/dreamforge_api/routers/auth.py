from fastapi import APIRouter, HTTPException, Request, Response

from ..db import Db
from ..deps import OptionalAuth, Token
from ..models import Session as LoginSession
from ..passwords import verify_password
from ..schemas import AuthResult, LoginRequest, Me, Ok, RegisterRequest
from ..services.accounts import AccountError, create_user, find_user_by_email
from ..services.invites import find_invite
from ..services.registration import registration_allowed
from ..services.sessions import COOKIE_NAME, SESSION_SECONDS, create_session, delete_session
from ..throttle import allow_attempt
from ..utils import safe_next

router = APIRouter(prefix="/auth", tags=["auth"])


def client_address(request: Request) -> str:
    # Behind a proxy, uvicorn's --proxy-headers turns X-Forwarded-For into client.host.
    return request.client.host if request.client else "unknown"


def set_session_cookie(request: Request, response: Response, session: LoginSession) -> None:
    response.set_cookie(
        COOKIE_NAME,
        session.id,
        max_age=SESSION_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )


@router.get("/me", response_model=Me)
def me(db: Db, auth: OptionalAuth):
    """Who is signed in (or null), and whether sign-up is open. Loaded by the app shell."""
    return {"user": auth.user if auth else None, "allow_registration": registration_allowed(db)}


@router.post("/login", response_model=AuthResult)
def login(body: LoginRequest, request: Request, response: Response, db: Db, token: Token):
    email = body.email.strip().lower()
    if not allow_attempt(f"ip:{client_address(request)}") or not allow_attempt(f"email:{email}"):
        raise HTTPException(429, "Too many login attempts. Try again in 15 minutes.")
    if not email or not body.password:
        raise HTTPException(400, "Email and password are required")
    user = find_user_by_email(db, email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Invalid email or password")
    if user.disabled:
        raise HTTPException(403, "This account is disabled. Ask an administrator for help.")
    if token:  # rotate: drop whatever session the browser had before
        delete_session(db, token)
    set_session_cookie(request, response, create_session(db, user.id))
    redirect = "/account" if user.must_change_password else safe_next(body.next)
    return {"user": user, "redirect": redirect}


@router.post("/register", response_model=AuthResult)
def register(body: RegisterRequest, request: Request, response: Response, db: Db):
    invite = body.invite if body.invite and find_invite(db, body.invite) else None
    if not registration_allowed(db) and not invite:
        raise HTTPException(403, "Registration is disabled")
    if not body.email.strip() or not body.username.strip() or not body.password:
        raise HTTPException(400, "All fields are required")
    try:
        user = create_user(db, email=body.email, username=body.username, password=body.password)
    except AccountError as err:
        raise HTTPException(400, str(err)) from err
    set_session_cookie(request, response, create_session(db, user.id))
    return {"user": user, "redirect": f"/invite/{invite}" if invite else "/projects"}


@router.post("/logout", response_model=Ok)
def logout(response: Response, db: Db, token: Token):
    if token:
        delete_session(db, token)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {}
