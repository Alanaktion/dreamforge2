"""Where an entity is referenced, ported from src/lib/server/backlinks.ts."""

from typing import Any

from ..models import Project
from .entities import ENTITY_DIRS, list_entities
from .members import project_path
from .stories import list_chapters, list_scenes, list_stories


def mentions_entity(text: Any, entity_id: str) -> bool:
    """The editor saves mentions as ``[@Label](mention://type/id)``."""
    return isinstance(text, str) and "mention://" in text and f"/{entity_id})" in text


def _frontmatter_mentions(frontmatter: dict, entity_id: str) -> bool:
    for key, value in frontmatter.items():
        if key in ("id", "slug"):
            continue
        if isinstance(value, str) and mentions_entity(value, entity_id):
            return True
        if isinstance(value, list) and any(mentions_entity(v, entity_id) for v in value):
            return True
    return False


def get_backlinks(project: Project, entity_id: str, entity_name: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for entity_type, route in ENTITY_DIRS.items():
        for other in list_entities(project, entity_type):
            if other["id"] == entity_id:
                continue
            in_body = mentions_entity(other["body"], entity_id)
            if not in_body and not _frontmatter_mentions(other["frontmatter"], entity_id):
                continue
            results.append(
                {
                    "kind": "entity",
                    "id": other["id"],
                    "name": other["name"],
                    "context": entity_type,
                    "href": f"/projects/{project.id}/{route}/{other['id']}",
                    "reason": "mention" if in_body else "field",
                }
            )

    base = project_path(project)
    for story in list_stories(base):
        for chapter in list_chapters(base, story["id"]):
            for i, scene in enumerate(list_scenes(base, story["id"], chapter["id"])):
                if any(p in (entity_id, entity_name) for p in scene["participants"]):
                    reason = "participant"
                elif scene["narrator"] and scene["narrator"] == entity_name:
                    reason = "narrator"
                elif scene["place"] and scene["place"] == entity_name:
                    reason = "place"
                elif mentions_entity(scene["body"], entity_id):
                    reason = "mention"
                else:
                    continue
                results.append(
                    {
                        "kind": "scene",
                        "id": scene["id"],
                        "name": scene["title"] or f"Scene {i + 1}",
                        "context": f"{story.get('title')} › {chapter['title']}",
                        "href": f"/projects/{project.id}/stories/{story['id']}?scene={scene['id']}",
                        "reason": reason,
                    }
                )
    return results
