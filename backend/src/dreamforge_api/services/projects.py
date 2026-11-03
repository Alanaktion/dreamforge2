"""Projects: listing, pins, and the project lifecycle (create, rename, delete).

Ported from src/lib/server/projects.ts, pins.ts and the projects routes. Starter presets
other than "blank" create stories, plots and notes, which have not been ported yet.
"""

import shutil

from sqlalchemy import delete, func
from sqlmodel import Session, col, select

from ..config import get_settings
from ..models import (
    Bookmark,
    Comment,
    CustomFieldDef,
    Entity,
    ImageEntityLink,
    Project,
    ProjectImage,
    ProjectInvite,
    ProjectMember,
    ProjectPin,
    TrashItem,
)
from ..storage import read_json, write_file_atomic, write_json
from ..utils import generate_id, iso_now
from .members import ProjectRole, project_path

PROJECT_DIRS = (
    "characters",
    "organizations",
    "locations",
    "cultures",
    "species",
    "items",
    "notes/_story",
    "notes/_project",
    "images",
    "templates",
)

PROJECT_PRESETS = {
    "blank": {"label": "Blank", "description": "An empty project. Add what you need as you go."},
    "novel": {
        "label": "Novel",
        "description": "A story with a first chapter, a Save the Cat plotline, and a story "
        "bible note.",
    },
    "series": {
        "label": "Series",
        "description": "Book one, a Hero's Journey series arc, a series bible, and a chapter plan.",
    },
    "campaign": {
        "label": "Tabletop campaign",
        "description": "A campaign overview, a session log with one chapter per session, and a "
        "location sheet.",
    },
}
PORTED_PRESETS = {"blank"}


def project_out(project: Project, *, pinned: bool, role: ProjectRole) -> dict:
    return {
        **project.model_dump(exclude={"pinned", "data_path"}),
        "pinned": pinned,
        "is_owner": role == "owner",
    }


def pinned_project_ids(db: Session, user_id: str) -> set[str]:
    return set(db.exec(select(ProjectPin.project_id).where(ProjectPin.user_id == user_id)).all())


def toggle_pin(db: Session, user_id: str, project_id: str) -> bool:
    """Returns whether the project is pinned afterwards."""
    pin = db.get(ProjectPin, (user_id, project_id))
    if pin is not None:
        db.delete(pin)
    else:
        db.add(ProjectPin(user_id=user_id, project_id=project_id, created_at=iso_now()))
    db.commit()
    return pin is None


def list_projects(db: Session, user_id: str) -> dict[str, list[dict]]:
    """Owned and shared projects, pinned first, then most recently modified."""
    pins = pinned_project_ids(db, user_id)
    owned = list(db.exec(select(Project).where(Project.user_id == user_id)).all())
    owned_ids = {p.id for p in owned}
    roles: dict[str, ProjectRole] = {p.id: "owner" for p in owned}
    shared: list[Project] = []
    for project, role in db.exec(
        select(Project, ProjectMember.role)
        .join(ProjectMember, col(ProjectMember.project_id) == Project.id)
        .where(ProjectMember.user_id == user_id)
    ).all():
        if project.id not in owned_ids:
            shared.append(project)
            roles[project.id] = role  # type: ignore[assignment]

    def ordered(items: list[Project]) -> list[dict]:
        items.sort(key=lambda p: p.modified_at, reverse=True)
        items.sort(key=lambda p: p.id not in pins)  # stable sort: pinned first
        return [project_out(p, pinned=p.id in pins, role=roles[p.id]) for p in items]

    return {"projects": ordered(owned), "shared_projects": ordered(shared)}


def create_project(db: Session, user_id: str, name: str, description: str | None) -> Project:
    project_id = generate_id()
    now = iso_now()
    data_path = get_settings().data_dir / project_id
    description = description or None
    for directory in PROJECT_DIRS:
        (data_path / directory).mkdir(parents=True, exist_ok=True)
    project_json = {
        "id": project_id,
        "name": name,
        "description": description,
        "createdAt": now,
        "modifiedAt": now,
    }
    write_json(data_path / "project.json", project_json)
    write_file_atomic(data_path / "relations.json", "[]")
    project = Project(
        id=project_id,
        user_id=user_id,
        name=name,
        description=description,
        data_path=str(data_path),
        created_at=now,
        modified_at=now,
    )
    db.add(project)
    try:
        db.commit()
    except Exception:
        db.rollback()
        shutil.rmtree(data_path, ignore_errors=True)
        raise
    db.refresh(project)
    return project


def update_project(db: Session, project: Project, name: str, description: str | None) -> None:
    now = iso_now()
    path = project_path(project) / "project.json"
    existing = read_json(path, {})
    write_json(
        path,
        {**existing, "id": project.id, "name": name, "description": description, "modifiedAt": now},
    )
    project.name = name
    project.description = description
    project.modified_at = now
    db.add(project)
    db.commit()


def delete_project(db: Session, project: Project) -> None:
    path = project_path(project)
    # Child rows first so foreign keys hold.
    db.exec(delete(ImageEntityLink).where(col(ImageEntityLink.project_id) == project.id))
    for model in (
        Comment,
        Bookmark,
        ProjectImage,
        CustomFieldDef,
        ProjectMember,
        ProjectPin,
        ProjectInvite,
        TrashItem,
        Entity,
    ):
        db.exec(delete(model).where(col(model.project_id) == project.id))
    db.delete(project)
    db.commit()
    data_dir = get_settings().data_dir.resolve()
    # Only remove a folder directly inside DATA_DIR, never something like "/" from a bad row.
    if path.exists() and path.resolve().parent == data_dir:
        shutil.rmtree(path, ignore_errors=True)


def sidebar(db: Session, project: Project, user_id: str) -> dict:
    """What the app shell shows for a project: entity counts and the user's bookmarks."""
    counts = dict(
        db.exec(
            select(Entity.type, func.count())
            .where(Entity.project_id == project.id)
            .group_by(Entity.type)
        ).all()
    )
    rows = db.exec(
        select(Bookmark, Entity)
        .join(
            Entity,
            (col(Entity.id) == Bookmark.entity_id) & (col(Entity.project_id) == project.id),
        )
        .where(Bookmark.user_id == user_id, Bookmark.project_id == project.id)
        .order_by(Bookmark.created_at)
    ).all()
    return {
        "project_name": project.name,
        "entity_counts": counts,
        "bookmarks": [
            {"id": b.id, "entity_id": b.entity_id, "entity_name": e.name, "entity_type": e.type}
            for b, e in rows
        ],
    }
