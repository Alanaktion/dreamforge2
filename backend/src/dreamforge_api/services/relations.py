"""Relations between entities, stored once (source to target) in ``<project>/relations.json``.
Ported from src/lib/server/relations.ts."""

from pathlib import Path
from typing import Any

from ..storage import project_lock, read_json, write_json
from ..utils import generate_id

RELATION_TYPES = (
    "related_to",
    "member_of",
    "leader_of",
    "owns",
    "home",
    "enemy",
    "ally",
    "parent",
    "child",
    "sibling",
    "mentor",
    "student",
    "friend",
    "lover",
    "rival",
    "located_in",
    "part_of",
    "created_by",
    "used_by",
)


def _file(base: Path) -> Path:
    return base / "relations.json"


def load_relations(base: Path) -> list[dict[str, Any]]:
    return read_json(_file(base), [], lambda value: isinstance(value, list))


def save_relations(base: Path, relations: list[dict[str, Any]]) -> None:
    write_json(_file(base), relations)


def add_relation(
    project_id: str,
    base: Path,
    source_id: str,
    target_id: str,
    relation_type: str,
    label: str | None,
) -> dict[str, Any]:
    relation = {
        "id": generate_id(),
        "sourceId": source_id,
        "targetId": target_id,
        "relationType": relation_type,
        "label": label,
    }
    with project_lock(project_id):
        relations = load_relations(base)
        relations.append(relation)
        save_relations(base, relations)
    return relation


def delete_relation(project_id: str, base: Path, relation_id: str) -> bool:
    with project_lock(project_id):
        relations = load_relations(base)
        kept = [r for r in relations if r.get("id") != relation_id]
        if len(kept) == len(relations):
            return False
        save_relations(base, kept)
    return True


def remove_relations_for_entity(base: Path, entity_id: str) -> list[dict[str, Any]]:
    """Remove and return the relations touching ``entity_id``, so a soft delete can stash
    them. Callers hold the project lock."""
    relations = load_relations(base)
    removed = [r for r in relations if entity_id in (r.get("sourceId"), r.get("targetId"))]
    if removed:
        save_relations(base, [r for r in relations if r not in removed])
    return removed


def restore_relations(base: Path, restored: list[dict[str, Any]]) -> None:
    """Re-add stashed relations, skipping ids that already exist. Callers hold the lock."""
    if not restored:
        return
    relations = load_relations(base)
    existing = {r.get("id") for r in relations}
    relations.extend(r for r in restored if isinstance(r, dict) and r.get("id") not in existing)
    save_relations(base, relations)
