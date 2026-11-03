"""Moving data in and out of a project: CSV export/import of one entity type, the project
ZIP export, restoring a project from a ZIP, and backups.

Ported from legacy/routes/projects/[id]/{export,backups,[type]/export-csv,[type]/import-csv}
and the import action of the projects page.
"""

import os
import tempfile
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import (
    BackupCreated,
    BackupList,
    BackupSettings,
    Created,
    CsvImport,
    CsvImportResult,
    Ok,
)
from ..services import archives, csv_io, members
from ..services import custom_fields as fields_service
from .entities import _access, _editor, _type
from .projects import _owner

router = APIRouter(prefix="/projects", tags=["transfer"])


def _attachment(filename: str) -> str:
    """Content-Disposition for a download, safe for any project name."""
    ascii_name = filename.encode("ascii", "replace").decode().replace('"', "_")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


# --- CSV ------------------------------------------------------------------------------------


@router.get("/{project_id}/csv/{route}")
def export_csv(project_id: str, route: str, auth: CurrentAuth, db: Db):
    entity_type = _type(route)
    project, _ = _access(db, project_id, auth)
    custom = [f.key for f in fields_service.get_custom_fields(db, project.id, entity_type)]
    return Response(
        csv_io.export_csv(project, entity_type, custom),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": _attachment(f"{entity_type}s.csv")},
    )


@router.post("/{project_id}/csv/{route}", response_model=CsvImportResult)
def import_csv(project_id: str, route: str, body: CsvImport, auth: CurrentAuth, db: Db):
    entity_type = _type(route)
    project = _editor(db, project_id, auth)
    if not body.rows:
        raise HTTPException(400, "The CSV file has no data rows")
    rows = [row.model_dump() for row in body.rows]
    return csv_io.import_rows(db, project, entity_type, rows)


# --- Project ZIP ----------------------------------------------------------------------------


@router.get("/{project_id}/export")
def export_zip(project_id: str, auth: CurrentAuth, db: Db):
    project, _ = _access(db, project_id, auth)
    filename = archives.archive_filename(project)
    db.rollback()  # end this read; the archive refreshes metadata.json in its own session
    fd, name = tempfile.mkstemp(suffix=".zip", prefix="dreamforge-export-")
    try:
        with os.fdopen(fd, "wb") as output:
            archives.write_archive(project_id, output)
    except BaseException:
        os.unlink(name)
        raise
    return FileResponse(
        name,
        media_type="application/zip",
        headers={"Content-Disposition": _attachment(filename)},
        background=BackgroundTask(os.unlink, name),
    )


def _signed_in(auth: CurrentAuth, db: Db) -> str:
    """The user, checked before the upload is read. Ends the transaction auth opened (a
    write one, on a POST) so a slow upload does not hold the database write lock."""
    db.rollback()
    return auth.user.id


async def _zip_upload(request: Request, _user: Annotated[str, Depends(_signed_in)]) -> Path:
    """The request body, streamed to a temporary file and refused past 20 MB."""
    fd, name = tempfile.mkstemp(suffix=".zip", prefix="dreamforge-import-")
    size = 0
    try:
        with os.fdopen(fd, "wb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > archives.MAX_IMPORT_BYTES:
                    raise HTTPException(413, "Choose a ZIP file up to 20 MB")
                output.write(chunk)
    except BaseException:
        os.unlink(name)
        raise
    return Path(name)


@router.post("/import", response_model=Created, status_code=201)
def import_zip(
    db: Db,
    user_id: Annotated[str, Depends(_signed_in)],
    upload: Annotated[Path, Depends(_zip_upload)],
):
    """Restore a project from an exported or backed-up ZIP (the raw file as the body). The
    caller owns the new project."""
    try:
        if upload.stat().st_size == 0:
            raise HTTPException(400, "Choose a ZIP file up to 20 MB")
        return {"id": archives.restore_project(db, upload, user_id)}
    except archives.ArchiveError as cause:
        raise HTTPException(400, str(cause)) from cause
    finally:
        upload.unlink(missing_ok=True)


# --- Backups --------------------------------------------------------------------------------

_OWNER_ONLY = "Only the owner can manage backups"


@router.get("/{project_id}/backups", response_model=BackupList)
def list_backups(project_id: str, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth, _OWNER_ONLY)
    return {
        "backups": archives.list_backups(project.id),
        "enabled": archives.backups_enabled(project),
    }


@router.post("/{project_id}/backups", response_model=BackupCreated, status_code=201)
def backup_now(project_id: str, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth, _OWNER_ONLY)
    base = members.project_path(project)
    db.rollback()  # release the write lock: the archive refreshes metadata.json itself
    try:
        return {"name": archives.create_backup(project_id, base)}
    except archives.ArchiveError as cause:
        raise HTTPException(409, str(cause)) from cause


@router.put("/{project_id}/backups/settings", response_model=Ok)
def backup_settings(project_id: str, body: BackupSettings, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth, _OWNER_ONLY)
    archives.set_backups_enabled(project, body.enabled)
    return {}


@router.get("/{project_id}/backups/{name}")
def download_backup(project_id: str, name: str, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth, "Only the owner can download backups")
    file = archives.backup_file(project.id, name)
    if file is None:
        raise HTTPException(404, "Backup not found")
    return FileResponse(
        file, media_type="application/zip", headers={"Content-Disposition": _attachment(name)}
    )
