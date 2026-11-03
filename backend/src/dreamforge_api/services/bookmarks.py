"""Per-user entity bookmarks, ported from src/lib/server/bookmarks.ts."""

from sqlmodel import Session, select

from ..models import Bookmark, Project
from ..utils import generate_id, iso_now
from .metadata import with_project_metadata


def _find(db: Session, user_id: str, project_id: str, entity_id: str) -> Bookmark | None:
    return db.exec(
        select(Bookmark).where(
            Bookmark.user_id == user_id,
            Bookmark.project_id == project_id,
            Bookmark.entity_id == entity_id,
        )
    ).first()


def is_bookmarked(db: Session, user_id: str, project_id: str, entity_id: str) -> bool:
    return _find(db, user_id, project_id, entity_id) is not None


def toggle_bookmark(db: Session, user_id: str, project: Project, entity_id: str) -> bool:
    """Add or remove the bookmark; returns whether the entity is now bookmarked."""

    def change() -> bool:
        existing = _find(db, user_id, project.id, entity_id)
        if existing is not None:
            db.delete(existing)
            return False
        db.add(
            Bookmark(
                id=generate_id(),
                user_id=user_id,
                project_id=project.id,
                entity_id=entity_id,
                created_at=iso_now(),
            )
        )
        return True

    return with_project_metadata(db, project, change)
