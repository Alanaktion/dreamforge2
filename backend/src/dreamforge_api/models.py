"""SQLModel tables, mirroring the existing SQLite schema (see migrate.py for the DDL).

The models are a query layer only: the schema is created and changed by the hand-written
migrations, never by ``SQLModel.metadata.create_all``, so constraints such as the
``lower(email)`` unique index and role CHECKs stay exactly as the migrations define them.
"""

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(primary_key=True)
    email: str
    username: str
    password_hash: str
    must_change_password: bool = False
    is_admin: bool = False
    disabled: bool = False
    created_at: str


class Session(SQLModel, table=True):
    __tablename__ = "sessions"
    id: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="users.id")
    expires_at: int


class Project(SQLModel, table=True):
    __tablename__ = "projects"
    id: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="users.id")
    name: str
    description: str | None = None
    data_path: str
    pinned: bool = False  # legacy; per-user pins live in project_pins
    created_at: str
    modified_at: str


class Entity(SQLModel, table=True):
    __tablename__ = "entities"
    id: str = Field(primary_key=True)
    project_id: str = Field(primary_key=True, foreign_key="projects.id")
    type: str
    name: str
    slug: str | None = None
    tags: str | None = "[]"  # JSON array
    status: str = "draft"
    image_path: str | None = None
    created_at: str
    modified_at: str


class Bookmark(SQLModel, table=True):
    __tablename__ = "bookmarks"
    id: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="users.id")
    project_id: str = Field(foreign_key="projects.id")
    entity_id: str
    created_at: str


class TrashItem(SQLModel, table=True):
    __tablename__ = "trash_items"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    entity_id: str
    entity_type: str
    original_path: str
    deleted_at: str
    expires_at: str
    kind: str = "entity"
    metadata_: str | None = Field(default=None, sa_column_kwargs={"name": "metadata"})


class ProjectImage(SQLModel, table=True):
    __tablename__ = "project_images"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    filename: str
    original_name: str
    mime_type: str
    size: int
    caption: str | None = None
    alt_text: str | None = None
    created_at: str


class ImageEntityLink(SQLModel, table=True):
    __tablename__ = "image_entity_links"
    id: str = Field(primary_key=True)
    image_id: str = Field(foreign_key="project_images.id")
    entity_id: str
    project_id: str = Field(foreign_key="projects.id")


class CustomFieldDef(SQLModel, table=True):
    __tablename__ = "custom_field_defs"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    entity_type: str
    key: str
    label: str
    field_type: str
    ref_entity_type: str | None = None
    placeholder: str | None = None
    required: bool = False
    sort_order: int = 0


class ProjectMember(SQLModel, table=True):
    __tablename__ = "project_members"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    user_id: str = Field(foreign_key="users.id")
    role: str  # 'editor' | 'commenter'
    created_at: str


class Comment(SQLModel, table=True):
    __tablename__ = "comments"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    target_type: str
    target_id: str
    user_id: str = Field(foreign_key="users.id")
    body: str
    created_at: str
    resolved: bool = False


class InstanceSetting(SQLModel, table=True):
    __tablename__ = "instance_settings"
    key: str = Field(primary_key=True)
    value: str


class ProjectPin(SQLModel, table=True):
    __tablename__ = "project_pins"
    user_id: str = Field(primary_key=True, foreign_key="users.id")
    project_id: str = Field(primary_key=True, foreign_key="projects.id")
    created_at: str


class ProjectInvite(SQLModel, table=True):
    __tablename__ = "project_invites"
    token: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    role: str
    created_by: str = Field(foreign_key="users.id")
    created_at: str
    expires_at: str
    revoked: bool = False
