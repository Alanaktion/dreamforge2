"""CSV export and import of one entity type, ported from src/lib/server/csv.ts and the
export-csv / import-csv routes.

The browser reads the CSV file, maps its columns to fields and types the values (it has the
field definitions already); the server receives the mapped rows as JSON.
"""

import csv
import io
from typing import Any

from sqlmodel import Session

from ..models import Project
from .entities import (
    ENTITY_STATUSES,
    RESERVED_KEYS,
    create_entity,
    js_str,
    list_entities,
    update_entity,
)

# The built-in fields of each type (key, type), as in src/lib/entityFields.ts.
BUILTIN_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "character": (
        ("age", "text"),
        ("appearance", "textarea"),
        ("virtues", "tags"),
        ("flaws", "tags"),
        ("quirks", "tags"),
        ("traits", "tags"),
        ("interests", "tags"),
        ("motivations", "textarea"),
        ("fears", "textarea"),
        ("falseBelief", "textarea"),
        ("secrets", "textarea"),
        ("voice", "textarea"),
        ("treasuredPossession", "textarea"),
        ("lines", "textarea"),
        ("backstory", "markdown"),
        ("personalityType", "text"),
    ),
    "organization": (("members", "entityRef"), ("leaders", "entityRef"), ("ownership", "tags")),
    "location": (
        ("geology", "textarea"),
        ("ecosystem", "textarea"),
        ("parentLocation", "entityRef"),
        ("landOwnership", "text"),
    ),
    "culture": (
        ("languages", "tags"),
        ("rituals", "textarea"),
        ("values", "textarea"),
        ("mythos", "markdown"),
    ),
    "species": (
        ("biology", "textarea"),
        ("traits", "tags"),
        ("subtypes", "tags"),
        ("influence", "textarea"),
    ),
    "item": (("owner", "entityRef"), ("significance", "textarea"), ("properties", "tags")),
    "note": (),
}
MAX_IMPORT_ROWS = 5000
# A leading =, +, -, @, tab or CR is run as a formula by spreadsheet apps. Names and bodies
# come from any project member, so those cells get a leading quote to force text.
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: Any) -> str:
    """A frontmatter value as the old server's String(value) wrote it."""
    if value is None:
        return ""
    if isinstance(value, list):
        return ",".join("" if v is None else js_str(v) for v in value)
    return js_str(value)


def _escape(value: str) -> str:
    return f"'{value}" if value.startswith(_FORMULA_START) else value


def export_csv(project: Project, entity_type: str, custom_keys: list[str]) -> str:
    """Every entity of the type: id, name, type, tags, status, body, then each field."""
    builtin = [key for key, _ in BUILTIN_FIELDS[entity_type] if key not in custom_keys]
    field_keys = builtin + custom_keys
    entities = list_entities(project, entity_type)
    if not entities:
        return ""
    headers = list(dict.fromkeys(["id", "name", "type", "tags", "status", "body", *field_keys]))
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([_escape(h) for h in headers])
    for entity in entities:
        row: dict[str, str] = {
            "id": entity["id"],
            "name": entity["name"],
            "type": entity_type,
            "tags": ", ".join(entity["tags"]),
            "status": entity["status"],
            "body": entity["body"] or "",
        }
        for key in field_keys:
            row[key] = _cell(entity["frontmatter"].get(key))
        writer.writerow([_escape(row[h]) for h in headers])
    return out.getvalue()


def import_rows(
    db: Session, project: Project, entity_type: str, rows: list[dict[str, Any]]
) -> dict[str, Any]:
    """Create or update one entity per row. A row's ``id`` matches an existing entity
    first, then its name (case-insensitive); otherwise the row creates a new entity.
    Problems are reported per row (counting the header as line 1) and skip only that row."""
    existing = list_entities(project, entity_type)
    by_id = {e["id"]: e for e in existing}
    by_name = {e["name"].lower(): e for e in existing}
    created = updated = 0
    errors: list[str] = []
    for index, row in enumerate(rows):
        line = index + 2
        name = row["name"].strip()
        if not name:
            errors.append(f"Row {line}: missing name")
            continue
        fields = {
            k: v
            for k, v in row["fields"].items()
            if k and k not in RESERVED_KEYS and k not in ("name", "tags", "status")
        }
        if row.get("tags") is not None:
            fields["tags"] = row["tags"]
        status = row.get("status")
        if status:
            if status not in ENTITY_STATUSES:
                errors.append(f"Row {line}: unknown status {status!r}")
                continue
            fields["status"] = status
        match = by_id.get(row["id"]) if row.get("id") else by_name.get(name.lower())
        try:
            if match is not None:
                data: dict[str, Any] = {**fields, "name": name}
                if row.get("body") is not None:
                    data["body"] = row["body"]
                result = update_entity(db, project, entity_type, match["id"], data, None)
                if result is None:
                    raise LookupError("the entity no longer exists")
                updated += 1
            else:
                body = row.get("body") or ""
                result = create_entity(db, project, entity_type, name, fields, body)
                created += 1
            by_id[result["id"]] = result
            by_name[result["name"].lower()] = result
        except Exception as cause:  # one bad row must not stop the rest
            db.rollback()
            errors.append(f"Row {line}: {cause}")
    return {"created": created, "updated": updated, "errors": errors}
