"""Entities and what hangs off them: custom fields, relations, bookmarks, comments, the
command palette, and re-indexing. Ported from legacy/routes/projects/[id]/[type]/** and
legacy/routes/api/projects/[id]/{comments,palette,sync}."""

import json
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import Session

from ..db import Db, get_engine
from ..deps import Auth, CurrentAuth
from ..models import Entity, Project
from ..schemas import (
    BookmarkResult,
    CommentCreate,
    CommentOut,
    CommentResolve,
    Created,
    CustomFieldCreate,
    CustomFieldOut,
    EntityCreate,
    EntityDetail,
    EntityList,
    EntityOut,
    EntityUpdate,
    Ok,
    Palette,
    RelationCreate,
    Saved,
    TrashedEntity,
)
from ..services import bookmarks, comments, custom_fields, members, relations, stories, trash
from ..services import entities as service
from ..services.backlinks import get_backlinks
from ..storage import expected_revision

router = APIRouter(prefix="/projects/{project_id}", tags=["entities"])


def _access(db: Db, project_id: str, auth: Auth) -> tuple[Project, str]:
    access = members.get_project_access(db, project_id, auth.user.id)
    if access is None:
        raise HTTPException(404, "Project not found")
    return access


def _editor(db: Db, project_id: str, auth: Auth) -> Project:
    project, role = _access(db, project_id, auth)
    if role == "commenter":
        raise HTTPException(403, "Insufficient permissions")
    return project


def _type(route: str) -> str:
    entity_type = service.ROUTE_TO_TYPE.get(route)
    if entity_type is None:
        raise HTTPException(404, "Unknown entity type")
    return entity_type


def _summary(row: Entity) -> dict[str, Any]:
    try:
        tags = json.loads(row.tags or "[]")
    except ValueError:
        tags = []
    return {"id": row.id, "type": row.type, "name": row.name, "status": row.status, "tags": tags}


def _index(db: Db, project_id: str) -> list[dict[str, Any]]:
    return [_summary(row) for row in service.entity_index(db, project_id)]


def _fields(db: Db, project_id: str, entity_type: str | None = None) -> list[dict[str, Any]]:
    return [
        custom_fields.field_out(f)
        for f in custom_fields.get_custom_fields(db, project_id, entity_type)
    ]


def _check_fields(fields: dict[str, Any]) -> dict[str, Any]:
    for key in fields:
        if not key or key in service.RESERVED_KEYS:
            raise HTTPException(400, f"Field not allowed: {key or '(empty)'}")
    if "name" in fields and (not isinstance(fields["name"], str) or not fields["name"].strip()):
        raise HTTPException(400, "Name cannot be empty")
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    if "status" in fields and fields["status"] not in service.ENTITY_STATUSES:
        raise HTTPException(400, "Invalid status")
    if "tags" in fields and not isinstance(fields["tags"], list):
        raise HTTPException(400, "Tags must be a list")
    return fields


# --- Entities -------------------------------------------------------------------------------


@router.get("/entities/{route}", response_model=EntityList)
def list_entities(
    project_id: str, route: str, auth: CurrentAuth, db: Db, q: str = "", status: str = ""
):
    entity_type = _type(route)
    project, role = _access(db, project_id, auth)
    # Read from disk even when filtering: index rows have no body, fields or revision.
    items = service.list_entities(project, entity_type)
    if q:
        needle = q.lower()
        items = [e for e in items if needle in e["name"].lower()]
    if status:
        items = [e for e in items if e["status"] == status]
    return {
        "entities": items,
        "custom_fields": _fields(db, project_id, entity_type),
        "index": _index(db, project_id),
        "project_name": project.name,
        "role": role,
    }


@router.post("/entities/{route}", response_model=EntityOut, status_code=201)
def create_entity(project_id: str, route: str, body: EntityCreate, auth: CurrentAuth, db: Db):
    entity_type = _type(route)
    project = _editor(db, project_id, auth)
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    fields = _check_fields({k: v for k, v in body.fields.items() if k != "name"})
    return service.create_entity(db, project, entity_type, name, fields, body.body)


