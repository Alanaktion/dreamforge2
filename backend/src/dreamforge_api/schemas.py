"""Request and response bodies. JSON uses camelCase, matching what the Svelte pages expect."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel

Role = Literal["editor", "commenter"]
# scrypt is slow by design; don't let a request hand it megabytes.
Password = Annotated[str, StringConstraints(max_length=1024)]
Text = Annotated[str, StringConstraints(max_length=1000)]


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
    email: Text = ""
    password: Password = ""
    next: str | None = None


class RegisterRequest(Model):
    email: Text = ""
    username: Text = ""
    password: Password = ""
    invite: str | None = None


class AuthResult(Model):
    user: PublicUser
    redirect: str


class AccountInfo(Model):
    user: PublicUser
    owned_projects: list[str]


class AccountUpdate(Model):
    current_password: Password = ""
    email: Text = ""
    username: Text = ""
    password: Password = ""
    logout_others: bool = False


class AccountDelete(Model):
    password: Password = ""
    confirm: Text = ""


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
    query: Text = ""
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
    name: Text = ""
    description: Annotated[str, StringConstraints(max_length=10000)] = ""
    preset: str = "blank"


class ProjectUpdate(Model):
    name: Text = ""
    description: Annotated[str, StringConstraints(max_length=10000)] = ""


class ProjectDelete(Model):
    confirm_name: Text = ""


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


# --- Entities -------------------------------------------------------------------------------

EntityTypeName = Literal[
    "character", "organization", "location", "culture", "species", "item", "note"
]
# A field value as it is stored in frontmatter. Lists are tags (strings).
FieldValue = str | int | float | bool | None | list[Text]
Body = Annotated[str, StringConstraints(max_length=5_000_000)]
Name = Annotated[str, StringConstraints(max_length=1000)]


class EntityOut(Model):
    revision: str
    id: str
    type: str
    name: str
    tags: list[str]
    status: str
    image_path: str | None
    body: str
    frontmatter: dict[str, Any]
    created_at: str
    modified_at: str


class EntitySummary(Model):
    id: str
    type: str
    name: str
    status: str
    tags: list[str]


class CustomFieldOut(Model):
    id: str
    entity_type: str
    key: str
    label: str
    field_type: str
    ref_entity_type: str | None
    placeholder: str | None
    required: bool
    sort_order: int


class EntityList(Model):
    entities: list[EntityOut]
    custom_fields: list[CustomFieldOut]
    # Every entity in the project (from the index), for reference pickers.
    index: list[EntitySummary]
    project_name: str
    role: Literal["owner", "editor", "commenter"]


class Backlink(Model):
    kind: Literal["entity", "scene"]
    id: str
    name: str
    context: str
    href: str
    reason: str


class EntityRelation(Model):
    id: str
    outgoing: bool
    relation_type: str
    label: str | None
    other_id: str
    other_name: str
    other_type: str | None


class EntityDetail(Model):
    entity: EntityOut
    custom_fields: list[CustomFieldOut]
    index: list[EntitySummary]
    bookmarked: bool
    backlinks: list[Backlink]
    relations: list[EntityRelation]
    project_name: str
    project_owner_id: str
    role: Literal["owner", "editor", "commenter"]


class EntityCreate(Model):
    name: Name
    body: Body = ""
    fields: dict[Text, FieldValue] = {}


class EntityUpdate(Model):
    fields: dict[Text, FieldValue] = {}
    body: Body | None = None
    revision: str | None = None
    overwrite: bool = False


class Saved(Model):
    revision: str
    entity: EntityOut


class TrashedEntity(Model):
    id: str
    entity_id: str
    entity_type: str
    name: str
    deleted_at: str
    expires_at: str


class BookmarkResult(Model):
    bookmarked: bool


class RelationCreate(Model):
    source_id: Text
    target_id: Text = ""
    new_name: Name = ""
    new_type: str = ""
    relation_type: str
    label: Text = ""


class CustomFieldCreate(Model):
    entity_type: EntityTypeName
    key: Text
    label: Text
    field_type: str
    ref_entity_type: EntityTypeName | None = None
    placeholder: Text = ""
    required: bool = False


class CommentOut(Model):
    id: str
    target_type: str
    target_id: str
    user_id: str
    username: str
    body: str
    created_at: str
    resolved: bool


class CommentCreate(Model):
    target_type: Text
    target_id: Text
    body: Annotated[str, StringConstraints(max_length=10_000)]


class CommentResolve(Model):
    resolved: bool


class PaletteStory(Model):
    id: str
    title: str


class PaletteScene(Model):
    id: str
    story_id: str
    story_title: str
    chapter_title: str
    title: str


class Palette(Model):
    entities: list[EntitySummary]
    stories: list[PaletteStory]
    scenes: list[PaletteScene]
