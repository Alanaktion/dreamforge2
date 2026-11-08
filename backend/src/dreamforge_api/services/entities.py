"""Entities (characters, locations, notes, ...), ported from src/lib/server/entities.ts and the
indexing half of src/lib/server/watcher.ts.

Each entity is a Markdown file, ``<project>/<type dir>/<slug>.md``, whose frontmatter holds
its id and fields. The files are the source of truth. The ``entities`` table is an index of
names, types and tags for counts, bookmarks, the command palette and pickers; it is updated
on every write here and rebuilt from disk by ``scan_project``.

Every read-modify-write of a project's files holds ``project_lock`` (see storage.py).
"""

import json
import logging
import re
from pathlib import Path
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import delete
from sqlmodel import Session, col, select

from ..diagnostics import report_file_problem
from ..markdown import read_markdown_file, serialize_markdown, write_markdown_file
from ..models import Entity, Project
from ..storage import assert_revision, file_revision, move_and_write_atomic, project_lock
from ..utils import generate_id, is_safe_path_segment, iso_now
from .members import project_path
from .metadata import sync_project_metadata
from .primary_images import linked_image_paths

log = logging.getLogger(__name__)

EntityType = Literal["character", "organization", "location", "culture", "species", "item", "note"]

ENTITY_DIRS: dict[str, str] = {
    "character": "characters",
    "organization": "organizations",
    "location": "locations",
    "culture": "cultures",
    "species": "species",
    "item": "items",
    "note": "notes",
}
ROUTE_TO_TYPE = {route: entity_type for entity_type, route in ENTITY_DIRS.items()}
ENTITY_STATUSES = ("draft", "wip", "complete")
# Frontmatter keys the server owns. Clients cannot set them through field updates.
RESERVED_KEYS = frozenset({"id", "type", "slug", "created", "modified", "body"})