@router.get("/entities/{route}/{entity_id}", response_model=EntityDetail)
def show_entity(project_id: str, route: str, entity_id: str, auth: CurrentAuth, db: Db):
    entity_type = _type(route)
    project, role = _access(db, project_id, auth)
    entity = service.get_entity(project, entity_type, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    index = _index(db, project_id)
    names = {e["id"]: e for e in index}
    # Relations are stored once, source to target; show both directions.
    linked = []
    for r in relations.load_relations(members.project_path(project)):
        if entity_id not in (r.get("sourceId"), r.get("targetId")):
            continue
        outgoing = r.get("sourceId") == entity_id
        other_id = str(r.get("targetId") if outgoing else r.get("sourceId"))
        other = names.get(other_id)
        linked.append(
            {
                "id": str(r.get("id")),
                "outgoing": outgoing,
                "relation_type": str(r.get("relationType")),
                "label": r.get("label"),
                "other_id": other_id,
                "other_name": other["name"] if other else "Unknown entity",
                "other_type": other["type"] if other else None,
            }
        )
    return {
        "entity": entity,
        "custom_fields": _fields(db, project_id, entity_type),
        "index": index,
        "bookmarked": bookmarks.is_bookmarked(db, auth.user.id, project_id, entity_id),
        "backlinks": get_backlinks(project, entity_id, entity["name"]),
        "relations": linked,
        "project_name": project.name,
        "project_owner_id": project.user_id,
        "role": role,
    }


@router.get("/entities/{route}/{entity_id}/content", response_model=EntityOut)
def entity_content(project_id: str, route: str, entity_id: str, auth: CurrentAuth, db: Db):
    """Just the file: fields, body and revision, without the page's extras."""
    entity_type = _type(route)
    project, _role = _access(db, project_id, auth)
    entity = service.get_entity(project, entity_type, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return entity


@router.patch("/entities/{route}/{entity_id}", response_model=Saved)
def update_entity(
    project_id: str, route: str, entity_id: str, body: EntityUpdate, auth: CurrentAuth, db: Db
):
    entity_type = _type(route)
    project = _editor(db, project_id, auth)
    data = _check_fields(dict(body.fields))
    if body.body is not None:
        data["body"] = body.body
    updated = service.update_entity(
        db, project, entity_type, entity_id, data, expected_revision(body.revision, body.overwrite)
    )
    if updated is None:
        raise HTTPException(404, "Entity not found")
    return {"revision": updated["revision"], "entity": updated}


@router.delete("/entities/{route}/{entity_id}", response_model=TrashedEntity)
def delete_entity(project_id: str, route: str, entity_id: str, auth: CurrentAuth, db: Db):
    entity_type = _type(route)
    project = _editor(db, project_id, auth)
    item = trash.soft_delete_entity(db, project, entity_type, entity_id)
    if item is None:
        raise HTTPException(404, "Entity not found")
    return item


@router.post("/entities/{route}/{entity_id}/duplicate", response_model=EntityOut, status_code=201)
def duplicate_entity(project_id: str, route: str, entity_id: str, auth: CurrentAuth, db: Db):
    entity_type = _type(route)
    project = _editor(db, project_id, auth)
    copy = service.duplicate_entity(db, project, entity_type, entity_id)
    if copy is None:
        raise HTTPException(404, "Entity not found")
    return copy


@router.post("/entities/{route}/{entity_id}/bookmark", response_model=BookmarkResult)
def toggle_bookmark(project_id: str, route: str, entity_id: str, auth: CurrentAuth, db: Db):
    _type(route)
    project, _role = _access(db, project_id, auth)
    return {"bookmarked": bookmarks.toggle_bookmark(db, auth.user.id, project, entity_id)}


# --- Relations ------------------------------------------------------------------------------


@router.post("/relations", response_model=Created, status_code=201)
def add_relation(project_id: str, body: RelationCreate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    target_id = body.target_id
    new_name = body.new_name.strip()
    if not target_id and not new_name:
        raise HTTPException(400, "Pick an entity to relate to")
    if target_id == body.source_id:
        raise HTTPException(400, "An entity cannot relate to itself")
    if body.relation_type not in relations.RELATION_TYPES:
        raise HTTPException(400, "Unknown relation type")
    if not target_id and body.new_type not in service.ENTITY_DIRS:
        raise HTTPException(400, "Unknown type")
    # Before creating anything, so a bad request leaves no orphan entity behind.
    known = {row.id for row in service.entity_index(db, project_id)}
    if body.source_id not in known or (target_id and target_id not in known):
        raise HTTPException(404, "Entity not found")
    if not target_id:
        target_id = service.create_entity(db, project, body.new_type, new_name)["id"]
    relation = relations.add_relation(
        project.id,
        members.project_path(project),
        body.source_id,
        target_id,
        body.relation_type,
        body.label.strip() or None,
    )
    return {"id": relation["id"]}


@router.delete("/relations/{relation_id}", response_model=Ok)
def delete_relation(project_id: str, relation_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    relations.delete_relation(project.id, members.project_path(project), relation_id)
    return {}


# --- Custom fields --------------------------------------------------------------------------


@router.get("/fields", response_model=list[CustomFieldOut])
def list_fields(project_id: str, auth: CurrentAuth, db: Db):
    _access(db, project_id, auth)
    return _fields(db, project_id)


def _owner(db: Db, project_id: str, auth: Auth) -> Project:
    project, role = _access(db, project_id, auth)
    if role != "owner":
        raise HTTPException(403, "Only the project owner can manage fields")
    return project


@router.post("/fields", response_model=CustomFieldOut, status_code=201)
def add_field(project_id: str, body: CustomFieldCreate, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth)
    key, label = body.key.strip(), body.label.strip()
    if not key or not label:
        raise HTTPException(400, "Key and label are required")
    if key in service.RESERVED_KEYS or key in ("name", "status", "tags"):
        raise HTTPException(400, "That key is used by every entity. Choose another.")
    if body.field_type not in custom_fields.FIELD_TYPES:
        raise HTTPException(400, "Invalid field type")
    record = custom_fields.add_custom_field(
        db,
        project,
        body.entity_type,
        key,
        label,
        body.field_type,
        body.ref_entity_type if body.field_type == "entityRef" else None,
        body.placeholder.strip(),
        body.required,
    )
    return custom_fields.field_out(record)


@router.delete("/fields/{field_id}", response_model=Ok)
def delete_field(project_id: str, field_id: str, auth: CurrentAuth, db: Db):
    project = _owner(db, project_id, auth)
    if not custom_fields.delete_custom_field(db, project, field_id):
        raise HTTPException(404, "Field not found")
    return {}


# --- Comments -------------------------------------------------------------------------------


@router.get("/comments", response_model=list[CommentOut])
def list_comments(
    project_id: str,
    target_type: Annotated[str, Query(alias="targetType")],
    target_id: Annotated[str, Query(alias="targetId")],
    auth: CurrentAuth,
    db: Db,
):
    _access(db, project_id, auth)
    return comments.get_comments(db, project_id, target_type, target_id)


@router.post("/comments", response_model=CommentOut, status_code=201)
def add_comment(project_id: str, body: CommentCreate, auth: CurrentAuth, db: Db):
    project, _role = _access(db, project_id, auth)
    text = body.body.strip()
    if not body.target_type or not body.target_id or not text:
        raise HTTPException(400, "A comment needs a target and some text")
    return comments.create_comment(db, project, body.target_type, body.target_id, auth.user, text)


@router.patch("/comments/{comment_id}", response_model=Ok)
def resolve_comment(
    project_id: str, comment_id: str, body: CommentResolve, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    if not comments.resolve_comment(db, project, comment_id, body.resolved):
        raise HTTPException(404, "Comment not found")
    return {}


@router.delete("/comments/{comment_id}", response_model=Ok)
def delete_comment(project_id: str, comment_id: str, auth: CurrentAuth, db: Db):
    project, _role = _access(db, project_id, auth)
    if not comments.delete_comment(db, project, comment_id, auth.user.id):
        raise HTTPException(403, "Cannot delete this comment")
    return {}


# --- Palette and re-indexing ----------------------------------------------------------------


@router.get("/palette", response_model=Palette)
def palette(project_id: str, auth: CurrentAuth, db: Db):
    project, _role = _access(db, project_id, auth)
    base = members.project_path(project)
    story_list, scene_list = [], []
    for story in stories.list_stories(base):
        title = str(story.get("title") or "")
        story_list.append({"id": story["id"], "title": title})
        for chapter in stories.list_chapters(base, story["id"]):
            for i, scene in enumerate(stories.list_scenes(base, story["id"], chapter["id"])):
                scene_list.append(
                    {
                        "id": scene["id"],
                        "story_id": story["id"],
                        "story_title": title,
                        "chapter_title": chapter["title"],
                        "title": scene["title"] or f"Scene {i + 1}",
                    }
                )
    return {"entities": _index(db, project_id), "stories": story_list, "scenes": scene_list}


def reindex(project_id: str) -> None:
    """Rebuild the index in a write transaction of its own, so GET requests can call it."""
    with Session(get_engine(write=True)) as writer:
        writer.connection()  # BEGIN IMMEDIATE now, before scan_project takes the project lock
        project = writer.get(Project, project_id)
        if project is not None:
            service.scan_project(writer, project)


@router.post("/sync", response_model=Ok)
def sync(project_id: str, auth: CurrentAuth, db: Db):
    _editor(db, project_id, auth)
    db.rollback()  # release this request's write lock; reindex takes its own
    reindex(project_id)
    return {}
