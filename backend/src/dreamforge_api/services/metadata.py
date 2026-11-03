"""metadata.json: project rows that live in the database but belong with the project files.

Ported from src/lib/server/projectMetadata.ts. Custom fields, images, image links, comments,
bookmarks and trash rows are mirrored into ``<project>/metadata.json`` after every change, and
read back before one, so a project folder that is copied, restored from a backup or synced
between machines carries them along. Rows copied from another project get new ids derived
from this project's id, so two copies of one project never collide.
"""

import hashlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, inspect
from sqlmodel import Session, SQLModel, col, select

from ..models import (
    Bookmark,
    Comment,
    CustomFieldDef,
    ImageEntityLink,
    Project,
    ProjectImage,
    TrashItem,
    User,
)
from ..storage import StorageError, project_lock, read_json, write_json
from ..utils import is_safe_path_segment
from .members import project_path

TABLES: dict[str, type[SQLModel]] = {
    "fields": CustomFieldDef,
    "images": ProjectImage,
    "imageLinks": ImageEntityLink,
    "comments": Comment,
    "bookmarks": Bookmark,
    "trash": TrashItem,
}


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _columns(model: type[SQLModel]) -> list[tuple[str, str]]:
    """(attribute, JSON key) pairs. Keys match the old Drizzle property names."""
    return [(a.key, _camel(a.columns[0].name)) for a in inspect(model).mapper.column_attrs]


def _row(model: type[SQLModel], record: SQLModel) -> dict[str, Any]:
    return {key: getattr(record, attr) for attr, key in _columns(model)}


def _values(model: type[SQLModel], data: dict[str, Any]) -> dict[str, Any]:
    return {attr: data[key] for attr, key in _columns(model) if key in data}


def _file(project: Project) -> Path:
    return project_path(project) / "metadata.json"


def persist_project_metadata(db: Session, project: Project) -> None:
    db.flush()
    data: dict[str, Any] = {"version": 1}
    for key, model in TABLES.items():
        rows = db.exec(select(model).where(col(model.project_id) == project.id)).all()
        data[key] = [_row(model, r) for r in rows]
    write_json(_file(project), data)


def _valid(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("version") == 1
        and all(isinstance(value.get(key), list) for key in TABLES)
    )


def sync_project_metadata(db: Session, project: Project) -> None:
    """Replace this project's mirrored rows with what metadata.json says.

    Runs in the caller's transaction and does not commit (see the lock order in storage.py).
    """
    file = _file(project)
    if not file.exists():
        persist_project_metadata(db, project)
        return
    data = read_json(file, {"version": 1}, _valid)
    base = project_path(project).resolve()

    def remap(value: str) -> str:
        return hashlib.sha256(f"{project.id}:{value}".encode()).hexdigest()[:32]

    local_users = set(db.exec(select(User.id)).all())
    try:
        # Image links reference images, so they go first.
        for model in (ImageEntityLink, *(m for m in TABLES.values() if m is not ImageEntityLink)):
            db.exec(delete(model).where(col(model.project_id) == project.id))
        for key, model in TABLES.items():
            for source in data[key]:
                if not isinstance(source, dict):
                    raise ValueError(f"Invalid {key} row")
                foreign = source.get("projectId") != project.id
                if key == "images" and not is_safe_path_segment(source.get("filename")):
                    raise ValueError("Unsafe image filename")
                row = {
                    **source,
                    "id": remap(str(source.get("id"))) if foreign else source.get("id"),
                }
                row["projectId"] = project.id
                if key == "trash":
                    if not is_safe_path_segment(source.get("entityId")):
                        raise ValueError("Unsafe trash entity ID")
                    meta = source.get("metadata")
                    meta = json.loads(meta) if isinstance(meta, str) else None
                    if isinstance(meta, dict) and meta.get("filename") is not None:
                        if not is_safe_path_segment(meta["filename"]):
                            raise ValueError("Unsafe trash image filename")
                if "originalPath" in row:
                    original = str(row["originalPath"])
                    if Path(original).is_absolute():
                        raise ValueError("Trash paths must be relative")
                    if (
                        not (base / original).resolve().is_relative_to(base)
                        or (base / original).resolve() == base
                    ):
                        raise ValueError("Unsafe trash path in metadata")
                if "imageId" in row and foreign:
                    row["imageId"] = remap(str(row["imageId"]))
                if "userId" in row and row["userId"] not in local_users:
                    row["userId"] = project.user_id
                if foreign and key == "trash":
                    if source.get("kind") == "image" and "entityId" in row:
                        row["entityId"] = remap(str(row["entityId"]))
                    if isinstance(row.get("metadata"), str):
                        meta = json.loads(row["metadata"])
                        if isinstance(meta.get("bookmarks"), list):
                            meta["bookmarks"] = [
                                {
                                    **b,
                                    "id": remap(str(b.get("id"))),
                                    "userId": b.get("userId")
                                    if b.get("userId") in local_users
                                    else project.user_id,
                                }
                                for b in meta["bookmarks"]
                            ]
                        if isinstance(meta.get("imageLinks"), list):
                            meta["imageLinks"] = [
                                {
                                    **link,
                                    "id": remap(str(link.get("id"))),
                                    "imageId": remap(str(link.get("imageId"))),
                                }
                                for link in meta["imageLinks"]
                            ]
                        row["metadata"] = json.dumps(meta, separators=(",", ":"))
                # Core inserts: the session may still hold ORM copies of the deleted rows.
                db.exec(insert(model).values(**_values(model, row)))
        db.flush()
    except Exception as cause:
        db.rollback()
        raise StorageError(file, cause) from cause


def with_project_metadata[T](db: Session, project: Project, change: Callable[[], T]) -> T:
    """Run ``change`` against fresh rows, then mirror the result to metadata.json."""
    with project_lock(project.id):
        sync_project_metadata(db, project)
        try:
            result = change()
            persist_project_metadata(db, project)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return result
