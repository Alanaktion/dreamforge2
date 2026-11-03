"""The trash, ported from src/lib/server/trash.ts.

Deleting moves the file (or directory) into ``<project>/.trash`` and adds a trash row that
expires after 30 days:

- an entity to ``.trash/<type dir>/<id>.md``. Relations, bookmarks and image links that point
  at it are removed too, and stashed in the row's metadata so a restore brings them back;
- a story directory to ``.trash/stories/<id>``, a chapter directory to
  ``.trash/chapters/<id>`` and a scene to ``.trash/scenes/<id>.md`` (the row remembers the
  story and chapter they came from);
- an image (deleted from the images page) to ``.trash/images/<filename>``.
"""

import json
import logging
import os
import shutil
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete
from sqlmodel import Session, col, select

from ..markdown import read_markdown_file
from ..models import Bookmark, ImageEntityLink, Project, ProjectImage, TrashItem, User
from ..storage import project_lock
from ..utils import generate_id, is_safe_path_segment, iso_now
from . import stories
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

log = logging.getLogger(__name__)

TRASH_DIR = ".trash"
TRASH_TTL_DAYS = 30


class RestoreError(Exception):
    """The item cannot go back where it was (its story or chapter is gone, or the place is
    taken). The trash row is kept so it can be restored later."""


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


