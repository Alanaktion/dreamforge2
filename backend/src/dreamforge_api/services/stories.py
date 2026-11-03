"""Stories, chapters and scenes, ported from src/lib/server/stories.ts.

On disk a story is ``stories/<id>/story.json``, a chapter is
``stories/<id>/chapters/<id>/chapter.md`` (frontmatter only) and a scene is
``.../chapters/<id>/scenes/<id>.md``. The files keep the camelCase keys the old server
wrote; the dicts returned here use snake_case, and the API schemas turn them back into
camelCase JSON.

None of this is in the database, so writes only need the project lock, never a
transaction (see storage.project_lock).
"""

import json
import os
from pathlib import Path
from typing import Any

from ..markdown import read_markdown_file, write_markdown_file
from ..storage import assert_revision, file_revision, project_lock, write_file_atomic
from ..utils import generate_id, is_safe_path_segment, iso_now
from .entities import js_str

SCENE_STATUSES = ("draft", "revised", "final")

# Scene fields an edit may set, as the API names them and as the file stores them.
SCENE_FIELDS = {
    "title": "title",
    "status": "status",
    "narrator": "narrator",
    "time": "time",
    "place": "place",
    "participants": "participants",
    "background_image": "backgroundImage",
    "summary": "summary",
}


class UnsafeIdError(ValueError):
    pass


def _safe(*ids: str) -> None:
    for value in ids:
        if not is_safe_path_segment(value):
            raise UnsafeIdError(f"Unsafe id: {value!r}")


def story_dir(base: Path, story_id: str) -> Path:
    _safe(story_id)
    return base / "stories" / story_id


def chapter_dir(base: Path, story_id: str, chapter_id: str) -> Path:
    _safe(chapter_id)
    return story_dir(base, story_id) / "chapters" / chapter_id


def scenes_dir(base: Path, story_id: str, chapter_id: str) -> Path:
    return chapter_dir(base, story_id, chapter_id) / "scenes"


def scene_path(base: Path, story_id: str, chapter_id: str, scene_id: str) -> Path:
    _safe(scene_id)
    return scenes_dir(base, story_id, chapter_id) / f"{scene_id}.md"


