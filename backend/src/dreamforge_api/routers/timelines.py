"""The project timeline: dated events on a configurable calendar. Ported from
legacy/routes/projects/[id]/timelines."""

from typing import Any

from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import (
    CalendarOut,
    CalendarUpdate,
    EventCreate,
    EventUpdate,
    Ok,
    TimelineEventOut,
    TimelinePage,
)
from ..services import members, timelines
from .entities import _access, _editor, _index

router = APIRouter(prefix="/projects/{project_id}/timeline", tags=["timeline"])

# Body keys to timeline.json keys (camelCase, as the old server wrote them).
_KEYS = {"entity_ids": "entityIds"}


def _calendar(raw: dict[str, Any]) -> dict[str, Any]:
    months = [str(m) for m in raw.get("months") or [] if isinstance(m, str)]
    epoch = raw.get("epoch")
    return {
        "name": str(raw.get("name") or ""),
        "months": months or timelines.DEFAULT_MONTHS,
        "epoch": epoch if isinstance(epoch, int | float) and not isinstance(epoch, bool) else 0,
    }


@router.get("", response_model=TimelinePage)
def show_timeline(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    data = timelines.load_timeline(members.project_path(project))
    events = [timelines.event_out(e) for e in data["events"] if isinstance(e, dict)]
    return {
        "timeline": {"calendar": _calendar(data["calendar"]), "events": events},
        "entities": _index(db, project_id),
        "project_name": project.name,
        "role": role,
    }


@router.post("/events", response_model=TimelineEventOut, status_code=201)
def create_event(project_id: str, body: EventCreate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    if not body.title.strip():
        raise HTTPException(400, "Title and year are required")
    fields = {
        "year": body.year,
        "month": body.month,
        "day": body.day,
        "era": body.era.strip() or "CE",
        "title": body.title.strip(),
        "description": body.description,
        "significance": body.significance,
        "entityIds": list(dict.fromkeys(body.entity_ids)),
    }
    event = timelines.add_event(members.project_path(project), project.id, fields)
    return timelines.event_out(event)


@router.patch("/events/{event_id}", response_model=TimelineEventOut)
def update_event(project_id: str, event_id: str, body: EventUpdate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    changes: dict[str, Any] = {}
    for name in body.model_fields_set:
        value = getattr(body, name)
        if value is None and name not in ("month", "day"):
            raise HTTPException(400, f"{name} cannot be empty")
        if name == "title":
            value = value.strip()
            if not value:
                raise HTTPException(400, "Title is required")
        if name == "entity_ids":
            value = list(dict.fromkeys(value))
        changes[_KEYS.get(name, name)] = value
    event = timelines.update_event(members.project_path(project), project.id, event_id, changes)
    if event is None:
        raise HTTPException(404, "Event not found")
    return timelines.event_out(event)


@router.delete("/events/{event_id}", response_model=Ok)
def delete_event(project_id: str, event_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    if not timelines.delete_event(members.project_path(project), project.id, event_id):
        raise HTTPException(404, "Event not found")
    return {}


@router.put("/calendar", response_model=CalendarOut)
def update_calendar(project_id: str, body: CalendarUpdate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    months = [m.strip() for m in body.months or [] if m.strip()]
    calendar = timelines.update_calendar(
        members.project_path(project), project.id, body.name.strip(), months or None
    )
    return _calendar(calendar)