def _add_item(
    db: Session,
    project: Project,
    entity_id: str,
    entity_type: str,
    original_path: str,
    name: str,
    metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    item = TrashItem(
        id=generate_id(),
        project_id=project.id,
        entity_id=entity_id,
        entity_type=entity_type,
        original_path=original_path,
        deleted_at=iso_now(now),
        expires_at=iso_now(now + timedelta(days=TRASH_TTL_DAYS)),
        kind=entity_type,
        metadata_=json.dumps(metadata, separators=(",", ":")) if metadata else None,
    )
    db.add(item)
    return {
        "id": item.id,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "name": name,
        "deleted_at": item.deleted_at,
        "expires_at": item.expires_at,
    }


def _story_trash(base, story_id: str):
    return base / TRASH_DIR / "stories" / story_id


def _chapter_trash(base, chapter_id: str):
    return base / TRASH_DIR / "chapters" / chapter_id


def _scene_trash(base, scene_id: str):
    return base / TRASH_DIR / "scenes" / f"{scene_id}.md"


def _image_trash(base, filename: str):
    return base / TRASH_DIR / "images" / filename


def soft_delete_story(db: Session, project: Project, story_id: str) -> dict[str, Any] | None:
    if not is_safe_path_segment(story_id):
        return None
    base = project_path(project)
    undo = _Undo(base)

    def change() -> dict[str, Any] | None:
        source = stories.story_dir(base, story_id)
        if not source.is_dir():
            return None
        meta = stories.read_story_file(source / "story.json")
        target = _story_trash(base, story_id)
        if target.exists():  # left over from an earlier delete of the same id
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        undo.move(source, target)
        name = (meta or {}).get("title") or story_id
        return _add_item(db, project, story_id, "story", str(source.relative_to(base)), name, None)

    with project_lock(project.id):
        return undo.run(db, project, change)


def soft_delete_chapter(
    db: Session, project: Project, story_id: str, chapter_id: str
) -> dict[str, Any] | None:
    if not is_safe_path_segment(story_id) or not is_safe_path_segment(chapter_id):
        return None
    base = project_path(project)
    undo = _Undo(base)

    def change() -> dict[str, Any] | None:
        chapter = stories.get_chapter(base, story_id, chapter_id)
        source = stories.chapter_dir(base, story_id, chapter_id)
        if not source.is_dir():
            return None
        target = _chapter_trash(base, chapter_id)
        if target.exists():
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        undo.move(source, target)
        name = chapter["title"] if chapter else chapter_id
        return _add_item(
            db,
            project,
            chapter_id,
            "chapter",
            str(source.relative_to(base)),
            name,
            {"storyId": story_id},
        )

    with project_lock(project.id):
        return undo.run(db, project, change)


def soft_delete_scene(
    db: Session, project: Project, story_id: str, chapter_id: str, scene_id: str
) -> dict[str, Any] | None:
    if not all(is_safe_path_segment(i) for i in (story_id, chapter_id, scene_id)):
        return None
    base = project_path(project)
    undo = _Undo(base)

    def change() -> dict[str, Any] | None:
        source = stories.scene_path(base, story_id, chapter_id, scene_id)
        if not source.is_file():
            return None
        scene = stories.read_scene_file(source, chapter_id)
        target = _scene_trash(base, scene_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        undo.move(source, target)  # replaces a leftover file of the same id
        name = (scene or {}).get("title") or "Untitled Scene"
        return _add_item(
            db,
            project,
            scene_id,
            "scene",
            str(source.relative_to(base)),
            name,
            {"storyId": story_id, "chapterId": chapter_id},
        )

    with project_lock(project.id):
        return undo.run(db, project, change)


def _stash(item: TrashItem) -> dict[str, Any]:
    try:
        value = json.loads(item.metadata_) if item.metadata_ else {}
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def _find(db: Session, project: Project, trash_id: str) -> TrashItem | None:
    return db.exec(
        select(TrashItem).where(TrashItem.id == trash_id, TrashItem.project_id == project.id)
    ).first()


def _drop(db: Session, item: TrashItem) -> None:
    db.exec(delete(TrashItem).where(col(TrashItem.id) == item.id))


def restore(db: Session, project: Project, trash_id: str) -> bool:
    """Put a trashed item back. False when there is no such item (or its file is gone, in
    which case the row is dropped too); RestoreError when it cannot go back yet."""
    base = project_path(project)
    undo = _Undo(base)

    def change() -> bool:
        item = _find(db, project, trash_id)
        if item is None:
            return False
        if item.kind == "entity":
            return _restore_entity(db, project, base, item, undo)
        if item.kind == "story":
            return _restore_story(db, base, item, undo)
        if item.kind == "chapter":
            return _restore_chapter(db, base, item, undo)
        if item.kind == "scene":
            return _restore_scene(db, base, item, undo)
        if item.kind == "image":
            return _restore_image(db, project, base, item, undo)
        raise RestoreError("Unknown kind of item")

    with project_lock(project.id):
        return undo.run(db, project, change)


def _restore_entity(db: Session, project: Project, base, item: TrashItem, undo: _Undo) -> bool:
    if item.entity_type not in ENTITY_DIRS or not is_safe_path_segment(item.entity_id):
        _drop(db, item)
        return False
    trashed = base / TRASH_DIR / ENTITY_DIRS[item.entity_type] / f"{item.entity_id}.md"
    if not trashed.is_file():
        _drop(db, item)
        return False
    md = read_markdown_file(trashed)
    name = js_str(md[0].get("name") or item.entity_id) if md else item.entity_id
    slug = unique_slug(base, item.entity_type, name, item.entity_id)
    target_dir = entity_dir(base, item.entity_type)
    target_dir.mkdir(parents=True, exist_ok=True)
    undo.move(trashed, target_dir / f"{slug}.md")
    if md:
        sync_entity_to_db(db, project.id, item.entity_type, item.entity_id, md[0])

    stash = _stash(item)  # an unreadable stash is ignored: the file is restored anyway
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
        # Skip links to images deleted for good while the entity was in the trash.
        if db.get(ImageEntityLink, link["id"]) is None and db.get(ProjectImage, link["imageId"]):
            db.add(
                ImageEntityLink(
                    id=link["id"],
                    image_id=link["imageId"],
                    entity_id=item.entity_id,
                    project_id=project.id,
                )
            )
    _drop(db, item)
    return True


def _restore_story(db: Session, base, item: TrashItem, undo: _Undo) -> bool:
    source = _story_trash(base, item.entity_id)
    if not is_safe_path_segment(item.entity_id) or not source.is_dir():
        _drop(db, item)
        return False
    target = stories.story_dir(base, item.entity_id)
    if target.exists():
        raise RestoreError("A story with this id already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    undo.move(source, target)
    _drop(db, item)
    return True


def _restore_chapter(db: Session, base, item: TrashItem, undo: _Undo) -> bool:
    story_id = _stash(item).get("storyId")
    source = _chapter_trash(base, item.entity_id)
    if not is_safe_path_segment(item.entity_id) or not source.is_dir():
        _drop(db, item)
        return False
    if not is_safe_path_segment(story_id) or stories.get_story(base, story_id) is None:
        raise RestoreError("Its story is gone. Restore the story first.")
    target = stories.chapter_dir(base, story_id, item.entity_id)
    if target.exists():
        raise RestoreError("A chapter with this id already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    undo.move(source, target)
    _drop(db, item)
    return True


def _restore_scene(db: Session, base, item: TrashItem, undo: _Undo) -> bool:
    stash = _stash(item)
    story_id, chapter_id = stash.get("storyId"), stash.get("chapterId")
    source = _scene_trash(base, item.entity_id) if is_safe_path_segment(item.entity_id) else None
    if source is None or not source.is_file():
        _drop(db, item)
        return False
    if (
        not is_safe_path_segment(story_id)
        or not is_safe_path_segment(chapter_id)
        or stories.get_chapter(base, story_id, chapter_id) is None
    ):
        raise RestoreError("Its chapter is gone. Restore the chapter first.")
    target = stories.scene_path(base, story_id, chapter_id, item.entity_id)
    if target.exists():
        raise RestoreError("A scene with this id already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    undo.move(source, target)
    _drop(db, item)
    return True


def _restore_image(db: Session, project: Project, base, item: TrashItem, undo: _Undo) -> bool:
    meta = _stash(item)
    filename = meta.get("filename") or item.entity_id
    if not is_safe_path_segment(filename):
        _drop(db, item)
        return False
    if db.get(ProjectImage, item.entity_id) is not None:
        raise RestoreError("An image with this id already exists")
    source = _image_trash(base, filename)
    if source.is_file():
        target = base / "images" / filename
        if target.exists():
            raise RestoreError("An image with this file name already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        undo.move(source, target)
    db.add(
        ProjectImage(
            id=item.entity_id,
            project_id=project.id,
            filename=filename,
            original_name=meta.get("originalName") or "Unknown",
            mime_type=meta.get("mimeType") or "application/octet-stream",
            size=meta.get("size") or 0,
            caption=meta.get("caption") or None,
            alt_text=meta.get("altText") or None,
            created_at=item.deleted_at,
        )
    )
    _drop(db, item)
    return True


def _trash_location(base, item: TrashItem):
    """Where the item's file or directory is in the trash, or None if it can't be named."""
    if item.kind == "image":
        filename = _stash(item).get("filename") or item.entity_id
        return _image_trash(base, filename) if is_safe_path_segment(filename) else None
    if not is_safe_path_segment(item.entity_id):
        return None
    if item.kind == "story":
        return _story_trash(base, item.entity_id)
    if item.kind == "chapter":
        return _chapter_trash(base, item.entity_id)
    if item.kind == "scene":
        return _scene_trash(base, item.entity_id)
    directory = ENTITY_DIRS.get(item.entity_type)
    return base / TRASH_DIR / directory / f"{item.entity_id}.md" if directory else None


def _remove(location) -> None:
    if location is None:
        return
    if location.is_dir():
        shutil.rmtree(location, ignore_errors=True)
    else:
        location.unlink(missing_ok=True)


def permanent_delete(db: Session, project: Project, trash_ids: list[str]) -> int:
    """Delete these trash items for good. Returns how many there were."""
    base = project_path(project)
    removed = []

    def change() -> int:
        items = db.exec(
            select(TrashItem).where(
                col(TrashItem.id).in_(trash_ids), TrashItem.project_id == project.id
            )
        ).all()
        for item in items:
            removed.append(_trash_location(base, item))
            _drop(db, item)
        return len(items)

    with project_lock(project.id):
        count = with_project_metadata(db, project, change)
        # Only once the rows are gone for good: a failed commit leaves the files restorable.
        for location in removed:
            _remove(location)
        return count


def list_trash(db: Session, project: Project) -> list[dict[str, Any]]:
    base = project_path(project)
    items = db.exec(
        select(TrashItem)
        .where(TrashItem.project_id == project.id)
        .order_by(col(TrashItem.deleted_at))
    ).all()
    result = []
    for item in items:
        stash = _stash(item)
        location = _trash_location(base, item)
        name = None
        if item.kind == "image":
            name = stash.get("originalName")
        elif location is not None and item.kind == "story":
            meta = stories.read_story_file(location / "story.json")
            name = meta and meta["title"]
        elif location is not None and item.kind == "chapter":
            meta = stories.read_chapter_file(location / "chapter.md", item.entity_id)
            name = meta and meta["title"]
        elif location is not None and item.kind == "scene":
            meta = stories.read_scene_file(location, "")
            name = (meta and meta["title"]) or "Untitled Scene"
        elif location is not None:
            md = read_markdown_file(location)
            name = md and md[0].get("name") and js_str(md[0]["name"])
        story_id = stash.get("storyId") if item.kind in ("chapter", "scene") else None
        result.append(
            {
                "id": item.id,
                "entity_id": item.entity_id,
                "entity_type": item.entity_type,
                "kind": item.kind,
                "name": name or item.entity_id,
                "story_id": story_id if isinstance(story_id, str) else None,
                "deleted_at": item.deleted_at,
                "expires_at": item.expires_at,
            }
        )
    return result


def purge_expired(db: Session) -> int:
    """Delete expired trash items in every project (run daily)."""
    now = iso_now()
    project_ids = db.exec(
        select(TrashItem.project_id).where(col(TrashItem.expires_at) < now).distinct()
    ).all()
    count = 0
    for project_id in project_ids:
        project = db.get(Project, project_id)
        if project is None:
            continue
        expired = db.exec(
            select(TrashItem.id).where(
                TrashItem.project_id == project_id, col(TrashItem.expires_at) < now
            )
        ).all()
        try:
            count += permanent_delete(db, project, list(expired))
        except Exception:
            log.exception("Cannot purge expired trash in project %s", project_id)
            db.rollback()
    return count
