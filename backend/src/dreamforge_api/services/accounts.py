"""User accounts, ported from src/lib/server/accounts.ts and the account/register routes."""

import secrets

from sqlalchemy import delete, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from ..models import (
    Bookmark,
    Comment,
    Project,
    ProjectInvite,
    ProjectMember,
    ProjectPin,
    User,
)
from ..models import Session as LoginSession
from ..passwords import hash_password
from ..utils import generate_id, iso_now

MIN_PASSWORD_LENGTH = 8
# The account page asks for longer passwords than registration and the CLI do.
MIN_CHANGED_PASSWORD_LENGTH = 12


class AccountError(Exception):
    """A rule was broken; the message is safe to show the user."""


def require_user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise AccountError("User not found")
    return user


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.exec(select(User).where(func.lower(User.email) == email.strip().lower())).first()


def find_user(db: Session, identifier: str) -> User | None:
    """By email (case-insensitive) or exact username."""
    return db.exec(
        select(User).where(
            or_(
                func.lower(User.email) == identifier.strip().lower(),
                User.username == identifier.strip(),
            )
        )
    ).first()


def _taken(db: Session, email: str, username: str, except_id: str | None = None) -> bool:
    query = select(User.id).where(or_(func.lower(User.email) == email, User.username == username))
    if except_id:
        query = query.where(User.id != except_id)
    return db.exec(query).first() is not None


def _sign_out_everywhere(db: Session, user_id: str, except_session: str | None = None) -> None:
    statement = delete(LoginSession).where(col(LoginSession.user_id) == user_id)
    if except_session:
        statement = statement.where(col(LoginSession.id) != except_session)
    db.exec(statement)


def create_user(
    db: Session,
    *,
    email: str,
    username: str,
    password: str,
    is_admin: bool = False,
    must_change_password: bool = False,
    check_length: bool = True,
) -> User:
    email = email.strip().lower()
    username = username.strip()
    if not email or not username or not password:
        raise AccountError("Email, username and password are required")
    if check_length and len(password) < MIN_PASSWORD_LENGTH:
        raise AccountError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if _taken(db, email, username):
        raise AccountError("Email or username already taken")
    user = User(
        id=generate_id(),
        email=email,
        username=username,
        password_hash=hash_password(password),
        is_admin=is_admin,
        must_change_password=must_change_password,
        created_at=iso_now(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as err:  # lost a race with another sign-up
        db.rollback()
        raise AccountError("Email or username already taken") from err
    db.refresh(user)
    return user


def set_password(
    db: Session, user_id: str, password: str, must_change_password: bool = False
) -> None:
    """Sets a chosen password and signs the user out everywhere."""
    user = require_user(db, user_id)
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AccountError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    user.password_hash = hash_password(password)
    user.must_change_password = must_change_password
    db.add(user)
    _sign_out_everywhere(db, user_id)
    db.commit()


def generate_temporary_password() -> str:
    return secrets.token_urlsafe(12)


def reset_password(db: Session, user_id: str) -> str:
    """Gives the user a temporary password they must change, and signs them out everywhere."""
    temporary = generate_temporary_password()
    set_password(db, user_id, temporary, must_change_password=True)
    return temporary


def update_profile(
    db: Session,
    user: User,
    session_id: str,
    *,
    email: str,
    username: str,
    new_password: str,
    logout_others: bool,
) -> User:
    """The account page's save. The caller has already checked the current password."""
    if (new_password and len(new_password) < MIN_CHANGED_PASSWORD_LENGTH) or (
        user.must_change_password and not new_password
    ):
        raise AccountError(
            f"Choose a new password of at least {MIN_CHANGED_PASSWORD_LENGTH} characters"
        )
    email = email.strip().lower()
    username = username.strip()
    if "@" not in email or not username:
        raise AccountError("Email and username are required")
    if _taken(db, email, username, except_id=user.id):
        raise AccountError("Email or username already taken")
    user.email = email
    user.username = username
    if new_password:
        user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.add(user)
    if new_password or logout_others:
        _sign_out_everywhere(db, user.id, except_session=session_id)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise AccountError("Email or username already taken") from err
    db.refresh(user)
    return user


def list_users(db: Session) -> list[dict]:
    owned = dict(db.exec(select(Project.user_id, func.count()).group_by(Project.user_id)).all())
    shared = dict(
        db.exec(select(ProjectMember.user_id, func.count()).group_by(ProjectMember.user_id)).all()
    )
    return [
        {
            **user.model_dump(exclude={"password_hash", "must_change_password"}),
            "owned_projects": owned.get(user.id, 0),
            "shared_projects": shared.get(user.id, 0),
        }
        for user in db.exec(select(User).order_by(User.created_at)).all()
    ]


def _active_admin_count(db: Session, except_user_id: str) -> int:
    return db.exec(
        select(func.count())
        .select_from(User)
        .where(User.is_admin == True, User.disabled == False, User.id != except_user_id)  # noqa: E712
    ).one()


def set_admin(db: Session, actor_id: str, user_id: str, is_admin: bool) -> None:
    user = require_user(db, user_id)
    if not is_admin and _active_admin_count(db, user_id) == 0:
        raise AccountError("At least one active administrator must remain")
    if not is_admin and actor_id == user_id:
        raise AccountError("Ask another administrator to remove your admin role")
    user.is_admin = is_admin
    db.add(user)
    db.commit()


def set_disabled(db: Session, actor_id: str, user_id: str, disabled: bool) -> None:
    user = require_user(db, user_id)
    if actor_id == user_id:
        raise AccountError("You cannot disable your own account")
    if disabled and _active_admin_count(db, user_id) == 0:
        raise AccountError("At least one active administrator must remain")
    user.disabled = disabled
    db.add(user)
    if disabled:
        _sign_out_everywhere(db, user_id)
    db.commit()


def owned_project_names(db: Session, user_id: str) -> list[str]:
    return list(db.exec(select(Project.name).where(Project.user_id == user_id)).all())


def delete_account(db: Session, user_id: str) -> None:
    user = require_user(db, user_id)
    owned = owned_project_names(db, user_id)
    if owned:
        raise AccountError(
            f"Delete your projects first ({', '.join(owned)}). Other members keep nothing "
            "once a project is gone, so export anything you need."
        )
    if user.is_admin and _active_admin_count(db, user_id) == 0:
        raise AccountError("Make someone else an administrator before deleting this account")
    _sign_out_everywhere(db, user_id)
    for model, column in (
        (Bookmark, Bookmark.user_id),
        (ProjectPin, ProjectPin.user_id),
        (ProjectInvite, ProjectInvite.created_by),
        (ProjectMember, ProjectMember.user_id),
        (Comment, Comment.user_id),
    ):
        db.exec(delete(model).where(col(column) == user_id))
    db.delete(user)
    db.commit()
