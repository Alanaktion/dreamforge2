"""The project timeline (``timeline.json``): a calendar and dated events. Ported from
src/lib/server/timelines.ts. Writes take the project lock."""

from pathlib import Path
from typing import Any

from ..storage import project_lock, read_json, write_json
from ..utils import generate_id, iso_now

DEFAULT_MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
SIGNIFICANCE = ("major", "minor", "trivial")
EVENT_FIELDS = ("year", "month", "day", "era", "title", "description", "significance")


def _path(base: Path) -> Path:
    return base / "timeline.json"


def _valid(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("events"), list)
        and isinstance(value.get("calendar"), dict)
        and isinstance(value["calendar"].get("months"), list)
    )


def load_timeline(base: Path) -> dict[str, Any]:
    return read_json(
        _path(base),
        {"calendar": {"name": "Gregorian", "months": DEFAULT_MONTHS, "epoch": 0}, "events": []},
        _valid,
    )


def _sort_key(event: dict[str, Any]):
    def number(key: str) -> float:
        value = event.get(key)
        return value if isinstance(value, int | float) and not isinstance(value, bool) else 0

    return (number("year"), number("month"), number("day"))


def _save(base: Path, data: dict[str, Any]) -> None:
    data["events"].sort(key=_sort_key)
    write_json(_path(base), data)


def add_event(base: Path, project_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    with project_lock(project_id):
        data = load_timeline(base)
        now = iso_now()
        event = {**fields, "id": generate_id(), "createdAt": now, "modifiedAt": now}
        data["events"].append(event)
        _save(base, data)
        return event


def update_event(
    base: Path, project_id: str, event_id: str, changes: dict[str, Any]
) -> dict[str, Any] | None:
    with project_lock(project_id):
        data = load_timeline(base)
        for i, event in enumerate(data["events"]):
            if isinstance(event, dict) and event.get("id") == event_id:
                data["events"][i] = {**event, **changes, "modifiedAt": iso_now()}
                updated = data["events"][i]
                _save(base, data)
                return updated
        return None


def delete_event(base: Path, project_id: str, event_id: str) -> bool:
    with project_lock(project_id):
        data = load_timeline(base)
        kept = [e for e in data["events"] if not (isinstance(e, dict) and e.get("id") == event_id)]
        if len(kept) == len(data["events"]):
            return False
        data["events"] = kept
        _save(base, data)
        return True


def update_calendar(
    base: Path, project_id: str, name: str, months: list[str] | None
) -> dict[str, Any]:
    with project_lock(project_id):
        data = load_timeline(base)
        data["calendar"] = {**data["calendar"], "name": name or "Custom"}
        if months:
            data["calendar"]["months"] = months
        _save(base, data)
        return data["calendar"]


def event_out(event: dict[str, Any]) -> dict[str, Any]:
    def integer(key: str) -> int | None:
        value = event.get(key)
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    significance = event.get("significance")
    return {
        "id": str(event.get("id") or ""),
        "year": integer("year") or 0,
        "month": integer("month"),
        "day": integer("day"),
        "era": str(event.get("era") or ""),
        "title": str(event.get("title") or ""),
        "description": str(event.get("description") or ""),
        "significance": significance if significance in SIGNIFICANCE else "minor",
        "entity_ids": [str(i) for i in event.get("entityIds") or [] if isinstance(i, str)],
        "created_at": str(event.get("createdAt") or ""),
        "modified_at": str(event.get("modifiedAt") or ""),
    }
