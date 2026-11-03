"""Plotlines and their beats. Ported from legacy/routes/projects/[id]/plots/**."""

from typing import Any

from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import (
    BeatCreate,
    BeatUpdate,
    Ok,
    PlotlineCreate,
    PlotlineDetail,
    PlotlineList,
    PlotlineOut,
    PlotlineRename,
    Reorder,
)
from ..services import members, plots, stories
from ..utils import is_safe_path_segment
from .entities import _access, _editor

router = APIRouter(prefix="/projects/{project_id}/plotlines", tags=["plots"])


def _ids(*ids: str) -> None:
    if not all(is_safe_path_segment(i) for i in ids):
        raise HTTPException(400, "Invalid id")


def _title(value: str) -> str:
    title = value.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    return title


def _found(plotline: dict[str, Any] | None, what: str = "Plotline") -> dict[str, Any]:
    if plotline is None:
        raise HTTPException(404, f"{what} not found")
    return plotline


@router.get("", response_model=PlotlineList)
def list_plotlines(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    base = members.project_path(project)
    return {
        "plotlines": plots.list_plotlines(base, project.id),
        "stories": stories.list_stories(base),
        "project_name": project.name,
        "role": role,
    }


@router.post("", response_model=PlotlineOut, status_code=201)
def create_plotline(project_id: str, body: PlotlineCreate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    title = _title(body.title)
    base = members.project_path(project)
    if not is_safe_path_segment(body.story_id) or stories.get_story(base, body.story_id) is None:
        raise HTTPException(400, "Choose a story for the plotline")
    return plots.create_plotline(base, project.id, title, body.story_id, body.template)


@router.get("/{plotline_id}", response_model=PlotlineDetail)
def show_plotline(project_id: str, plotline_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    _ids(plotline_id)
    base = members.project_path(project)
    plotline = _found(plots.get_plotline(base, project.id, plotline_id))
    story_id = plotline["story_id"]
    # Plotlines from before stories were required may have none, or one since deleted.
    has_story = is_safe_path_segment(story_id) and stories.get_story(base, story_id) is not None
    return {
        "plotline": plotline,
        "chapters": stories.story_tree(base, story_id) if has_story else [],
        "project_name": project.name,
        "role": role,
    }


@router.patch("/{plotline_id}", response_model=PlotlineOut)
def rename_plotline(
    project_id: str, plotline_id: str, body: PlotlineRename, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    _ids(plotline_id)
    title = _title(body.title)
    base = members.project_path(project)
    return _found(plots.rename_plotline(base, project.id, plotline_id, title))


@router.delete("/{plotline_id}", response_model=Ok)
def delete_plotline(project_id: str, plotline_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(plotline_id)
    if not plots.delete_plotline(members.project_path(project), project.id, plotline_id):
        raise HTTPException(404, "Plotline not found")
    return {}


@router.post("/{plotline_id}/beats", response_model=PlotlineOut, status_code=201)
def add_beat(project_id: str, plotline_id: str, body: BeatCreate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(plotline_id)
    title = _title(body.title)
    base = members.project_path(project)
    return _found(plots.add_beat(base, project.id, plotline_id, title))


@router.put("/{plotline_id}/beats/order", response_model=PlotlineOut)
def reorder_beats(project_id: str, plotline_id: str, body: Reorder, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(plotline_id)
    base = members.project_path(project)
    return _found(plots.reorder_beats(base, project.id, plotline_id, body.ids))


@router.patch("/{plotline_id}/beats/{beat_id}", response_model=PlotlineOut)
def update_beat(
    project_id: str,
    plotline_id: str,
    beat_id: str,
    body: BeatUpdate,
    auth: CurrentAuth,
    db: Db,
):
    project = _editor(db, project_id, auth)
    _ids(plotline_id)
    changes: dict[str, Any] = {}
    if "title" in body.model_fields_set:
        changes["title"] = _title(body.title or "")
    if "scene_id" in body.model_fields_set:
        scene_id = body.scene_id or None
        if scene_id is not None:
            _ids(scene_id)
        changes["sceneId"] = scene_id
    if not changes:
        raise HTTPException(400, "Nothing to change")
    base = members.project_path(project)
    return _found(
        plots.update_beat(base, project.id, plotline_id, beat_id, changes), "Plotline or beat"
    )


@router.delete("/{plotline_id}/beats/{beat_id}", response_model=PlotlineOut)
def delete_beat(project_id: str, plotline_id: str, beat_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(plotline_id)
    base = members.project_path(project)
    return _found(plots.delete_beat(base, project.id, plotline_id, beat_id), "Plotline or beat")
