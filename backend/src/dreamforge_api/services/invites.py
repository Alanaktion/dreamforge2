"""Invite links, ported from src/lib/server/invites.ts."""

import secrets
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..models import Project, ProjectInvite
from ..utils import iso_now
from .members import MemberRole, add_member, get_project_access


def create_invite(
    db: Session,
    project_id: str,
    created_by: str,
    role: MemberRole,
    days: int = 7,
    now: datetime | None = None,
) -> ProjectInvite:
    now = now or datetime.now(UTC)
    invite = ProjectInvite(
        token=secrets.token_urlsafe(18),
        project_id=project_id,
        role=role,
        created_by=created_by,
        created_at=iso_now(now),
        expires_at=iso_now(now + timedelta(days=days)),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


def list_invites(db: Session, project_id: str, now: datetime | None = None) -> list[ProjectInvite]:
    return list(
        db.exec(
            select(ProjectInvite).where(
                ProjectInvite.project_id == project_id,
                ProjectInvite.revoked == False,  # noqa: E712
                ProjectInvite.expires_at > iso_now(now),
            )
        ).all()
    )


def revoke_invite(db: Session, project_id: str, token: str) -> bool:
    invite = db.get(ProjectInvite, token)
    if invite is None or invite.project_id != project_id:
        return False
    invite.revoked = True
    db.add(invite)
    db.commit()
    return True


def find_invite(
    db: Session, token: str, now: datetime | None = None
) -> tuple[ProjectInvite, Project] | None:
    invite = db.get(ProjectInvite, token)
    if invite is None or invite.revoked or invite.expires_at <= iso_now(now):
        return None
    project = db.get(Project, invite.project_id)
    return (invite, project) if project else None


def accept_invite(db: Session, token: str, user_id: str, now: datetime | None = None) -> str | None:
    """Joins the project, upgrading a commenter to editor when the invite says so. Never
    downgrades. Returns the project id, or None for an expired or revoked link."""
    found = find_invite(db, token, now)
    if found is None:
        return None
    invite = found[0]
    access = get_project_access(db, invite.project_id, user_id)
    if access is None or (access[1] == "commenter" and invite.role == "editor"):
        add_member(db, invite.project_id, user_id, invite.role)  # type: ignore[arg-type]
    return invite.project_id
