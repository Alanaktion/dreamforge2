from typing import Any
from urllib.parse import quote

from sqlmodel import Session, select

from ..models import Entity, ImageEntityLink, Project, ProjectImage
from ..utils import is_safe_path_segment
from .members import project_path


def linked_image_paths(db: Session, project: Project) -> dict[tuple[str, str], str]:
    rows = db.exec(
        select(ImageEntityLink.entity_id, ProjectImage.filename)
        .join(ProjectImage, ImageEntityLink.image_id == ProjectImage.id)
        .where(
            ImageEntityLink.project_id == project.id,
            ProjectImage.project_id == project.id,
        )
    ).all()
    base = project_path(project) / "images"
    return {
        (entity_id, f"images/{filename}"): (
            f"/api/projects/{project.id}/images/{quote(filename, safe='')}"
        )
        for entity_id, filename in rows
        if is_safe_path_segment(filename) and (base / filename).is_file()
    }


def primary_image_urls(db: Session, project: Project) -> dict[str, str | None]:
    linked = linked_image_paths(db, project)
    return {
        entity_id: linked.get((entity_id, path))
        for entity_id, path in db.exec(
            select(Entity.id, Entity.image_path).where(Entity.project_id == project.id)
        ).all()
    }


def with_primary_images(
    db: Session, project: Project, items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    linked = linked_image_paths(db, project)
    paths = dict(
        db.exec(select(Entity.id, Entity.image_path).where(Entity.project_id == project.id)).all()
    )
    for item in items:
        item["primary_image_url"] = (
            linked.get((item["id"], item.get("image_path", paths.get(item["id"]))))
            if item.get("kind", "entity") == "entity"
            else None
        )
    return items