def _subdirs(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return [p for p in directory.iterdir() if p.is_dir() and is_safe_path_segment(p.name)]


def _order(value: Any) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0
    return number if number == number else 0  # NaN sorts as 0, like Number() || 0


def _text(value: Any) -> str | None:
    return None if value is None else js_str(value)


# --- Stories --------------------------------------------------------------------------------


def read_story_file(file: Path) -> dict[str, Any] | None:
    try:
        meta = json.loads(file.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict):
        return None
    now = iso_now()
    return {
        "id": js_str(meta.get("id") or file.parent.name),
        "project_id": js_str(meta.get("projectId") or ""),
        "title": js_str(meta.get("title") or ""),
        "description": _text(meta.get("description")) or None,
        "sort_order": _order(meta.get("sortOrder")),
        "created_at": js_str(meta.get("createdAt") or now),
        "modified_at": js_str(meta.get("modifiedAt") or now),
        "_raw": meta,
    }


def _public(record: dict[str, Any] | None) -> dict[str, Any] | None:
    return None if record is None else {k: v for k, v in record.items() if k != "_raw"}


def get_story(base: Path, story_id: str) -> dict[str, Any] | None:
    if not is_safe_path_segment(story_id):
        return None
    return _public(read_story_file(story_dir(base, story_id) / "story.json"))


def list_stories(base: Path) -> list[dict[str, Any]]:
    stories = [read_story_file(d / "story.json") for d in _subdirs(base / "stories")]
    return sorted((_public(s) for s in stories if s), key=lambda s: s["sort_order"])


def _write_story(base: Path, story_id: str, raw: dict[str, Any]) -> None:
    write_file_atomic(
        story_dir(base, story_id) / "story.json", json.dumps(raw, indent=2, ensure_ascii=False)
    )


def create_story(
    base: Path, project_id: str, title: str, description: str | None
) -> dict[str, Any]:
    with project_lock(project_id):
        now = iso_now()
        stories = list_stories(base)
        story_id = generate_id()
        raw = {
            "id": story_id,
            "projectId": base.name,
            "title": title,
            "description": description or None,
            "sortOrder": int(max((s["sort_order"] for s in stories), default=-1)) + 1,
            "createdAt": now,
            "modifiedAt": now,
        }
        (story_dir(base, story_id) / "chapters").mkdir(parents=True, exist_ok=True)
        _write_story(base, story_id, raw)
        return get_story(base, story_id)  # type: ignore[return-value]


def update_story(
    base: Path, project_id: str, story_id: str, title: str, description: str | None
) -> dict[str, Any] | None:
    with project_lock(project_id):
        current = read_story_file(story_dir(base, story_id) / "story.json")
        if current is None:
            return None
        raw = {**current["_raw"], "title": title, "description": description or None}
        raw["modifiedAt"] = iso_now()
        _write_story(base, story_id, raw)
        return get_story(base, story_id)


# --- Chapters -------------------------------------------------------------------------------


def read_chapter_file(file: Path, chapter_id: str, story_id: str = "") -> dict[str, Any] | None:
    md = read_markdown_file(file)
    if md is None:
        return None
    meta = md[0]
    now = iso_now()
    return {
        "id": js_str(meta.get("id") or chapter_id),
        "story_id": story_id or js_str(meta.get("storyId") or ""),
        "title": js_str(meta["title"]) if meta.get("title") is not None else "Untitled",
        "sort_order": _order(meta.get("sortOrder")),
        "created_at": js_str(meta.get("createdAt") or now),
        "modified_at": js_str(meta.get("modifiedAt") or now),
    }


def get_chapter(base: Path, story_id: str, chapter_id: str) -> dict[str, Any] | None:
    if not is_safe_path_segment(story_id) or not is_safe_path_segment(chapter_id):
        return None
    file = chapter_dir(base, story_id, chapter_id) / "chapter.md"
    return read_chapter_file(file, chapter_id, story_id)


def list_chapters(base: Path, story_id: str) -> list[dict[str, Any]]:
    if not is_safe_path_segment(story_id):
        return []
    chapters = [
        read_chapter_file(d / "chapter.md", d.name, story_id)
        for d in _subdirs(story_dir(base, story_id) / "chapters")
    ]
    return sorted((c for c in chapters if c), key=lambda c: c["sort_order"])


def create_chapter(base: Path, project_id: str, story_id: str, title: str) -> dict[str, Any]:
    with project_lock(project_id):
        now = iso_now()
        chapters = list_chapters(base, story_id)
        chapter_id = generate_id()
        meta = {
            "id": chapter_id,
            "storyId": story_id,
            "title": title,
            "sortOrder": int(max((c["sort_order"] for c in chapters), default=-1)) + 1,
            "createdAt": now,
            "modifiedAt": now,
        }
        directory = chapter_dir(base, story_id, chapter_id)
        (directory / "scenes").mkdir(parents=True, exist_ok=True)
        write_markdown_file(directory / "chapter.md", meta, "")
        return get_chapter(base, story_id, chapter_id)  # type: ignore[return-value]


def _update_chapter(
    base: Path, story_id: str, chapter_id: str, changes: dict[str, Any]
) -> dict[str, Any] | None:
    """Caller holds the project lock."""
    current = get_chapter(base, story_id, chapter_id)
    if current is None:
        return None
    file = chapter_dir(base, story_id, chapter_id) / "chapter.md"
    md = read_markdown_file(file)
    existing, body = md if md else ({}, "")
    frontmatter = {
        **existing,
        "id": current["id"],
        "storyId": story_id,
        "title": current["title"],
        "sortOrder": existing.get("sortOrder", 0),
        "createdAt": current["created_at"],
        **changes,
        "modifiedAt": iso_now(),
    }
    write_markdown_file(file, frontmatter, body)
    return get_chapter(base, story_id, chapter_id)


def update_chapter(
    base: Path, project_id: str, story_id: str, chapter_id: str, title: str
) -> dict[str, Any] | None:
    with project_lock(project_id):
        return _update_chapter(base, story_id, chapter_id, {"title": title})


def reorder_chapters(base: Path, project_id: str, story_id: str, chapter_ids: list[str]) -> None:
    with project_lock(project_id):
        for index, chapter_id in enumerate(chapter_ids):
            _update_chapter(base, story_id, chapter_id, {"sortOrder": index})


# --- Scenes ---------------------------------------------------------------------------------


def read_scene_file(file: Path, chapter_id: str) -> dict[str, Any] | None:
    md = read_markdown_file(file)
    if md is None:
        return None
    meta, body = md
    participants = meta.get("participants")
    plot_threads = meta.get("plotThreads")
    status = meta.get("status")
    now = iso_now()
    return {
        "revision": file_revision(file),
        "id": js_str(meta.get("id") or file.name.removesuffix(".md")),
        "chapter_id": chapter_id,
        "title": _text(meta.get("title")),
        "status": status if status in SCENE_STATUSES else "draft",
        "narrator": _text(meta.get("narrator")),
        "time": _text(meta.get("time")),
        "place": _text(meta.get("place")),
        "participants": [js_str(p) for p in participants] if isinstance(participants, list) else [],
        "background_image": _text(meta.get("backgroundImage")),
        "summary": _text(meta.get("summary")),
        "plot_threads": [t for t in plot_threads if isinstance(t, dict)]
        if isinstance(plot_threads, list)
        else [],
        "sort_order": _order(meta.get("sortOrder")),
        "body": body,
        "created_at": js_str(meta.get("createdAt") or now),
        "modified_at": js_str(meta.get("modifiedAt") or now),
    }


def list_scenes(base: Path, story_id: str, chapter_id: str) -> list[dict[str, Any]]:
    if not is_safe_path_segment(story_id) or not is_safe_path_segment(chapter_id):
        return []
    directory = scenes_dir(base, story_id, chapter_id)
    if not directory.is_dir():
        return []
    scenes = [
        read_scene_file(f, chapter_id)
        for f in directory.iterdir()
        if f.name.endswith(".md") and not f.name.startswith(".")
    ]
    return sorted((s for s in scenes if s), key=lambda s: s["sort_order"])


def get_scene(base: Path, story_id: str, chapter_id: str, scene_id: str) -> dict[str, Any] | None:
    ids = (story_id, chapter_id, scene_id)
    if not all(is_safe_path_segment(i) for i in ids):
        return None
    file = scene_path(base, *ids)
    return read_scene_file(file, chapter_id) if file.is_file() else None


def _scene_frontmatter(scene: dict[str, Any]) -> dict[str, Any]:
    """The keys the old server wrote for every scene, in its order."""
    return {
        "id": scene["id"],
        "chapterId": scene["chapter_id"],
        "title": scene["title"],
        "status": scene["status"],
        "narrator": scene["narrator"],
        "time": scene["time"],
        "place": scene["place"],
        "participants": scene["participants"],
        "backgroundImage": scene["background_image"],
        "summary": scene["summary"],
        "plotThreads": scene["plot_threads"],
        "sortOrder": int(scene["sort_order"])
        if float(scene["sort_order"]).is_integer()
        else scene["sort_order"],
        "createdAt": scene["created_at"],
        "modifiedAt": scene["modified_at"],
    }


def create_scene(
    base: Path,
    project_id: str,
    story_id: str,
    chapter_id: str,
    title: str | None = None,
    fields: dict[str, Any] | None = None,
    body: str = "",
) -> dict[str, Any]:
    with project_lock(project_id):
        if get_chapter(base, story_id, chapter_id) is None:
            raise FileNotFoundError("Chapter not found")
        now = iso_now()
        scenes = list_scenes(base, story_id, chapter_id)
        scene = {
            "id": generate_id(),
            "chapter_id": chapter_id,
            "title": title or None,
            "status": "draft",
            "narrator": None,
            "time": None,
            "place": None,
            "participants": [],
            "background_image": None,
            "summary": None,
            "plot_threads": [],
            "sort_order": int(max((s["sort_order"] for s in scenes), default=-1)) + 1,
            "created_at": now,
            "modified_at": now,
            **(fields or {}),
        }
        file = scene_path(base, story_id, chapter_id, scene["id"])
        write_markdown_file(file, _scene_frontmatter(scene), body)
        return read_scene_file(file, chapter_id)  # type: ignore[return-value]


def _update_scene(
    base: Path,
    story_id: str,
    chapter_id: str,
    scene_id: str,
    changes: dict[str, Any],
    body: str | None,
    expected_revision: str | None,
) -> dict[str, Any] | None:
    """Caller holds the project lock. ``changes`` uses SCENE_FIELDS' API names, plus
    ``sort_order``."""
    scene = get_scene(base, story_id, chapter_id, scene_id)
    if scene is None:
        return None
    file = scene_path(base, story_id, chapter_id, scene_id)
    assert_revision(file, expected_revision)
    md = read_markdown_file(file)
    existing = md[0] if md else {}
    updated = {**scene, **changes, "modified_at": iso_now()}
    if updated["status"] not in SCENE_STATUSES:
        updated["status"] = "draft"
    frontmatter = {**existing, **_scene_frontmatter(updated)}
    write_markdown_file(file, frontmatter, scene["body"] if body is None else body)
    return read_scene_file(file, chapter_id)


def update_scene(
    base: Path,
    project_id: str,
    story_id: str,
    chapter_id: str,
    scene_id: str,
    changes: dict[str, Any],
    body: str | None,
    expected_revision: str | None,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """The scene before and after the edit, or None when it does not exist."""
    with project_lock(project_id):
        before = get_scene(base, story_id, chapter_id, scene_id)
        if before is None:
            return None
        after = _update_scene(
            base, story_id, chapter_id, scene_id, changes, body, expected_revision
        )
        return (before, after) if after else None


def reorder_scenes(
    base: Path, project_id: str, story_id: str, chapter_id: str, scene_ids: list[str]
) -> None:
    with project_lock(project_id):
        for index, scene_id in enumerate(scene_ids):
            _update_scene(base, story_id, chapter_id, scene_id, {"sort_order": index}, None, None)


def story_tree(base: Path, story_id: str) -> list[dict[str, Any]]:
    """The story's chapters, each with its scenes."""
    return [
        {**chapter, "scenes": list_scenes(base, story_id, chapter["id"])}
        for chapter in list_chapters(base, story_id)
    ]


def rename_into_place(source: Path, target: Path) -> None:
    """os.rename that refuses to replace an existing file or directory."""
    if target.exists():
        raise FileExistsError(f"{target} already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    os.rename(source, target)
