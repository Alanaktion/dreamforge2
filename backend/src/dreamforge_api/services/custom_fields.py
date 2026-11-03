"""Custom field definitions per entity type, ported from src/lib/server/customFields.ts."""

from typing import Any

from sqlalchemy import func
from sqlmodel import Session, col, select

from ..models import CustomFieldDef, Project
from ..utils import generate_id
from .metadata import with_project_metadata

FIELD_TYPES = ("text", "textarea", "number", "tags", "markdown", "entityRef", "boolean", "date")


def field_out(f: CustomFieldDef) -> dict[str, Any]:
    return {
        "id": f.id,
        "entity_type": f.entity_type,
        "key": f.key,
        "label": f.label,
        "field_type": f.field_type,
        "ref_entity_type": f.ref_entity_type,
        "placeholder": f.placeholder,
        "required": bool(f.required),
        "sort_order": f.sort_order,
    }


def get_custom_fields(
    db: Session, project_id: str, entity_type: str | None = None
) -> list[CustomFieldDef]:
    query = select(CustomFieldDef).where(CustomFieldDef.project_id == project_id)
    if entity_type:
        query = query.where(CustomFieldDef.entity_type == entity_type)
    return list(db.exec(query.order_by(col(CustomFieldDef.sort_order))).all())


def add_custom_field(
    db: Session,
    project: Project,
    entity_type: str,
    key: str,
    label: str,
    field_type: str,
    ref_entity_type: str | None,
    placeholder: str | None,
    required: bool,
) -> CustomFieldDef:
    def change() -> CustomFieldDef:
        count = db.exec(
            select(func.count())
            .select_from(CustomFieldDef)
            .where(
                CustomFieldDef.project_id == project.id,
                CustomFieldDef.entity_type == entity_type,
            )
        ).one()
        record = CustomFieldDef(
            id=generate_id(),
            project_id=project.id,
            entity_type=entity_type,
            key=key,
            label=label,
            field_type=field_type,
            ref_entity_type=ref_entity_type or None,
            placeholder=placeholder or None,
            required=required,
            sort_order=count,
        )
        db.add(record)
        return record

    record = with_project_metadata(db, project, change)
    db.refresh(record)
    return record


def delete_custom_field(db: Session, project: Project, field_id: str) -> bool:
    def change() -> bool:
        record = db.exec(
            select(CustomFieldDef).where(
                CustomFieldDef.id == field_id, CustomFieldDef.project_id == project.id
            )
        ).first()
        if record is None:
            return False
        db.delete(record)
        return True

    return with_project_metadata(db, project, change)
