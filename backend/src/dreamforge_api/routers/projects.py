from fastapi import APIRouter, HTTPException

from ..db import Db
from ..deps import Auth, CurrentAuth
from ..models import Project
from ..schemas import (
    Created,
    Invite,
    InviteCreate,
    Member,
    MemberAdd,
    MemberRoleUpdate,
    Ok,
    PinResult,
    ProjectAccess,
    ProjectCreate,
    ProjectDelete,
    ProjectList,
    ProjectShell,
    ProjectUpdate,
)
from ..services import invites, members
from ..services import projects as service

router = APIRouter(prefix="/projects", tags=["projects"])
ROLES = ("editor", "commenter")


def _access(db: Db, project_id: str, auth: Auth) -> tuple[Project, str]:
    access = members.get_project_access(db, project_id, auth.user.id)
    if access is None:
        raise HTTPException(404, "Project not found")
    return access


def _owner(db: Db, project_id: str, auth: Auth, message: str) -> Project:
    project, role = _access(db, project_id, auth)
    if role != "owner":
        raise HTTPException(403, message)
    return project


@router.get("", response_model=ProjectList)
def index(auth: CurrentAuth, db: Db):
    presets = {
        key: {**preset, "available": key in service.PORTED_PRESETS}
        for key, preset in service.PROJECT_PRESETS.items()
    }
    return {**service.list_projects(db, auth.user.id), "presets": presets}


@router.post("", response_model=Created, status_code=201)
def create(body: ProjectCreate, auth: CurrentAuth, db: Db):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if body.preset not in service.PROJECT_PRESETS:
        raise HTTPException(400, "Unknown starter")
    if body.preset not in service.PORTED_PRESETS:
        raise HTTPException(501, "This starter is not available yet. Start with Blank.")
    project = service.create_project(db, auth.user.id, name, body.description.strip())
    return {"id": project.id}


@router.get("/{project_id}", response_model=ProjectAccess)
def show(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    pinned = project_id in service.pinned_project_ids(db, auth.user.id)
    return {"project": service.project_out(project, pinned=pinned, role=role), "role": role}


@router.patch("/{project_id}", response_model=Ok)
def update(project_id: str, body: ProjectUpdate, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth, "Only the project owner can edit project details")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    service.update_project(db, project, name, body.description.strip() or None)
    return {}


@router.delete("/{project_id}", response_model=Ok)
def remove(project_id: str, body: ProjectDelete, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth, "Only the project owner can delete this project")
    if body.confirm_name != project.name:
        raise HTTPException(400, "Project name did not match")
    service.delete_project(db, project)
    return {}


@router.get("/{project_id}/shell", response_model=ProjectShell)
def shell(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    return {**service.sidebar(db, project, auth.user.id), "role": role}


@router.post("/{project_id}/pin", response_model=PinResult)
def pin(project_id: str, auth: CurrentAuth, db: Db):
    _access(db, project_id, auth)
    return {"pinned": service.toggle_pin(db, auth.user.id, project_id)}


@router.get("/{project_id}/members", response_model=list[Member])
def list_members(project_id: str, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the project owner can manage members")
    return members.list_members(db, project_id)


@router.post("/{project_id}/members", response_model=Ok)
def add_member(project_id: str, body: MemberAdd, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the project owner can manage members")
    if not body.query.strip():
        raise HTTPException(400, "Email or username is required")
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    user = members.find_user_for_invite(db, body.query)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.id == auth.user.id:
        raise HTTPException(400, "Cannot add yourself as a member")
    members.add_member(db, project_id, user.id, body.role)  # type: ignore[arg-type]
    return {}


@router.patch("/{project_id}/members/{user_id}", response_model=Ok)
def update_member(project_id: str, user_id: str, body: MemberRoleUpdate, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the project owner can manage members")
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    if not members.update_member_role(db, project_id, user_id, body.role):  # type: ignore[arg-type]
        raise HTTPException(404, "Member not found")
    return {}


@router.delete("/{project_id}/members/{user_id}", response_model=Ok)
def remove_member(project_id: str, user_id: str, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the project owner can manage members")
    members.remove_member(db, project_id, user_id)
    return {}


@router.get("/{project_id}/invites", response_model=list[Invite])
def list_invites(project_id: str, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the owner can manage invites")
    return invites.list_invites(db, project_id)


@router.post("/{project_id}/invites", response_model=Invite, status_code=201)
def create_invite(project_id: str, body: InviteCreate, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the owner can invite people")
    if body.role not in ROLES:
        raise HTTPException(400, "Choose a role")
    return invites.create_invite(db, project_id, auth.user.id, body.role)  # type: ignore[arg-type]


@router.delete("/{project_id}/invites/{token}", response_model=Ok)
def revoke_invite(project_id: str, token: str, auth: CurrentAuth, db: Db):
    _owner(db, project_id, auth, "Only the owner can revoke invites")
    invites.revoke_invite(db, project_id, token)
    return {}
