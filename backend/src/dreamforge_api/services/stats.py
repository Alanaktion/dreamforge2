"""Dashboard numbers, ported from src/lib/server/stats.ts.

Reads the files rather than the SQLite index, because word counts live in the scene bodies,
which the index deliberately does not store.
"""

from typing import Any

from ..models import Project
from ..storage import StorageError
from .entities import ENTITY_DIRS, list_entities
from .members import project_path
from .relations import load_relations
from .stories import list_stories, story_tree
from .writing import count_words

RECENT_LIMIT = 8


def collect_stories(project: Project) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Reads every story once: per-story rollups, plus a flat list of scenes."""
    base = project_path(project)
    rollups: list[dict[str, Any]] = []
    scenes: list[dict[str, Any]] = []
    for story in list_stories(base):
        tree = story_tree(base, story["id"])
        words = 0
        for chapter in tree:
            for i, scene in enumerate(chapter["scenes"]):
                count = count_words(scene["body"])
                words += count
                scenes.append(
                    {
                        "story_id": story["id"],
                        "story_title": story["title"],
                        "chapter_title": chapter["title"],
                        "scene_id": scene["id"],
                        "title": scene["title"] or f"Scene {i + 1}",
                        "word_count": count,
                        "modified_at": scene["modified_at"],
                        "mention": "](mention://" in scene["body"],
                    }
                )
        rollups.append(
            {
                "id": story["id"],
                "title": story["title"],
                "description": story["description"],
                "chapter_count": len(tree),
                "scene_count": sum(len(c["scenes"]) for c in tree),
                "word_count": words,
                "modified_at": story["modified_at"],
            }
        )
    return rollups, scenes


def _has_relations(project: Project) -> bool:
    try:
        return len(load_relations(project_path(project))) > 0
    except StorageError:  # a damaged relations file only hides a checklist tick
        return False


def dashboard(project: Project) -> tuple[dict[str, Any], dict[str, bool]]:
    """The project stats and the getting-started checklist, from one walk of the files."""
    entity_counts: dict[str, int] = {}
    recent: list[dict[str, Any]] = []
    for entity_type, route in ENTITY_DIRS.items():
        entities = list_entities(project, entity_type)  # newest first
        entity_counts[entity_type] = len(entities)
        recent += [
            {
                "kind": "entity",
                "id": e["id"],
                "name": e["name"],
                "context": entity_type,
                "href": f"/projects/{project.id}/{route}/{e['id']}",
                "modified_at": e["modified_at"],
            }
            for e in entities[:RECENT_LIMIT]
        ]

    rollups, scenes = collect_stories(project)
    last = max(scenes, key=lambda s: s["modified_at"], default=None)
    recent += [
        {
            "kind": "scene",
            "id": s["scene_id"],
            "name": s["title"],
            "context": f"{s['story_title']} › {s['chapter_title']}",
            "href": f"/projects/{project.id}/stories/{s['story_id']}?scene={s['scene_id']}",
            "modified_at": s["modified_at"],
        }
        for s in scenes
    ]
    recent.sort(key=lambda r: r["modified_at"], reverse=True)

    word_count = sum(s["word_count"] for s in rollups)
    stats = {
        "entity_counts": entity_counts,
        "total_entities": sum(entity_counts.values()),
        "story_count": len(rollups),
        "chapter_count": sum(s["chapter_count"] for s in rollups),
        "scene_count": sum(s["scene_count"] for s in rollups),
        "word_count": word_count,
        "stories": rollups,
        "recent": recent[:RECENT_LIMIT],
        "last_scene": last
        and {
            "story_id": last["story_id"],
            "scene_id": last["scene_id"],
            "title": last["title"],
            "story_title": last["story_title"],
        },
    }
    getting_started = {
        "character": entity_counts.get("character", 0) > 0,
        "scene": word_count > 0,
        "relation": _has_relations(project),
        "mention": any(s["mention"] for s in scenes),
    }
    return stats, getting_started
