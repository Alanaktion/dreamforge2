"""Project search and the relations page. Ported from legacy/routes/projects/[id]/search
and legacy/routes/projects/[id]/relations (the relation writes are in routers/entities.py)."""

from typing import Annotated

from fastapi import APIRouter, Query

from ..db import Db
from ..deps import CurrentAuth
from ..schemas import RelationsPage, SearchPage
from ..services import entities, members, relations, search
from .entities import _access, _index

router = APIRouter(prefix="/projects/{project_id}", tags=["search"])


@router.get("/search", response_model=SearchPage)
def search_project(
    project_id: str,
    auth: CurrentAuth,
    db: Db,
    q: Annotated[str, Query(max_length=200)] = "",
    kind: str = "",
    type: str = "",
):
    project, role = _access(db, project_id, auth)
    kind = kind if kind in ("entity", "scene") else ""
    entity_type = entities.ROUTE_TO_TYPE.get(type)
    return {
        "query": q,
        "kind": kind,
        "type": type if entity_type else "",
        "results": search.search(project, q, kind or None, entity_type),
        "project_name": project.name,
        "role": role,
    }


@router.get("/relations", response_model=RelationsPage)
def relations_page(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    rows = [
        {
            "id": str(r.get("id") or ""),
            "source_id": str(r.get("sourceId") or ""),
            "target_id": str(r.get("targetId") or ""),
            "relation_type": str(r.get("relationType") or ""),
            "label": r.get("label") if isinstance(r.get("label"), str) else None,
        }
        for r in relations.load_relations(members.project_path(project))
        if isinstance(r, dict)
    ]
    return {
        "relations": rows,
        "entities": _index(db, project.id),
        "project_name": project.name,
        "role": role,
    }
