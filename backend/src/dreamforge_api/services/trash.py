"""Soft delete and restore for entities, ported from src/lib/server/trash.ts.

A deleted entity's file moves to ``<project>/.trash/<type dir>/<id>.md`` and a trash row
remembers it for 30 days. Relations, bookmarks and image links that point at it are removed
too, and stashed in the row's metadata so a restore can bring them back.

Only the entity kind is ported. Trashed images, stories, chapters and scenes stay as they
are until those areas move to this server.
"""

import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete
from sqlmodel import Session, col, select

from ..markdown import read_markdown_file
from ..models import Bookmark, ImageEntityLink, Project, TrashItem, User
from ..storage import project_lock
from ..utils import generate_id, iso_now
from .entities import (
    ENTITY_DIRS,
    entity_dir,
    js_str,
    remove_entity_from_db,
    resolve_entity_path,
    sync_entity_to_db,
    unique_slug,
)
from .members import project_path
from .metadata import with_project_metadata
from .relations import (
    load_relations,
    remove_relations_for_entity,
    restore_relations,
    save_relations,
)

TRASH_DIR = ".trash"
TRASH_TTL_DAYS = 30


class NotPortedError(Exception):
    pass


class _Undo:
    """File changes made inside a database transaction, undone if the transaction fails,
    so the files and the rows (trash, index, bookmarks) never disagree."""

    def __init__(self, base) -> None:
        self.base = base
        self.moves: list[tuple[Any, Any]] = []
        self.removed_relations: list[dict[str, Any]] = []
        self.restored_relation_ids: set[str] = set()

    def move(self, source, target) -> None:
        os.rename(source, target)
        self.moves.append((source, target))

    def run(self, db: Session, project: Project, change):
        try:
            return with_project_metadata(db, project, change)
        except Exception:
            for source, target in reversed(self.moves):
                os.rename(target, source)
            restore_relations(self.base, self.removed_relations)
            if self.restored_relation_ids:
                kept = [
                    r
                    for r in load_relations(self.base)
                    if r.get("id") not in self.restored_relation_ids
                ]
                save_relations(self.base, kept)
            raise


def soft_delete_entity(
    db: Session, project: Project, entity_type: str, entity_id: str
) -> dict[str, Any] | None:
    base = project_path(project)
    undo = _Undo(base)

    def change() -> dict[str, Any] | None:
        source = resolve_entity_path(base, entity_type, entity_id)
        md = read_markdown_file(source) if source else None
        if source is None or md is None:
            return None
        trash_dir = base / TRASH_DIR / ENTITY_DIRS[entity_type]
        trash_dir.mkdir(parents=True, exist_ok=True)
        undo.move(source, trash_dir / f"{entity_id}.md")
        remove_entity_from_db(db, project.id, entity_id)

        relations = remove_relations_for_entity(base, entity_id)
        undo.removed_relations = relations
        bookmarks = db.exec(
            select(Bookmark).where(
                Bookmark.entity_id == entity_id, Bookmark.project_id == project.id
            )
        ).all()
        links = db.exec(
            select(ImageEntityLink).where(
                ImageEntityLink.entity_id == entity_id, ImageEntityLink.project_id == project.id
            )
        ).all()
        stash = {
            "relations": relations,
            "bookmarks": [
                {"id": b.id, "userId": b.user_id, "createdAt": b.created_at} for b in bookmarks
            ],
            "imageLinks": [{"id": link.id, "imageId": link.image_id} for link in links],
        }
        for row in (*bookmarks, *links):
            db.delete(row)

        now = datetime.now(UTC)
        item = TrashItem(
            id=generate_id(),
            project_id=project.id,
            entity_id=entity_id,
            entity_type=entity_type,
            original_path=str(source.relative_to(base)),
            deleted_at=iso_now(now),
            expires_at=iso_now(now + timedelta(days=TRASH_TTL_DAYS)),
            kind="entity",
            metadata_=json.dumps(stash, separators=(",", ":")) if any(stash.values()) else None,
        )
        db.add(item)
        frontmatter = md[0]
        return {
            "id": item.id,
            "entity_id": entity_id,
            "entity_type": entity_type,
            "name": js_str(frontmatter.get("name") or entity_id),
            "deleted_at": item.deleted_at,
            "expires_at": item.expires_at,
        }

    with project_lock(project.id):
        return undo.run(db, project, change)


def restore_entity(db: Session, project: Project, trash_id: str) -> bool:
    base = project_path(project)
    undo = _Undo(base)

    def change() -> bool:
        item = db.exec(
            select(TrashItem).where(TrashItem.id == trash_id, TrashItem.project_id == project.id)
        ).first()
        if item is None:
            return False
        if item.kind != "entity" or item.entity_type not in ENTITY_DIRS:
            raise NotPortedError()
        trashed = base / TRASH_DIR / ENTITY_DIRS[item.entity_type] / f"{item.entity_id}.md"
        if not trashed.is_file():
            db.delete(item)
            return False
        md = read_markdown_file(trashed)
        name = js_str(md[0].get("name") or item.entity_id) if md else item.entity_id
        slug = unique_slug(base, item.entity_type, name, item.entity_id)
        target_dir = entity_dir(base, item.entity_type)
        target_dir.mkdir(parents=True, exist_ok=True)
        undo.move(trashed, target_dir / f"{slug}.md")
        if md:
            sync_entity_to_db(db, project.id, item.entity_type, item.entity_id, md[0])

        try:
            stash = json.loads(item.metadata_) if item.metadata_ else {}
        except ValueError:
            stash = {}  # unreadable stash: the file is restored anyway
        if isinstance(stash, dict):
            stashed = [r for r in stash.get("relations") or [] if isinstance(r, dict)]
            existing = {r.get("id") for r in load_relations(base)}
            restore_relations(base, stashed)
            undo.restored_relation_ids = {r.get("id") for r in stashed} - existing
            for b in stash.get("bookmarks") or []:
                # Skip bookmarks of accounts deleted while the entity was in the trash.
                if db.get(Bookmark, b["id"]) is None and db.get(User, b["userId"]) is not None:
                    db.add(
                        Bookmark(
                            id=b["id"],
                            user_id=b["userId"],
                            project_id=project.id,
                            entity_id=item.entity_id,
                            created_at=b["createdAt"],
                        )
                    )
            for link in stash.get("imageLinks") or []:
                if db.get(ImageEntityLink, link["id"]) is None:
                    db.add(
                        ImageEntityLink(
                            id=link["id"],
                            image_id=link["imageId"],
                            entity_id=item.entity_id,
                            project_id=project.id,
                        )
                    )
        db.exec(delete(TrashItem).where(col(TrashItem.id) == item.id))
        return True

    with project_lock(project.id):
        return undo.run(db, project, change)
