from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import AdminAuth
from ..schemas import AdminOverview, FlagUpdate, Ok, PasswordResetResult, RegistrationUpdate
from ..services.accounts import AccountError, list_users, reset_password, set_admin, set_disabled
from ..services.registration import (
    registration_allowed,
    registration_mode,
    set_registration_mode,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("", response_model=AdminOverview)
def overview(auth: AdminAuth, db: Db):
    return {
        "users": list_users(db),
        "current_user_id": auth.user.id,
        "registration": registration_mode(db),
        "registration_open": registration_allowed(db),
    }


@router.put("/registration", response_model=Ok)
def update_registration(body: RegistrationUpdate, auth: AdminAuth, db: Db):
    if body.mode not in ("open", "closed", "default"):
        raise HTTPException(400, "Unknown registration setting")
    set_registration_mode(db, body.mode)  # type: ignore[arg-type]
    return {}


@router.put("/users/{user_id}/disabled", response_model=Ok)
def update_disabled(user_id: str, body: FlagUpdate, auth: AdminAuth, db: Db):
    try:
        set_disabled(db, auth.user.id, user_id, body.value)
    except AccountError as err:
        raise HTTPException(400, str(err)) from err
    return {}


@router.put("/users/{user_id}/admin", response_model=Ok)
def update_admin(user_id: str, body: FlagUpdate, auth: AdminAuth, db: Db):
    try:
        set_admin(db, auth.user.id, user_id, body.value)
    except AccountError as err:
        raise HTTPException(400, str(err)) from err
    return {}


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResult)
def admin_reset_password(user_id: str, auth: AdminAuth, db: Db):
    if user_id == auth.user.id:
        raise HTTPException(400, "Change your own password on the Account page")
    try:
        return {"user_id": user_id, "password": reset_password(db, user_id)}
    except AccountError as err:
        raise HTTPException(400, str(err)) from err
