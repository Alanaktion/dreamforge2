from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import CurrentAuth, OptionalAuth
from ..schemas import Created, InvitePreview
from ..services.invites import accept_invite, find_invite
from ..services.members import get_project_access

router = APIRouter(prefix="/invites", tags=["invites"])
GONE = "This invite link has expired or was revoked."


@router.get("/{token}", response_model=InvitePreview)
def preview(token: str, db: Db, auth: OptionalAuth):
    found = find_invite(db, token)
    if found is None:
        raise HTTPException(404, GONE)
    invite, project = found
    access = get_project_access(db, project.id, auth.user.id) if auth else None
    already = access is not None and not (access[1] == "commenter" and invite.role == "editor")
    return {
        "project_id": project.id,
        "project_name": project.name,
        "role": invite.role,
        "already_member": already,
    }


@router.post("/{token}/accept", response_model=Created)
def accept(token: str, db: Db, auth: CurrentAuth):
    project_id = accept_invite(db, token, auth.user.id)
    if project_id is None:
        raise HTTPException(410, GONE)
    return {"id": project_id}
