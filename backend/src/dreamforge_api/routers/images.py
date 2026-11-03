"""Project images: the gallery, uploads, captions, entity links, and serving the files.
Ported from legacy/routes/projects/[id]/images/** and legacy/routes/api/projects/[id]/images."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import ImageDetail, ImageList, ImageOut, ImageUpdate, Ok, TrashedEntity
from ..services import images, members, trash
from ..utils import is_safe_path_segment
from .entities import _access, _editor, _index

router = APIRouter(prefix="/projects/{project_id}/images", tags=["images"])


def _upload_access(project_id: str, auth: CurrentAuth, db: Db) -> None:
    """Refuses non-editors before the body is read, then ends the transaction: auth opened
    a write (IMMEDIATE) transaction, which must not stay open while a slow client uploads.
    The endpoint checks access again after the upload."""
    _editor(db, project_id, auth)
    db.rollback()


async def _upload_body(
    request: Request, _access_checked: Annotated[None, Depends(_upload_access)]
) -> bytes:
    """The raw request body, refused past the image size limit even without a
    Content-Length (the app middleware only checks the declared length)."""
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > images.MAX_IMAGE_BYTES:
            raise HTTPException(413, "Images can be at most 20 MB")
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("", response_model=ImageList)
def list_images(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    if images.scan_existing(project.id):
        db.rollback()  # end this request's read snapshot so the new rows show
    return {
        "images": images.list_images(db, project.id),
        "project_name": project.name,
        "role": role,
    }


@router.post("", response_model=ImageOut, status_code=201)
def upload(
    project_id: str,
    auth: CurrentAuth,
    db: Db,
    data: Annotated[bytes, Depends(_upload_body)],
    name: Annotated[str, Query(max_length=255)] = "",
):
    """One image per request: the file's bytes as the body, its name in ``?name=``."""
    project = _editor(db, project_id, auth)
    if not images.extension(name):
        raise HTTPException(400, "Images must be PNG, JPEG, GIF, WebP or SVG")
    image = images.upload_image(db, project, name, data)
    if image is None:
        raise HTTPException(400, "That file is not a valid image")
    return image


@router.get("/{image_id}/details", response_model=ImageDetail)
def show_image(project_id: str, image_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    row = images.get_image(db, project.id, image_id)
    if row is None:
        raise HTTPException(404, "Image not found")
    return {
        "image": images.image_detail(db, row),
        "entities": _index(db, project.id),
        "project_name": project.name,
        "role": role,
    }


@router.patch("/{image_id}", response_model=ImageOut)
def update_image(project_id: str, image_id: str, body: ImageUpdate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    changes = {name: (getattr(body, name) or "").strip() or None for name in body.model_fields_set}
    if not changes:
        raise HTTPException(400, "Nothing to change")
    image = images.update_image(db, project, image_id, changes)
    if image is None:
        raise HTTPException(404, "Image not found")
    return image


@router.delete("/{image_id}", response_model=TrashedEntity)
def delete_image(project_id: str, image_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    item = trash.soft_delete_image(db, project, image_id)
    if item is None:
        raise HTTPException(404, "Image not found")
    return item


@router.put("/{image_id}/links/{entity_id}", response_model=Ok)
def link_entity(project_id: str, image_id: str, entity_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    if not images.link_entity(db, project, image_id, entity_id):
        raise HTTPException(404, "Image or entity not found")
    return {}


@router.delete("/{image_id}/links/{entity_id}", response_model=Ok)
def unlink_entity(project_id: str, image_id: str, entity_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    if not images.unlink_entity(db, project, image_id, entity_id):
        raise HTTPException(404, "Not linked")
    return {}


@router.get("/{filename}", response_class=FileResponse)
def serve(project_id: str, filename: str, auth: CurrentAuth, db: Db):
    """The image file itself, at the URL scenes and entity bodies already embed."""
    project, _ = _access(db, project_id, auth)
    ext = images.extension(filename)
    file = images.image_dir(members.project_path(project)) / filename
    if not ext or not is_safe_path_segment(filename) or not file.is_file():
        raise HTTPException(404, "Not found")
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"}
    if ext == ".svg":
        # Uploaded SVGs are same-origin documents: sandbox them so embedded script can't run.
        headers["Content-Security-Policy"] = (
            "sandbox; default-src 'none'; style-src 'unsafe-inline'"
        )
    return FileResponse(file, media_type=images.MIME[ext], headers=headers)
