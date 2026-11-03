"""Project access and membership, ported from src/lib/server/members.ts."""

from pathlib import Path
from typing import Literal

from sqlalchemy import func, or_
from sqlmodel import Session, select

from ..config import get_settings
from ..models import Project, ProjectMember, User
from ..utils import generate_id, iso_now

ProjectRole = Literal["owner", "editor", "commenter"]
MemberRole = Literal["editor", "commenter"]


def resolve_project_path(project_id: str, stored_path: str) -> str:
    """Prefer the stored absolute path, else DATA_DIR/<id>. Projects created in Docker
    (/data/projects/...) must still open when the database is used elsewhere (paths.ts)."""
    if stored_path and Path(stored_path).exists():
        return stored_path
    fallback = get_settings().data_dir / project_id
    if fallback.exists():
        return str(fallback)
    return stored_path or str(fallback)


def project_path(project: Project) -> Path:
    return Path(resolve_project_path(project.id, project.data_path))


def get_project_access(
    db: Session, project_id: str, user_id: str
) -> tuple[Project, ProjectRole] | None:
    project = db.get(Project, project_id)
    if project is None:
        return None
    if project.user_id == user_id:
        return project, "owner"
    role = db.exec(
        select(ProjectMember.role).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    ).first()
    if role is None:
        return None
    return project, role  # type: ignore[return-value]


def list_members(db: Session, project_id: str) -> list[dict]:
    rows = db.exec(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
    ).all()
    return [
        {
            "id": m.id,
            "user_id": m.user_id,
            "email": u.email,
            "username": u.username,
            "role": m.role,
            "created_at": m.created_at,
        }
        for m, u in rows
    ]


def _membership(db: Session, project_id: str, user_id: str) -> ProjectMember | None:
    return db.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    ).first()


def add_member(db: Session, project_id: str, user_id: str, role: MemberRole) -> None:
    member = _membership(db, project_id, user_id) or ProjectMember(
        id=generate_id(), project_id=project_id, user_id=user_id, role=role, created_at=iso_now()
    )
    member.role = role
    db.add(member)
    db.commit()


def remove_member(db: Session, project_id: str, user_id: str) -> bool:
    member = _membership(db, project_id, user_id)
    if member is None:
        return False
    db.delete(member)
    db.commit()
    return True


def update_member_role(db: Session, project_id: str, user_id: str, role: MemberRole) -> bool:
    member = _membership(db, project_id, user_id)
    if member is None:
        return False
    member.role = role
    db.add(member)
    db.commit()
    return True


def find_user_for_invite(db: Session, query: str) -> User | None:
    # Case-insensitive email, like sign-in (members.ts compared emails exactly).
    return db.exec(
        select(User).where(
            or_(func.lower(User.email) == query.strip().lower(), User.username == query.strip())
        )
    ).first()
