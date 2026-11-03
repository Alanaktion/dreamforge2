"""Plotlines and their beats, ported from src/lib/server/plots.ts and plotTemplates.ts.

Each plotline is ``plotlines/<id>.json`` (camelCase keys, as the old server wrote them).
Writes are file-only and take the project lock.
"""

import json
from pathlib import Path
from typing import Any

from ..storage import project_lock, write_file_atomic
from ..utils import generate_id, is_safe_path_segment, iso_now
from .stories import _order

PLOT_TEMPLATES: dict[str, tuple[str, list[str]]] = {
    "heros_journey": (
        "Hero's Journey",
        [
            "Ordinary World",
            "Call to Adventure",
            "Refusal of the Call",
            "Meeting the Mentor",
            "Crossing the Threshold",
            "Tests, Allies, Enemies",
            "Approach to the Inmost Cave",
            "Ordeal",
            "Reward",
            "The Road Back",
            "Resurrection",
            "Return with the Elixir",
        ],
    ),
    "save_the_cat": (
        "Save the Cat",
        [
            "Opening Image",
            "Theme Stated",
            "Set-Up",
            "Catalyst",
            "Debate",
            "Break into Two",
            "B Story",
            "Fun and Games",
            "Midpoint",
            "Bad Guys Close In",
            "All Is Lost",
            "Dark Night of the Soul",
            "Break into Three",
            "Finale",
            "Final Image",
        ],
    ),
    "snowflake": (
        "Snowflake Method",
        [
            "One-sentence summary",
            "Expand to paragraph",
            "Character summaries",
            "Expand each sentence to paragraph",
            "One-page character descriptions",
            "Expand each paragraph to page",
            "Character charts",
            "Scene list",
            "Scene descriptions",
            "Write first draft",
        ],
    ),
}


def _dir(base: Path) -> Path:
    return base / "plotlines"


def _path(base: Path, plotline_id: str) -> Path:
    return _dir(base) / f"{plotline_id}.json"


def _write(base: Path, raw: dict[str, Any]) -> None:
    write_file_atomic(_path(base, raw["id"]), json.dumps(raw, indent=2, ensure_ascii=False))


