"""Whether sign-up is open, ported from src/lib/server/registration.ts."""

from typing import Literal

from sqlmodel import Session

from ..config import get_settings
from ..models import InstanceSetting

RegistrationMode = Literal["open", "closed", "default"]


def registration_mode(db: Session) -> RegistrationMode:
    row = db.get(InstanceSetting, "registration")
    if row is not None and row.value in ("open", "closed"):
        return row.value  # type: ignore[return-value]
    return "default"


def registration_allowed(db: Session) -> bool:
    mode = registration_mode(db)
    if mode != "default":
        return mode == "open"
    return get_settings().allow_registration_env


def set_registration_mode(db: Session, mode: RegistrationMode) -> None:
    row = db.get(InstanceSetting, "registration")
    if mode == "default":
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(InstanceSetting(key="registration", value=mode))
    else:
        row.value = mode
        db.add(row)
    db.commit()
