"""Stories, chapters and scenes, the manuscript export, and converting notes to scenes and
back. Ported from legacy/routes/projects/[id]/stories/** and the convertToScene action of
the entity page."""

from datetime import datetime
from html import escape
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlmodel import select

from ..db import Db
from ..deps import CurrentAuth
from ..models import ProjectImage
from ..schemas import (
    ChapterCreate,
    ChapterOut,
    ConvertTarget,
    ConvertToScene,
    NoteCreated,
    Ok,
    Reorder,
    SceneCreated,
    SceneOut,
    SceneSaved,
    SceneUpdate,
    StoryCreate,
    StoryCreated,
    StoryDetail,
    StoryList,
    StoryOut,
    StoryTarget,
    StoryUpdate,
    TrashedEntity,
)
from ..services import conversion, members, plots, stories, trash, writing
from ..services.render import render_markdown
from ..storage import StorageError, expected_revision
from ..utils import is_safe_path_segment
from .entities import _access, _editor, _index

router = APIRouter(prefix="/projects/{project_id}", tags=["stories"])


def _ids(*ids: str) -> None:
    if not all(is_safe_path_segment(i) for i in ids):
        raise HTTPException(400, "Invalid id")


def _story(base, story_id: str) -> dict[str, Any]:
    story = stories.get_story(base, story_id)
    if story is None:
        raise HTTPException(404, "Story not found")
    return story


def _chapter(base, story_id: str, chapter_id: str) -> dict[str, Any]:
    _story(base, story_id)
    chapter = stories.get_chapter(base, story_id, chapter_id)
    if chapter is None:
        raise HTTPException(404, "Chapter not found")
    return chapter


# --- Stories --------------------------------------------------------------------------------


