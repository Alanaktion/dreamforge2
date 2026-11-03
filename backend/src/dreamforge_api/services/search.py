"""Full-text search over a project's files, ported from src/lib/server/search.ts.

Matches names, entity bodies and custom field values, and scene bodies and summaries. It
reads the Markdown files directly, as the old server did: the SQLite index only holds names.
"""

import re
from typing import Any

from ..models import Project
from .entities import ENTITY_DIRS, list_entities
from .members import project_path
from .stories import list_stories, story_tree

SNIPPET_RADIUS = 60
MAX_RESULTS = 200
# Structural frontmatter keys: never user content, so never matched or shown.
SKIP_KEYS = frozenset(
    {"id", "name", "slug", "type", "status", "imagePath", "created", "modified", "answeredPrompts"}
)
_TAGS = re.compile(r"<[^>]*>")
_SPACE = re.compile(r"\s+")


def _strip(text: str) -> str:
    return _SPACE.sub(" ", _TAGS.sub(" ", text)).strip()


def _snippet(text: str, query: str) -> str | None:
    index = text.lower().find(query.lower())
    if index == -1:
        return None
    start = max(0, index - SNIPPET_RADIUS)
    end = min(len(text), index + len(query) + SNIPPET_RADIUS)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"


def _field_snippet(frontmatter: dict[str, Any], query: str) -> str | None:
    needle = query.lower()
    for key, value in frontmatter.items():
        if key in SKIP_KEYS:
            continue
        if isinstance(value, str):
            if needle in value.lower():
                return _snippet(_strip(value), query)
        elif isinstance(value, list):
            joined = ", ".join(v for v in value if isinstance(v, str))
            if needle in joined.lower():
                return _snippet(joined, query)
    return None


def search(
    project: Project, query: str, kind: str | None = None, entity_type: str | None = None
) -> list[dict[str, Any]]:
    """Newest first. ``kind`` is "entity" or "scene"; ``entity_type`` limits to one type
    (and so to entities)."""
    query = query.strip()
    if not query:
        return []
    needle = query.lower()
    results: list[dict[str, Any]] = []

    if kind != "scene":
        for type_ in [entity_type] if entity_type else list(ENTITY_DIRS):
            route = ENTITY_DIRS[type_]
            for entity in list_entities(project, type_):
                hit = {
                    "kind": "entity",
                    "id": entity["id"],
                    "type": type_,
                    "name": entity["name"],
                    "context": route,
                    "href": f"/projects/{project.id}/{route}/{entity['id']}",
                    "tags": entity["tags"],
                    "status": entity["status"],
                    "modified_at": entity["modified_at"],
                }
                if needle in entity["name"].lower():
                    results.append({**hit, "matched_in": "name", "snippet": None})
                elif snippet := _snippet(_strip(entity["body"] or ""), query):
                    results.append({**hit, "matched_in": "body", "snippet": snippet})
                elif snippet := _field_snippet(entity["frontmatter"], query):
                    results.append({**hit, "matched_in": "field", "snippet": snippet})

    if kind != "entity" and not entity_type:
        base = project_path(project)
        for story in list_stories(base):
            for chapter in story_tree(base, story["id"]):
                for i, scene in enumerate(chapter["scenes"]):
                    name = scene["title"] or f"Scene {i + 1}"
                    hit = {
                        "kind": "scene",
                        "id": scene["id"],
                        "type": story["title"],
                        "name": name,
                        "context": f"{story['title']} › {chapter['title']}",
                        "href": f"/projects/{project.id}/stories/{story['id']}?scene={scene['id']}",
                        "tags": [],
                        "status": scene["status"],
                        "modified_at": scene["modified_at"],
                    }
                    if needle in name.lower():
                        results.append({**hit, "matched_in": "name", "snippet": None})
                    elif snippet := _snippet(_strip(scene["body"] or ""), query):
                        results.append({**hit, "matched_in": "body", "snippet": snippet})
                    elif snippet := _snippet(_strip(scene["summary"] or ""), query):
                        results.append({**hit, "matched_in": "summary", "snippet": snippet})

    results.sort(key=lambda r: r["modified_at"], reverse=True)
    return results[:MAX_RESULTS]
