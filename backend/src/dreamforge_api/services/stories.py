"""Read-only access to stories, chapters and scenes (from src/lib/server/stories.ts).

Only what entity pages need is here (backlinks and the command palette). Writing stories is
part of a later stage of the port.
"""

import json
from pathlib import Path
from typing import Any

from ..markdown import read_markdown_file
from ..utils import is_safe_path_segment
from .entities import js_str


def _subdirs(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return [p for p in directory.iterdir() if p.is_dir()]


def _order(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def list_stories(base: Path) -> list[dict[str, Any]]:
    stories = []
    for directory in _subdirs(base / "stories"):
        if not is_safe_path_segment(directory.name):
            continue
        try:
            meta = json.loads((directory / "story.json").read_text("utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(meta, dict):
            stories.append({**meta, "id": meta.get("id", directory.name)})
    return sorted(stories, key=lambda s: _order(s.get("sortOrder")))


def list_chapters(base: Path, story_id: str) -> list[dict[str, Any]]:
    if not is_safe_path_segment(story_id):
        return []
    chapters = []
    for directory in _subdirs(base / "stories" / story_id / "chapters"):
        md = read_markdown_file(directory / "chapter.md")
        if md is None:
            continue
        meta = md[0]
        chapters.append(
            {
                "id": js_str(meta.get("id") or directory.name),
                "story_id": story_id,
                "title": js_str(meta["title"]) if meta.get("title") is not None else "Untitled",
                "sort_order": _order(meta.get("sortOrder")),
            }
        )
    return sorted(chapters, key=lambda c: c["sort_order"])


def list_scenes(base: Path, story_id: str, chapter_id: str) -> list[dict[str, Any]]:
    if not is_safe_path_segment(story_id) or not is_safe_path_segment(chapter_id):
        return []
    directory = base / "stories" / story_id / "chapters" / chapter_id / "scenes"
    if not directory.is_dir():
        return []
    scenes = []
    for file in directory.iterdir():
        if not file.name.endswith(".md"):
            continue
        md = read_markdown_file(file)
        if md is None:
            continue
        meta, body = md

        def text(key: str, meta: dict = meta) -> str | None:
            return None if meta.get(key) is None else js_str(meta[key])

        participants = meta.get("participants")
        scenes.append(
            {
                "id": meta.get("id") or file.name.removesuffix(".md"),
                "chapter_id": chapter_id,
                "title": text("title"),
                "narrator": text("narrator"),
                "place": text("place"),
                "participants": [js_str(p) for p in participants]
                if isinstance(participants, list)
                else [],
                "sort_order": _order(meta.get("sortOrder")),
                "body": body,
            }
        )
    return sorted(scenes, key=lambda s: s["sort_order"])
