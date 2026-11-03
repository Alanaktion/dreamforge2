"""Read-only plotlines (plotlines/<id>.json), for the story summaries page. Editing them
is part of a later stage of the port (see src/lib/server/plots.ts)."""

import json
from pathlib import Path
from typing import Any

from .stories import _order


def list_plotlines(base: Path, story_id: str | None = None) -> list[dict[str, Any]]:
    directory = base / "plotlines"
    if not directory.is_dir():
        return []
    plotlines = []
    for file in directory.glob("*.json"):
        try:
            data = json.loads(file.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or (story_id and data.get("storyId") != story_id):
            continue
        beats = [b for b in data.get("beats") or [] if isinstance(b, dict)]
        plotlines.append(
            {
                "id": str(data.get("id") or file.stem),
                "title": str(data.get("title") or ""),
                "sort_order": _order(data.get("sortOrder")),
                "beats": [
                    {
                        "id": b.get("id"),
                        "title": str(b.get("title") or ""),
                        "scene_id": b.get("sceneId"),
                    }
                    for b in sorted(beats, key=lambda b: _order(b.get("sortOrder")))
                ],
            }
        )
    return sorted(plotlines, key=lambda p: p["sort_order"])
