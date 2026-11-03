"""Project images, ported from src/lib/server/images.ts and imageSignature.ts.

Files live in ``<project>/images/<id><ext>``; their rows (``project_images``,
``image_entity_links``) are mirrored to metadata.json through ``with_project_metadata``.
Deleting an image moves it to the trash (``trash.soft_delete_image``).
"""

import re
import struct
from pathlib import Path
from typing import Any

from sqlmodel import Session, col, select

from ..db import get_engine
from ..models import Entity, ImageEntityLink, Project, ProjectImage
from ..storage import write_file_atomic
from ..utils import generate_id, is_safe_path_segment, iso_now
from .members import project_path
from .metadata import with_project_metadata

MAX_IMAGE_BYTES = 20 * 1024 * 1024
MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}
_SVG = re.compile(rb"^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]", re.I)


def extension(name: str) -> str:
    """The lowercased extension (with the dot) if it is an allowed image type, else ''."""
    suffix = Path(name).suffix.lower()
    return suffix if suffix in MIME else ""


def valid_signature(ext: str, data: bytes) -> bool:
    """The file's bytes match its extension, and its dimensions (where the header gives
    them) are sane. Same checks as the old server."""
    if not data or len(data) > MAX_IMAGE_BYTES:
        return False
    if ext == ".png":
        if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
            return False
        width, height = struct.unpack(">II", data[16:24])
        return 0 < width <= 20000 and 0 < height <= 20000
    if ext in (".jpg", ".jpeg"):
        return data[:3] == b"\xff\xd8\xff"
    if ext == ".gif":
        if len(data) < 10 or data[:6] not in (b"GIF87a", b"GIF89a"):
            return False
        width, height = struct.unpack("<HH", data[6:10])
        return 0 < width <= 20000 and 0 < height <= 20000
    if ext == ".webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext == ".svg":
        return bool(_SVG.match(data))
    return False


def image_dir(base: Path) -> Path:
    return base / "images"


def image_url(project_id: str, filename: str) -> str:
    return f"/api/projects/{project_id}/images/{filename}"


def _entities(db: Session, project_id: str, ids: set[str]) -> dict[str, Entity]:
    if not ids:
        return {}
    rows = db.exec(
        select(Entity).where(Entity.project_id == project_id, col(Entity.id).in_(ids))
    ).all()
    return {row.id: row for row in rows}


def image_out(row: ProjectImage, linked: list[Entity] | None = None) -> dict[str, Any]:
    return {
        "id": row.id,
        "filename": row.filename,
        "original_name": row.original_name,
        "mime_type": row.mime_type,
        "size": row.size,
        "caption": row.caption,
        "alt_text": row.alt_text,
        "created_at": row.created_at,
        "url": image_url(row.project_id, row.filename),
        "linked_entities": [{"id": e.id, "name": e.name, "type": e.type} for e in linked or []],
    }


def _links(db: Session, project_id: str, **where: str) -> list[ImageEntityLink]:
    query = select(ImageEntityLink).where(ImageEntityLink.project_id == project_id)
    for key, value in where.items():
        query = query.where(getattr(ImageEntityLink, key) == value)
    return list(db.exec(query).all())


def list_images(db: Session, project_id: str) -> list[dict[str, Any]]:
    rows = db.exec(
        select(ProjectImage)
        .where(ProjectImage.project_id == project_id)
        .order_by(col(ProjectImage.created_at))
    ).all()
    links = _links(db, project_id)
    entities = _entities(db, project_id, {link.entity_id for link in links})
    by_image: dict[str, list[Entity]] = {}
    for link in links:
        if link.entity_id in entities:
            by_image.setdefault(link.image_id, []).append(entities[link.entity_id])
    return [image_out(row, by_image.get(row.id)) for row in rows]


def get_image(db: Session, project_id: str, image_id: str) -> ProjectImage | None:
    row = db.get(ProjectImage, image_id)
    return row if row is not None and row.project_id == project_id else None


def image_detail(db: Session, row: ProjectImage) -> dict[str, Any]:
    links = _links(db, row.project_id, image_id=row.id)
    entities = _entities(db, row.project_id, {link.entity_id for link in links})
    ids = [link.entity_id for link in links]
    return image_out(row, [entities[i] for i in ids if i in entities])


