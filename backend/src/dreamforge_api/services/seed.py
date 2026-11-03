"""Creates the first administrator, as src/lib/server/seed.ts did."""

import logging
import secrets

from sqlmodel import Session

from ..config import get_settings
from .accounts import AccountError, create_user, find_user_by_email

log = logging.getLogger("dreamforge")


def seed(db: Session) -> None:
    settings = get_settings()
    if find_user_by_email(db, settings.admin_email):
        return
    password = settings.admin_password or secrets.token_urlsafe(24)
    try:
        create_user(
            db,
            email=settings.admin_email,
            username="admin",
            password=password,
            is_admin=True,
            must_change_password=True,
            # ADMIN_PASSWORD was never length-checked; keep accepting what people set.
            check_length=False,
        )
    except AccountError as err:  # e.g. someone else already has the username "admin"
        log.warning("Admin user not created: %s", err)
        return
    print("Admin user created", flush=True)
    if not settings.admin_password:
        print(f"Initial administrator password (save this now): {password}", flush=True)