@router.get("/stories", response_model=StoryList)
def list_stories(project_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    base = members.project_path(project)
    result = []
    for story in stories.list_stories(base):
        tree = stories.story_tree(base, story["id"])
        result.append(
            {
                **story,
                "chapter_count": len(tree),
                "scene_count": sum(len(c["scenes"]) for c in tree),
                "word_count": sum(
                    writing.count_words(s["body"]) for c in tree for s in c["scenes"]
                ),
            }
        )
    try:
        targets = writing.read_log(base)["storyTargets"]
    except StorageError:
        targets = {}  # an unreadable log only hides the targets
    return {"stories": result, "story_targets": targets, "project_name": project.name, "role": role}


@router.post("/stories", response_model=StoryCreated, status_code=201)
def create_story(project_id: str, body: StoryCreate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    base = members.project_path(project)
    story = stories.create_story(base, project.id, title, body.description.strip() or None)
    chapter = stories.create_chapter(base, project.id, story["id"], "Chapter 1")
    scene = stories.create_scene(base, project.id, story["id"], chapter["id"])
    return {"story_id": story["id"], "chapter_id": chapter["id"], "scene_id": scene["id"]}


@router.get("/stories/{story_id}", response_model=StoryDetail)
def show_story(project_id: str, story_id: str, auth: CurrentAuth, db: Db):
    project, role = _access(db, project_id, auth)
    _ids(story_id)
    base = members.project_path(project)
    story = _story(base, story_id)
    images = db.exec(select(ProjectImage).where(ProjectImage.project_id == project_id)).all()
    return {
        "story": story,
        "chapters": stories.story_tree(base, story_id),
        "entities": _index(db, project_id),
        "images": images,
        "plotlines": plots.list_plotlines(base, project_id, story_id),
        "project_name": project.name,
        "role": role,
    }


@router.patch("/stories/{story_id}", response_model=StoryOut)
def update_story(project_id: str, story_id: str, body: StoryUpdate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    base = members.project_path(project)
    description = body.description
    if description is None:
        description = _story(base, story_id)["description"]
    story = stories.update_story(
        base, project.id, story_id, title, (description or "").strip() or None
    )
    if story is None:
        raise HTTPException(404, "Story not found")
    return story


@router.put("/stories/{story_id}/target", response_model=Ok)
def set_target(project_id: str, story_id: str, body: StoryTarget, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id)
    if not body.target >= 0 or body.target == float("inf"):
        raise HTTPException(400, "Invalid target")
    writing.set_story_target(members.project_path(project), project.id, story_id, body.target)
    return {}


@router.delete("/stories/{story_id}", response_model=TrashedEntity)
def delete_story(project_id: str, story_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id)
    item = trash.soft_delete_story(db, project, story_id)
    if item is None:
        raise HTTPException(404, "Story not found")
    return item


# --- Chapters -------------------------------------------------------------------------------


@router.post("/stories/{story_id}/chapters", response_model=ChapterOut, status_code=201)
def create_chapter(project_id: str, story_id: str, body: ChapterCreate, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    base = members.project_path(project)
    _story(base, story_id)
    return stories.create_chapter(base, project.id, story_id, title)


@router.put("/stories/{story_id}/chapters/order", response_model=Ok)
def reorder_chapters(project_id: str, story_id: str, body: Reorder, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id, *body.ids)
    base = members.project_path(project)
    _story(base, story_id)
    stories.reorder_chapters(base, project.id, story_id, body.ids)
    return {}


@router.patch("/stories/{story_id}/chapters/{chapter_id}", response_model=ChapterOut)
def rename_chapter(
    project_id: str, story_id: str, chapter_id: str, body: ChapterCreate, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title is required")
    chapter = stories.update_chapter(
        members.project_path(project), project.id, story_id, chapter_id, title
    )
    if chapter is None:
        raise HTTPException(404, "Chapter not found")
    return chapter


@router.delete("/stories/{story_id}/chapters/{chapter_id}", response_model=TrashedEntity)
def delete_chapter(project_id: str, story_id: str, chapter_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id)
    item = trash.soft_delete_chapter(db, project, story_id, chapter_id)
    if item is None:
        raise HTTPException(404, "Chapter not found")
    return item


# --- Scenes ---------------------------------------------------------------------------------


@router.post(
    "/stories/{story_id}/chapters/{chapter_id}/scenes", response_model=SceneOut, status_code=201
)
def create_scene(project_id: str, story_id: str, chapter_id: str, auth: CurrentAuth, db: Db):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id)
    base = members.project_path(project)
    _chapter(base, story_id, chapter_id)
    try:
        return stories.create_scene(base, project.id, story_id, chapter_id)
    except FileNotFoundError as err:  # the chapter went away in the meantime
        raise HTTPException(404, "Chapter not found") from err


@router.put("/stories/{story_id}/chapters/{chapter_id}/scenes/order", response_model=Ok)
def reorder_scenes(
    project_id: str, story_id: str, chapter_id: str, body: Reorder, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id, *body.ids)
    base = members.project_path(project)
    _chapter(base, story_id, chapter_id)
    stories.reorder_scenes(base, project.id, story_id, chapter_id, body.ids)
    return {}


@router.patch(
    "/stories/{story_id}/chapters/{chapter_id}/scenes/{scene_id}", response_model=SceneSaved
)
def update_scene(
    project_id: str,
    story_id: str,
    chapter_id: str,
    scene_id: str,
    body: SceneUpdate,
    auth: CurrentAuth,
    db: Db,
):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id, scene_id)
    base = members.project_path(project)
    changes = body.model_dump(exclude_unset=True, include=set(stories.SCENE_FIELDS), by_alias=False)
    result = stories.update_scene(
        base,
        project.id,
        story_id,
        chapter_id,
        scene_id,
        changes,
        body.body,
        expected_revision(body.revision, body.overwrite),
    )
    if result is None:
        raise HTTPException(404, "Scene not found")
    before, after = result
    warning = ""
    try:
        delta = writing.count_words(after["body"]) - writing.count_words(before["body"])
        writing.record_words(base, project.id, delta)
    except StorageError as err:
        warning = f"Scene saved, but writing progress could not be updated: {err}"
    return {"revision": after["revision"], "scene": after, "warning": warning}


@router.delete(
    "/stories/{story_id}/chapters/{chapter_id}/scenes/{scene_id}", response_model=TrashedEntity
)
def delete_scene(
    project_id: str, story_id: str, chapter_id: str, scene_id: str, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id, scene_id)
    item = trash.soft_delete_scene(db, project, story_id, chapter_id, scene_id)
    if item is None:
        raise HTTPException(404, "Scene not found")
    return item


@router.post(
    "/stories/{story_id}/chapters/{chapter_id}/scenes/{scene_id}/convert-to-note",
    response_model=NoteCreated,
    status_code=201,
)
def convert_to_note(
    project_id: str, story_id: str, chapter_id: str, scene_id: str, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    _ids(story_id, chapter_id, scene_id)
    note = conversion.scene_to_note(db, project, story_id, chapter_id, scene_id)
    if note is None:
        raise HTTPException(404, "Scene not found")
    return {"note_id": note["id"]}


@router.get("/convert-targets", response_model=list[ConvertTarget])
def convert_targets(project_id: str, auth: CurrentAuth, db: Db):
    """Stories and their chapters, for the entity page's Convert to Scene form."""
    project, _role = _access(db, project_id, auth)
    base = members.project_path(project)
    return [
        {**story, "chapters": stories.list_chapters(base, story["id"])}
        for story in stories.list_stories(base)
    ]


@router.post(
    "/entities/notes/{note_id}/convert-to-scene", response_model=SceneCreated, status_code=201
)
def convert_to_scene(
    project_id: str, note_id: str, body: ConvertToScene, auth: CurrentAuth, db: Db
):
    project = _editor(db, project_id, auth)
    _ids(body.story_id, *([body.chapter_id] if body.chapter_id else []))
    try:
        scene = conversion.note_to_scene(
            db,
            project,
            note_id,
            body.story_id,
            body.chapter_id,
            body.new_chapter_title.strip(),
        )
    except conversion.ConversionError as err:
        raise HTTPException(404, str(err)) from err
    if scene is None:
        raise HTTPException(404, "Note not found")
    return {"story_id": body.story_id, "scene_id": scene["id"]}


# --- Export ---------------------------------------------------------------------------------

EXPORT_STYLE = """
  @page { size: letter; margin: 1in; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6;
    color: #1a1a1a; }
  .title-page { text-align: center; padding-top: 30vh; page-break-after: always; }
  .story-title { font-size: 24pt; margin-bottom: 0.5em; }
  .subtitle { font-size: 14pt; color: #555; }
  .author { font-size: 14pt; margin-top: 2em; }
  .date { font-size: 11pt; color: #777; margin-top: 0.5em; }
  .toc { page-break-after: always; }
  .toc h2 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 0.3em; }
  .toc ol { list-style: none; padding: 0; }
  .toc-chapter { font-weight: bold; margin-top: 0.8em; }
  .toc-scene { font-weight: normal; padding-left: 1.5em; font-size: 11pt; color: #444; }
  h2.chapter-title { font-size: 18pt; border-bottom: 2px solid #1a1a1a; padding-bottom: 0.3em;
    margin-top: 1.5em; }
  .scene { margin-top: 1.2em; }
  .scene-title { font-size: 14pt; font-style: italic; margin-bottom: 0.3em; }
  .scene-meta { font-size: 10pt; color: #666; margin-bottom: 0.8em; }
  .scene-body { text-indent: 1.5em; }
  .scene-body p { margin: 0.5em 0; }
  .scene-delimiter { text-align: center; color: #999; margin: 1.5em 0; font-size: 11pt; }
  @media screen { body { max-width: 700px; margin: 2em auto; padding: 0 1em; } }
"""


def _scene_html(
    scene: dict[str, Any], index: int, titles: bool, meta: bool, delimiter: str, last: bool
) -> str:
    parts = []
    if titles:
        parts.append(
            f'<h3 class="scene-title">{escape(scene["title"] or f"Scene {index + 1}")}</h3>'
        )
    details = [
        f"{label}: {escape(scene[key])}"
        for key, label in (("narrator", "Narrator"), ("time", "Time"), ("place", "Place"))
        if scene[key]
    ]
    if meta and details:
        parts.append(f'<p class="scene-meta">{" &middot; ".join(details)}</p>')
    parts.append(
        f'<div class="scene-body">{render_markdown(scene["body"]) or "<p>(empty)</p>"}</div>'
    )
    if delimiter and not last:
        parts.append(f'<p class="scene-delimiter">{escape(delimiter)}</p>')
    return f'<div class="scene">{"".join(parts)}</div>'


@router.get("/stories/{story_id}/export", response_class=HTMLResponse)
def export_story(
    project_id: str,
    story_id: str,
    auth: CurrentAuth,
    db: Db,
    title_page: bool = Query(True, alias="titlePage"),
    toc: bool = True,
    title_format: str = Query("chapter", alias="titleFormat"),
    author: str = "",
    scene_titles: bool = Query(True, alias="sceneTitles"),
    scene_meta: bool = Query(True, alias="sceneMeta"),
    delimiter: str = "* * *",
):
    """The manuscript as one printable HTML page."""
    project, _role = _access(db, project_id, auth)
    _ids(story_id)
    base = members.project_path(project)
    story = _story(base, story_id)
    chapters = stories.story_tree(base, story_id)

    html = [
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">',
        f"<title>{escape(story['title'])}</title>\n<style>{EXPORT_STYLE}</style>\n</head>\n<body>",
    ]
    if title_page:
        today = datetime.now()
        html.append(
            '<div class="title-page">'
            f'<h1 class="story-title">{escape(story["title"])}</h1>'
            + (
                f'<p class="subtitle">{escape(story["description"])}</p>'
                if story["description"]
                else ""
            )
            + (f'<p class="author">by {escape(author)}</p>' if author else "")
            + f'<p class="date">{today:%B} {today.day}, {today.year}</p></div>'
        )
    if toc:
        items = "".join(
            f'<li class="toc-chapter">Chapter {i + 1}: {escape(ch["title"])}<ol>'
            + "".join(
                f'<li class="toc-scene">Scene {j + 1}: {escape(s["title"] or "Untitled")}</li>'
                for j, s in enumerate(ch["scenes"])
            )
            + "</ol></li>"
            for i, ch in enumerate(chapters)
        )
        html.append(f'<div class="toc"><h2>Table of Contents</h2><ol>{items}</ol></div>')
    for i, chapter in enumerate(chapters):
        heading = f"Chapter {i + 1}" if title_format == "number" else escape(chapter["title"])
        html.append(f'<h2 class="chapter-title">{heading}</h2>')
        count = len(chapter["scenes"])
        for j, scene in enumerate(chapter["scenes"]):
            html.append(_scene_html(scene, j, scene_titles, scene_meta, delimiter, j == count - 1))
    html.append("</body>\n</html>")

    filename = "".join(
        c if c.isascii() and (c.isalnum() or c in " _-") else "_" for c in story["title"]
    )
    return HTMLResponse(
        "\n".join(html),
        headers={
            "Content-Disposition": f'inline; filename="{filename.strip() or "story"}-export.html"'
        },
    )