def images_for_entity(db: Session, project_id: str, entity_id: str) -> list[dict[str, Any]]:
    ids = [link.image_id for link in _links(db, project_id, entity_id=entity_id)]
    if not ids:
        return []
    rows = db.exec(
        select(ProjectImage)
        .where(ProjectImage.project_id == project_id, col(ProjectImage.id).in_(ids))
        .order_by(col(ProjectImage.created_at))
    ).all()
    return [image_out(row) for row in rows]


def upload_image(db: Session, project: Project, name: str, data: bytes) -> dict[str, Any] | None:
    """Store one uploaded file. None if its type or contents are not an allowed image."""
    ext = extension(name)
    if not ext or not valid_signature(ext, data):
        return None
    base = project_path(project)
    image_id = generate_id()
    filename = f"{image_id}{ext}"
    target = image_dir(base) / filename

    def change() -> ProjectImage:
        target.parent.mkdir(parents=True, exist_ok=True)
        write_file_atomic(target, data)
        row = ProjectImage(
            id=image_id,
            project_id=project.id,
            filename=filename,
            original_name=Path(name).name[:255] or filename,
            mime_type=MIME[ext],
            size=len(data),
            created_at=iso_now(),
        )
        db.add(row)
        return row

    try:
        row = with_project_metadata(db, project, change)
    except Exception:
        target.unlink(missing_ok=True)  # no row, so no file either
        raise
    return image_out(row)


def update_image(
    db: Session, project: Project, image_id: str, changes: dict[str, str | None]
) -> dict[str, Any] | None:
    def change() -> ProjectImage | None:
        row = get_image(db, project.id, image_id)
        if row is None:
            return None
        for key, value in changes.items():
            setattr(row, key, value)
        db.add(row)
        return row

    row = with_project_metadata(db, project, change)
    return image_detail(db, row) if row else None


def link_entity(db: Session, project: Project, image_id: str, entity_id: str) -> bool:
    """Link an image and an entity (idempotent). False if either does not exist."""

    def change() -> bool:
        if get_image(db, project.id, image_id) is None:
            return False
        if db.get(Entity, (entity_id, project.id)) is None:
            return False
        if not _links(db, project.id, image_id=image_id, entity_id=entity_id):
            db.add(
                ImageEntityLink(
                    id=generate_id(), image_id=image_id, entity_id=entity_id, project_id=project.id
                )
            )
        return True

    return with_project_metadata(db, project, change)


def unlink_entity(db: Session, project: Project, image_id: str, entity_id: str) -> bool:
    def change() -> bool:
        links = _links(db, project.id, image_id=image_id, entity_id=entity_id)
        for link in links:
            db.delete(link)
        return bool(links)

    return with_project_metadata(db, project, change)


def _untracked(db: Session, project: Project) -> list[Path]:
    directory = image_dir(project_path(project))
    if not directory.is_dir():
        return []
    known = set(
        db.exec(select(ProjectImage.filename).where(ProjectImage.project_id == project.id)).all()
    )
    return sorted(
        f
        for f in directory.iterdir()
        if f.is_file()
        and extension(f.name)
        and is_safe_path_segment(f.name)
        and f.name not in known
    )


def scan_existing(project_id: str) -> bool:
    """Add rows for image files that were copied into the folder by hand (or arrived with a
    restored project). Runs in a write transaction of its own, so GET requests can call it;
    the read beforehand keeps the common case (nothing new) free of writes. True if it
    added any; a caller's open read transaction will not see them until it ends."""
    with Session(get_engine()) as reader:
        project = reader.get(Project, project_id)
        if project is None or not _untracked(reader, project):
            return False
    with Session(get_engine(write=True)) as db:
        db.connection()  # BEGIN IMMEDIATE now, before the project lock
        project = db.get(Project, project_id)
        if project is None:
            return False

        def change() -> None:
            for file in _untracked(db, project):
                db.add(
                    ProjectImage(
                        id=generate_id(),
                        project_id=project.id,
                        filename=file.name,
                        original_name=file.name,
                        mime_type=MIME[extension(file.name)],
                        size=file.stat().st_size,
                        created_at=iso_now(),
                    )
                )

        with_project_metadata(db, project, change)
    return True