def _read_raw(file: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(file.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    data.setdefault("id", file.stem)
    data["beats"] = [b for b in data.get("beats") or [] if isinstance(b, dict)]
    return data


def _backfill(base: Path, raw: dict[str, Any], persist: bool) -> dict[str, Any]:
    """Beats predate having ids (they were matched on title, which breaks on duplicates).
    Give any beat without one an id; ``persist`` saves the fix so later reads agree."""
    if all(b.get("id") for b in raw["beats"]):
        return raw
    for beat in raw["beats"]:
        beat.setdefault("id", None)
        beat["id"] = beat["id"] or generate_id()
    if persist:
        _write(base, raw)
    return raw


def _out(raw: dict[str, Any]) -> dict[str, Any]:
    beats = sorted(raw["beats"], key=lambda b: _order(b.get("sortOrder")))
    return {
        "id": str(raw["id"]),
        "story_id": str(raw.get("storyId") or ""),
        "title": str(raw.get("title") or ""),
        "template": raw.get("template") or None,
        "sort_order": _order(raw.get("sortOrder")),
        "created_at": str(raw.get("createdAt") or ""),
        "modified_at": str(raw.get("modifiedAt") or ""),
        "beats": [
            {
                "id": b.get("id"),
                "title": str(b.get("title") or ""),
                "scene_id": b.get("sceneId") or None,
                "sort_order": _order(b.get("sortOrder")),
            }
            for b in beats
        ],
    }


def _load(base: Path, project_id: str, file: Path) -> dict[str, Any] | None:
    raw = _read_raw(file)
    if raw is not None and not all(b.get("id") for b in raw["beats"]):
        with project_lock(project_id):  # re-read: another request may have just saved it
            raw = _read_raw(file)
            if raw is not None:
                _backfill(base, raw, persist=True)
    return raw


def list_plotlines(
    base: Path, project_id: str, story_id: str | None = None
) -> list[dict[str, Any]]:
    directory = _dir(base)
    if not directory.is_dir():
        return []
    result = []
    for file in directory.glob("*.json"):
        raw = _load(base, project_id, file)
        if raw is None or (story_id and raw.get("storyId") != story_id):
            continue
        result.append(_out(raw))
    return sorted(result, key=lambda p: p["sort_order"])


def get_plotline(base: Path, project_id: str, plotline_id: str) -> dict[str, Any] | None:
    if not is_safe_path_segment(plotline_id):
        return None
    raw = _load(base, project_id, _path(base, plotline_id))
    return _out(raw) if raw else None


def create_plotline(
    base: Path, project_id: str, title: str, story_id: str, template: str | None
) -> dict[str, Any]:
    with project_lock(project_id):
        now = iso_now()
        existing = list_plotlines(base, project_id)
        beats = PLOT_TEMPLATES[template][1] if template in PLOT_TEMPLATES else []
        raw = {
            "id": generate_id(),
            "projectId": base.name,
            "storyId": story_id,
            "title": title,
            "template": template or None,
            "beats": [
                {"id": generate_id(), "title": t, "sceneId": None, "sortOrder": i}
                for i, t in enumerate(beats)
            ],
            "sortOrder": int(max((p["sort_order"] for p in existing), default=-1)) + 1,
            "createdAt": now,
            "modifiedAt": now,
        }
        _dir(base).mkdir(parents=True, exist_ok=True)
        _write(base, raw)
        return _out(raw)


def _change(base: Path, project_id: str, plotline_id: str, edit) -> dict[str, Any] | None:
    """Apply ``edit(raw)`` to the plotline file under the project lock."""
    if not is_safe_path_segment(plotline_id):
        return None
    with project_lock(project_id):
        raw = _read_raw(_path(base, plotline_id))
        if raw is None:
            return None
        _backfill(base, raw, persist=False)  # saved below with the edit
        if edit(raw) is False:
            return None
        raw["modifiedAt"] = iso_now()
        _write(base, raw)
        return _out(raw)


def rename_plotline(base: Path, project_id: str, plotline_id: str, title: str):
    return _change(base, project_id, plotline_id, lambda raw: raw.update(title=title))


def delete_plotline(base: Path, project_id: str, plotline_id: str) -> bool:
    if not is_safe_path_segment(plotline_id):
        return False
    with project_lock(project_id):
        file = _path(base, plotline_id)
        if not file.is_file():
            return False
        file.unlink()
        return True


def add_beat(base: Path, project_id: str, plotline_id: str, title: str):
    def edit(raw):
        order = max((_order(b.get("sortOrder")) for b in raw["beats"]), default=-1)
        raw["beats"].append(
            {"id": generate_id(), "title": title, "sceneId": None, "sortOrder": int(order) + 1}
        )

    return _change(base, project_id, plotline_id, edit)


def update_beat(
    base: Path, project_id: str, plotline_id: str, beat_id: str, changes: dict[str, Any]
):
    """``changes`` may hold ``title`` and ``sceneId`` (None unlinks the scene). False from
    the edit means the beat does not exist."""

    def edit(raw):
        beat = next((b for b in raw["beats"] if b.get("id") == beat_id), None)
        if beat is None:
            return False
        beat.update(changes)
        return True

    return _change(base, project_id, plotline_id, edit)


def delete_beat(base: Path, project_id: str, plotline_id: str, beat_id: str):
    def edit(raw):
        kept = [b for b in raw["beats"] if b.get("id") != beat_id]
        if len(kept) == len(raw["beats"]):
            return False
        raw["beats"] = kept
        return True

    return _change(base, project_id, plotline_id, edit)


def reorder_beats(base: Path, project_id: str, plotline_id: str, beat_ids: list[str]):
    """Put the beats in the given order. Beats the list leaves out (added in another tab, say)
    keep their order after the listed ones; the old server dropped them."""

    def edit(raw):
        by_id = {b.get("id"): b for b in raw["beats"]}
        listed = [by_id[i] for i in dict.fromkeys(beat_ids) if i in by_id]
        rest = [
            b
            for b in sorted(raw["beats"], key=lambda b: _order(b.get("sortOrder")))
            if b not in listed
        ]
        raw["beats"] = [{**b, "sortOrder": n} for n, b in enumerate(listed + rest)]

    return _change(base, project_id, plotline_id, edit)
