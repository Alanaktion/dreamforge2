"""The project dashboard and the writing goal. Ported from legacy/routes/projects/[id]
(+page.server.ts) and the daily goal form of the project settings page."""

from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import DailyGoal, Dashboard, WritingProgress
from ..services import members, stats, writing
from ..services.primary_images import with_primary_images
from .entities import _access, _editor

router = APIRouter(prefix="/projects/{project_id}", tags=["dashboard"])


@router.get("/dashboard", response_model=Dashboard)
def dashboard(project_id: str, auth: CurrentAuth, db: Db):
    project, _ = _access(db, project_id, auth)
    project_stats, getting_started = stats.dashboard(project)
    with_primary_images(db, project, project_stats["recent"])
    return {
        "stats": project_stats,
        "progress": writing.get_progress(members.project_path(project), lenient=True),
        "getting_started": getting_started,
    }


@router.get("/writing", response_model=WritingProgress)
def progress(project_id: str, auth: CurrentAuth, db: Db):
    project, _ = _access(db, project_id, auth)
    return writing.get_progress(members.project_path(project))


@router.put("/writing/goal", response_model=WritingProgress)
def set_goal(project_id: str, body: DailyGoal, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    if not 0 <= body.goal <= 1_000_000:
        raise HTTPException(400, "Enter a goal between 0 and 1,000,000 words")
    base = members.project_path(project)
    writing.set_daily_goal(base, project.id, body.goal)
    return writing.get_progress(base)