def js_str(value: Any) -> str:
    """String(value) as JavaScript would write it, for names and tags read from YAML."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def slugify(text: str) -> str:
    """Same result as slugify() in src/lib/utils, so renamed files keep their old names."""
    text = text.strip().lower()
    text = re.sub(r"[^A-Za-z0-9_\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return re.sub(r"-+", "-", text)


def entity_dir(base: Path, entity_type: str) -> Path:
    if entity_type == "note":
        return base / "notes" / "_project"
    return base / ENTITY_DIRS[entity_type]


def _markdown_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.name.endswith(".md") and p.is_file())


def unique_slug(base: Path, entity_type: str, name: str, exclude_id: str | None = None) -> str:
    slug = slugify(name).replace("/", "-") or "untitled"
    taken: set[str] = set()
    for file in _markdown_files(entity_dir(base, entity_type)):
        if exclude_id:
            md = read_markdown_file(file)
            if md and md[0].get("id") == exclude_id:
                continue
        taken.add(file.name.removesuffix(".md"))
    if slug not in taken:
        return slug
    counter = 1
    while f"{slug}-{counter}" in taken:
        counter += 1
    return f"{slug}-{counter}"


def resolve_entity_path(base: Path, entity_type: str, entity_id: str) -> Path | None:
    if not is_safe_path_segment(entity_id):
        return None
    directory = entity_dir(base, entity_type)
    for file in _markdown_files(directory):
        md = read_markdown_file(file)
        if md and md[0].get("id") == entity_id:
            return file
    fallback = directory / f"{entity_id}.md"
    return fallback if fallback.is_file() else None


def _entity(
    project_id: str, entity_type: str, file: Path, frontmatter: dict, body: str, fallback: str
) -> dict[str, Any]:
    now = iso_now()
    tags = frontmatter.get("tags")
    status = frontmatter.get("status")
    image = frontmatter.get("imagePath")
    created = frontmatter.get("created")
    modified = frontmatter.get("modified")
    return {
        "revision": file_revision(file),
        "id": frontmatter["id"],
        "project_id": project_id,
        "type": entity_type,
        "name": js_str(frontmatter.get("name") if frontmatter.get("name") is not None else "")
        or fallback,
        "tags": [js_str(t) for t in tags] if isinstance(tags, list) else [],
        "status": status if isinstance(status, str) else "draft",
        "image_path": image if isinstance(image, str) else None,
        "body": body,
        "frontmatter": frontmatter,
        "created_at": created if isinstance(created, str) else now,
        "modified_at": modified if isinstance(modified, str) else now,
    }


def list_entities(project: Project, entity_type: str) -> list[dict[str, Any]]:
    results = []
    for file in _markdown_files(entity_dir(project_path(project), entity_type)):
        md = read_markdown_file(file)
        if md is None:
            continue
        results.append(_entity(project.id, entity_type, file, *md, file.name.removesuffix(".md")))
    results.sort(key=lambda e: e["modified_at"], reverse=True)
    return results


def get_entity(project: Project, entity_type: str, entity_id: str) -> dict[str, Any] | None:
    file = resolve_entity_path(project_path(project), entity_type, entity_id)
    md = read_markdown_file(file) if file else None
    if file is None or md is None:
        return None
    return _entity(project.id, entity_type, file, *md, entity_id)


def sync_entity_to_db(
    db: Session, project_id: str, entity_type: str, entity_id: str, frontmatter: dict
) -> None:
    if not isinstance(entity_id, str) or not entity_id:
        raise ValueError("Entity id must be a nonempty string")
    now = iso_now()
    tags = frontmatter.get("tags")
    values = {
        "type": entity_type,
        "name": js_str(frontmatter["name"]) if frontmatter.get("name") is not None else entity_id,
        "slug": frontmatter["slug"] if isinstance(frontmatter.get("slug"), str) else None,
        "tags": json.dumps(
            [js_str(t) for t in tags] if isinstance(tags, list) else [],
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "status": frontmatter["status"] if isinstance(frontmatter.get("status"), str) else "draft",
        "image_path": frontmatter.get("imagePath")
        if isinstance(frontmatter.get("imagePath"), str)
        else None,
        "created_at": frontmatter["created"]
        if isinstance(frontmatter.get("created"), str)
        else now,
        "modified_at": frontmatter["modified"]
        if isinstance(frontmatter.get("modified"), str)
        else now,
    }
    row = db.get(Entity, (entity_id, project_id))
    if row is None:
        row = Entity(id=entity_id, project_id=project_id, **values)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    db.add(row)


def remove_entity_from_db(db: Session, project_id: str, entity_id: str) -> None:
    db.exec(delete(Entity).where(col(Entity.id) == entity_id, col(Entity.project_id) == project_id))


def create_entity(
    db: Session,
    project: Project,
    entity_type: str,
    name: str,
    fields: dict[str, Any] | None = None,
    body: str = "",
) -> dict[str, Any]:
    fields = {k: v for k, v in (fields or {}).items() if k not in RESERVED_KEYS and k != "name"}
    base = project_path(project)
    with project_lock(project.id):
        now = iso_now()
        entity_id = generate_id()
        slug = unique_slug(base, entity_type, name)
        frontmatter: dict[str, Any] = {
            "id": entity_id,
            "name": name,
            "slug": slug,
            "type": entity_type,
            "tags": fields.pop("tags", None) or [],
            "status": "draft",
            "imagePath": None,
            "created": now,
            "modified": now,
            **fields,
        }
        file = entity_dir(base, entity_type) / f"{slug}.md"
        write_markdown_file(file, frontmatter, body)
        sync_entity_to_db(db, project.id, entity_type, entity_id, frontmatter)
        db.commit()
        return _entity(project.id, entity_type, file, frontmatter, body, entity_id)


def update_entity(
    db: Session,
    project: Project,
    entity_type: str,
    entity_id: str,
    data: dict[str, Any],
    expected_revision: str | None,
) -> dict[str, Any] | None:
    """Merge ``data`` into the frontmatter (``body`` replaces the body). A new name renames
    the file. ``expected_revision=None`` skips the edit-conflict check (explicit overwrite)."""
    base = project_path(project)
    with project_lock(project.id):
        current = resolve_entity_path(base, entity_type, entity_id)
        md = read_markdown_file(current) if current else None
        if current is None or md is None:
            return None
        assert_revision(current, expected_revision)
        existing, old_body = md
        changes = {k: v for k, v in data.items() if k not in RESERVED_KEYS}
        if "imagePath" in changes and changes["imagePath"] is not None:
            path = changes["imagePath"]
            if not isinstance(path, str) or (entity_id, path) not in linked_image_paths(
                db, project
            ):
                raise HTTPException(
                    400, "Primary image must be an available image linked to this entity"
                )
        body = data["body"] if isinstance(data.get("body"), str) else old_body
        old_name = js_str(existing.get("name")) if existing.get("name") is not None else ""
        slug = current.name.removesuffix(".md")
        if changes.get("name") and changes["name"] != old_name:
            slug = unique_slug(base, entity_type, str(changes["name"]), entity_id)
        frontmatter = {
            **existing,
            **changes,
            "id": entity_id,
            "type": entity_type,
            "modified": iso_now(),
            "slug": slug,
        }
        target = current.with_name(f"{slug}.md")
        if target != current:
            move_and_write_atomic(current, target, serialize_markdown(frontmatter, body))
        else:
            write_markdown_file(target, frontmatter, body)
        sync_entity_to_db(db, project.id, entity_type, entity_id, frontmatter)
        db.commit()
        return _entity(project.id, entity_type, target, frontmatter, body, entity_id)


def duplicate_entity(
    db: Session, project: Project, entity_type: str, entity_id: str
) -> dict[str, Any] | None:
    """Body, tags and every field, as "<name> (Copy)". Relations are not copied: a duplicate
    is a starting point, not a second identity."""
    source = get_entity(project, entity_type, entity_id)
    if source is None:
        return None
    carried = {
        k: v
        for k, v in source["frontmatter"].items()
        if k not in {"id", "name", "slug", "type", "created", "modified", "tags", "imagePath"}
    }
    return create_entity(
        db,
        project,
        entity_type,
        f"{source['name']} (Copy)",
        {**carried, "tags": list(source["tags"])},
        source["body"],
    )


def entity_index(db: Session, project_id: str) -> list[Entity]:
    return list(
        db.exec(
            select(Entity)
            .where(Entity.project_id == project_id)
            .order_by(col(Entity.modified_at).desc())
        ).all()
    )


def scan_project(db: Session, project: Project) -> None:
    """Rebuild the index from disk: the files win. Rows without a file are dropped."""
    base = project_path(project)
    if not base.exists():
        return
    with project_lock(project.id):
        sync_project_metadata(db, project)
        seen: set[str] = set()
        for entity_type in ENTITY_DIRS:
            for file in _markdown_files(entity_dir(base, entity_type)):
                md = read_markdown_file(file)
                if md is None:
                    continue
                entity_id = md[0]["id"]
                if entity_id in seen:
                    log.warning("Duplicate entity id %s in %s", entity_id, file)
                    report_file_problem(file, f"Duplicate entity id: {entity_id}")
                    continue
                seen.add(entity_id)
                sync_entity_to_db(db, project.id, entity_type, entity_id, md[0])
        db.flush()
        stale = [
            row
            for row in db.exec(select(Entity.id).where(Entity.project_id == project.id)).all()
            if row not in seen
        ]
        for entity_id in stale:
            remove_entity_from_db(db, project.id, entity_id)
        db.commit()
