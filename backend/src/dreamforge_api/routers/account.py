from fastapi import APIRouter, HTTPException, Response

from ..db import Db
from ..deps import PendingAuth
from ..passwords import verify_password
from ..schemas import AccountDelete, AccountInfo, AccountUpdate, Ok
from ..services.accounts import AccountError, delete_account, owned_project_names, update_profile
from ..services.sessions import COOKIE_NAME
from ..throttle import allow_attempt

router = APIRouter(prefix="/account", tags=["account"])


def _throttle(user_id: str) -> None:
    if not allow_attempt(f"account:{user_id}"):
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")


@router.get("", response_model=AccountInfo)
def account(auth: PendingAuth, db: Db):
    return {"user": auth.user, "owned_projects": owned_project_names(db, auth.user.id)}


@router.patch("", response_model=AccountInfo)
def update_account(body: AccountUpdate, auth: PendingAuth, db: Db):
    _throttle(auth.user.id)
    if not verify_password(body.current_password, auth.user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    try:
        user = update_profile(
            db,
            auth.user,
            auth.session.id,
            email=body.email,
            username=body.username,
            new_password=body.password,
            logout_others=body.logout_others,
        )
    except AccountError as err:
        raise HTTPException(400, str(err)) from err
    return {"user": user, "owned_projects": owned_project_names(db, user.id)}


@router.delete("", response_model=Ok)
def remove_account(body: AccountDelete, auth: PendingAuth, response: Response, db: Db):
    _throttle(auth.user.id)
    if not verify_password(body.password, auth.user.password_hash):
        raise HTTPException(400, "Password is incorrect")
    if body.confirm != "DELETE":
        raise HTTPException(400, "Type DELETE to confirm")
    try:
        delete_account(db, auth.user.id)
    except AccountError as err:
        raise HTTPException(400, str(err)) from err
    response.delete_cookie(COOKIE_NAME, path="/")
    return {}
