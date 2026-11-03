"""Turn a note into a scene and back, ported from src/lib/server/conversion.ts.

Each step locks on its own: create_entity and update_entity commit, and a commit must not
happen while holding the project lock and then write again (see storage.project_lock).
Before each of them the request's write transaction is opened, so the SQLite lock is taken
before the project lock.
"""

from typing import Any

from sqlmodel import Session

from ..models import Project
from . import stories
from .entities import create_entity, get_entity, update_entity
from .members import project_path


class ConversionError(LookupError):
    pass


def note_to_scene(
    db: Session,
    project: Project,
    note_id: str,
    story_id: str,
    chapter_id: str | None,
    new_chapter_title: str = "",
) -> dict[str, Any] | None:
    """The new scene, or None when the note does not exist."""
    base = project_path(project)
    note = get_entity(project, "note", note_id)
    if note is None:
        return None
    if stories.get_story(base, story_id) is None:
        raise ConversionError("Story not found")
    if chapter_id:
        if stories.get_chapter(base, story_id, chapter_id) is None:
            raise ConversionError("Chapter not found")
    else:
        chapters = stories.list_chapters(base, story_id)
        chapter_id = (
            chapters[0]["id"]
            if chapters
            else stories.create_chapter(base, project.id, story_id, new_chapter_title or "Notes")[
                "id"
            ]
        )

    def text(key: str) -> str | None:
        value = note["frontmatter"].get(key)
        return str(value) if value else None

    scene = stories.create_scene(
        base,
        project.id,
        story_id,
        chapter_id,
        note["name"],
        {"narrator": text("narrator"), "time": text("time"), "place": text("place")},
        note["body"],
    )
    db.connection()
    update_entity(
        db,
        project,
        "note",
        note_id,
        {
            "status": "archived",
            "convertedTo": scene["id"],
            "body": f"---\n_Converted to scene: {scene['id']} in story {story_id}_\n\n---\n\n"
            + note["body"],
        },
        None,
    )
    return scene


def scene_to_note(
    db: Session, project: Project, story_id: str, chapter_id: str, scene_id: str
) -> dict[str, Any] | None:
    """The new note, or None when the scene does not exist."""
    base = project_path(project)
    scene = stories.get_scene(base, story_id, chapter_id, scene_id)
    if scene is None:
        return None
    db.connection()
    note = create_entity(
        db,
        project,
        "note",
        scene["title"] or "Untitled Scene",
        {"convertedFrom": scene_id},
        f"_Converted from scene: {scene_id} in story {story_id}_\n\n---\n\n{scene['body']}",
    )
    stories.update_scene(
        base,
        project.id,
        story_id,
        chapter_id,
        scene_id,
        {},
        f"---\n_Converted to note: {note['id']}_\n\n---\n\n{scene['body']}",
        None,
    )
    return note
