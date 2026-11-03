"""Request and response bodies. JSON uses camelCase, matching what the Svelte pages expect."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Role = Literal["editor", "commenter"]


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class PublicUser(Model):
    id: str
    email: str
    username: str
    is_admin: bool
    must_change_password: bool
    created_at: str


class SessionOut(Model):
    id: str
    expires_at: int


class Me(Model):
    user: PublicUser | None
    allow_registration: bool


class LoginRequest(Model):
    email: str = ""
    password: str = ""
    next: str | None = None


class RegisterRequest(Model):
    email: str = ""
    username: str = ""
    password: str = ""
    invite: str | None = None


class AuthResult(Model):
    user: PublicUser
    redirect: str


class AccountInfo(Model):
    user: PublicUser
    owned_projects: list[str]


class AccountUpdate(Model):
    current_password: str = ""
    email: str = ""
    username: str = ""
    password: str = ""
    logout_others: bool = False


class AccountDelete(Model):
    password: str = ""
    confirm: str = ""


class AdminUser(Model):
    id: str
    email: str
    username: str
    is_admin: bool
    disabled: bool
    created_at: str
    owned_projects: int
    shared_projects: int


class AdminOverview(Model):
    users: list[AdminUser]
    current_user_id: str
    registration: Literal["open", "closed", "default"]
    registration_open: bool


class RegistrationUpdate(Model):
    mode: str


class FlagUpdate(Model):
    value: bool


class PasswordResetResult(Model):
    user_id: str
    password: str


class Invite(Model):
    token: str
    project_id: str
    role: Role
    created_at: str
    expires_at: str


class InvitePreview(Model):
    project_id: str
    project_name: str
    role: Role
    already_member: bool


class InviteCreate(Model):
    role: str = ""


class Member(Model):
    id: str
    user_id: str
    email: str
    username: str
    role: Role
    created_at: str


class MemberAdd(Model):
    query: str = ""
    role: str = ""


class MemberRoleUpdate(Model):
    role: str = ""


class ProjectOut(Model):
    id: str
    user_id: str
    name: str
    description: str | None
    created_at: str
    modified_at: str
    pinned: bool
    is_owner: bool


class Preset(Model):
    label: str
    description: str
    available: bool


class ProjectList(Model):
    projects: list[ProjectOut]
    shared_projects: list[ProjectOut]
    presets: dict[str, Preset]


class ProjectCreate(Model):
    name: str = ""
    description: str = ""
    preset: str = "blank"


class ProjectUpdate(Model):
    name: str = ""
    description: str = ""


class ProjectDelete(Model):
    confirm_name: str = ""


class ProjectAccess(Model):
    project: ProjectOut
    role: Literal["owner", "editor", "commenter"]


class SidebarBookmark(Model):
    id: str
    entity_id: str
    entity_name: str
    entity_type: str


class ProjectShell(Model):
    project_name: str
    role: Literal["owner", "editor", "commenter"]
    entity_counts: dict[str, int]
    bookmarks: list[SidebarBookmark]


class PinResult(Model):
    pinned: bool


class Created(Model):
    id: str


class Ok(Model):
    ok: bool = True
