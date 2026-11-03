"""The project trash page: list, restore and delete for good. Ported from
legacy/routes/projects/[id]/trash."""

from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import Deleted, Ok, TrashList
from ..services import trash
from .entities import _access, _editor

router = APIRouter(prefix="/projects/{project_id}/trash", tags=["trash"])


@router.get("", response_model=TrashList)
def list_trash(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    return {"items": trash.list_trash(db, project), "project_name": project.name, "role": role}


@router.post("/{trash_id}/restore", response_model=Ok)
def restore(project_id: str, trash_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    try:
        restored = trash.restore(db, project, trash_id)
    except trash.RestoreError as err:
        raise HTTPException(409, str(err)) from err
    if not restored:
        raise HTTPException(404, "Nothing to restore")
    return {}


@router.delete("/{trash_id}", response_model=Deleted)
def delete_forever(project_id: str, trash_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    deleted = trash.permanent_delete(db, project, [trash_id])
    if not deleted:
        raise HTTPException(404, "Not in the trash")
    return {"deleted": deleted}


@router.delete("", response_model=Deleted)
def empty_trash(project_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    ids = [item["id"] for item in trash.list_trash(db, project)]
    return {"deleted": trash.permanent_delete(db, project, ids)}
