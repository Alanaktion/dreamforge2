import json
from datetime import date

from test_entities import folder, new_entity
from test_projects import create

from dreamforge_api.markdown import parse_markdown
from dreamforge_api.services import writing


def new_story(client, project_id, title="Saga", description=""):
    res = client.post(
        f"/api/projects/{project_id}/stories", json={"title": title, "description": description}
    )
    assert res.status_code == 201, res.text
    return res.json()


def story_url(project_id, story_id):
    return f"/api/projects/{project_id}/stories/{story_id}"


def test_create_story_writes_old_layout(admin, env):
    project_id = create(admin)
    created = new_story(admin, project_id, description="An epic")
    base = folder(env, project_id) / "stories" / created["storyId"]
    meta = json.loads((base / "story.json").read_text())
    assert meta["title"] == "Saga" and meta["description"] == "An epic"
    assert meta["sortOrder"] == 0 and meta["projectId"] == project_id
    chapter = base / "chapters" / created["chapterId"]
    frontmatter, _ = parse_markdown((chapter / "chapter.md").read_text())
    assert frontmatter["title"] == "Chapter 1" and frontmatter["storyId"] == created["storyId"]
    scene_text = (chapter / "scenes" / f"{created['sceneId']}.md").read_text()
    frontmatter, body = parse_markdown(scene_text)
    assert list(frontmatter)[:4] == ["id", "chapterId", "title", "status"]
    assert frontmatter["status"] == "draft" and frontmatter["participants"] == []
    assert body == ""

    detail = admin.get(story_url(project_id, created["storyId"])).json()
    assert detail["story"]["title"] == "Saga"
    [chapter_out] = detail["chapters"]
    assert chapter_out["title"] == "Chapter 1"
    assert [s["id"] for s in chapter_out["scenes"]] == [created["sceneId"]]
    assert chapter_out["scenes"][0]["revision"]

    listing = admin.get(f"/api/projects/{project_id}/stories").json()
    assert listing["stories"][0]["chapterCount"] == 1
    assert listing["stories"][0]["sceneCount"] == 1
    assert admin.get(story_url(project_id, "nope")).status_code == 404
    assert admin.post(f"/api/projects/{project_id}/stories", json={"title": " "}).status_code == 400


def test_scene_save_counts_words_and_detects_conflicts(admin, env):
    project_id = create(admin)
    created = new_story(admin, project_id)
    url = (
        f"{story_url(project_id, created['storyId'])}/chapters/{created['chapterId']}"
        f"/scenes/{created['sceneId']}"
    )
    scene = admin.get(story_url(project_id, created["storyId"])).json()["chapters"][0]["scenes"][0]
    saved = admin.patch(
        url,
        json={
            "title": "Opening",
            "status": "revised",
            "participants": ["Ana", "Bo"],
            "body": "One **two** three.",
            "revision": scene["revision"],
        },
    )
    assert saved.status_code == 200, saved.text
    result = saved.json()
    assert result["scene"]["title"] == "Opening" and result["scene"]["status"] == "revised"
    assert result["warning"] == ""

    stale = admin.patch(url, json={"body": "lost", "revision": scene["revision"]})
    assert stale.status_code == 409
    assert admin.patch(url, json={"status": "bogus", "overwrite": True}).status_code == 422

    trimmed = admin.patch(url, json={"body": "One", "revision": result["revision"]})
    assert trimmed.status_code == 200
    log = json.loads((folder(env, project_id) / "writing-log.json").read_text())
    # +3 then -2: net progress for the day.
    assert log["days"] == {writing.day_key(): 1}

    frontmatter, body = parse_markdown(
        (
            folder(env, project_id)
            / "stories"
            / created["storyId"]
            / "chapters"
            / created["chapterId"]
            / "scenes"
            / f"{created['sceneId']}.md"
        ).read_text()
    )
    assert frontmatter["participants"] == ["Ana", "Bo"] and body == "One"


def test_word_count_matches_the_old_counter():
    assert writing.count_words("") == 0
    assert writing.count_words("Hello, *world*! It's [@Ana](mention://character/1) here.") == 5
    assert writing.count_words("<p>one</p>\n```\ncode block\n```\n- two\n# three") == 3
    assert writing.count_words("naïve café 2024 well-known") == 4


def test_record_words_never_goes_negative(tmp_path):
    writing.record_words(tmp_path, "p", 5, date(2026, 1, 2))
    writing.record_words(tmp_path, "p", -50, date(2026, 1, 2))
    writing.record_words(tmp_path, "p", 7, date(2026, 1, 3))
    assert writing.read_log(tmp_path)["days"] == {"2026-01-02": 0, "2026-01-03": 7}


def test_chapters_and_scenes_reorder_and_rename(admin):
    project_id = create(admin)
    created = new_story(admin, project_id)
    base = story_url(project_id, created["storyId"])
    second = admin.post(f"{base}/chapters", json={"title": "Two"}).json()
    order = admin.put(f"{base}/chapters/order", json={"ids": [second["id"], created["chapterId"]]})
    assert order.status_code == 200
    renamed = admin.patch(f"{base}/chapters/{second['id']}", json={"title": "Prologue"})
    assert renamed.json()["title"] == "Prologue"
    scene_b = admin.post(f"{base}/chapters/{created['chapterId']}/scenes").json()
    admin.put(
        f"{base}/chapters/{created['chapterId']}/scenes/order",
        json={"ids": [scene_b["id"], created["sceneId"]]},
    )
    chapters = admin.get(base).json()["chapters"]
    assert [c["title"] for c in chapters] == ["Prologue", "Chapter 1"]
    assert [s["id"] for s in chapters[1]["scenes"]] == [scene_b["id"], created["sceneId"]]
    assert admin.put(f"{base}/chapters/order", json={"ids": ["../x"]}).status_code == 400
    assert admin.post(f"{base}/chapters/missing/scenes").status_code == 404


def test_story_target_and_rename(admin):
    project_id = create(admin)
    created = new_story(admin, project_id)
    base = story_url(project_id, created["storyId"])
    assert admin.put(f"{base}/target", json={"target": 50000}).status_code == 200
    listing = admin.get(f"/api/projects/{project_id}/stories").json()
    assert listing["storyTargets"] == {created["storyId"]: 50000}
    assert admin.put(f"{base}/target", json={"target": -1}).status_code == 400
    admin.put(f"{base}/target", json={"target": 0})
    assert admin.get(f"/api/projects/{project_id}/stories").json()["storyTargets"] == {}
    renamed = admin.patch(base, json={"title": "Epic", "description": "Long"})
    assert renamed.json()["title"] == "Epic" and renamed.json()["description"] == "Long"
    kept = admin.patch(base, json={"title": "Epic 2"}).json()
    assert kept["description"] == "Long"


def test_trash_story_chapter_scene_and_restore_order(admin, env):
    project_id = create(admin)
    created = new_story(admin, project_id)
    base = story_url(project_id, created["storyId"])
    chapter_url = f"{base}/chapters/{created['chapterId']}"
    scene = admin.delete(f"{chapter_url}/scenes/{created['sceneId']}").json()
    chapter = admin.delete(chapter_url).json()
    story = admin.delete(base).json()
    root = folder(env, project_id)
    assert (root / ".trash" / "stories" / created["storyId"] / "story.json").is_file()
    assert (root / ".trash" / "scenes" / f"{created['sceneId']}.md").is_file()
    assert not (root / "stories" / created["storyId"]).exists()

    trash = admin.get(f"/api/projects/{project_id}/trash").json()["items"]
    assert {(i["kind"], i["name"]) for i in trash} == {
        ("story", "Saga"),
        ("chapter", "Chapter 1"),
        ("scene", "Untitled Scene"),
    }
    assert next(i for i in trash if i["kind"] == "scene")["storyId"] == created["storyId"]
    meta = json.loads((root / "metadata.json").read_text())
    assert len(meta["trash"]) == 3

    restore = f"/api/projects/{project_id}/trash"
    # The scene's chapter (and the chapter's story) are gone: refuse, keep the item.
    refused = admin.post(f"{restore}/{scene['id']}/restore")
    assert refused.status_code == 409 and "chapter" in refused.json()["detail"]
    assert admin.post(f"{restore}/{chapter['id']}/restore").status_code == 409
    for item in (story, chapter, scene):
        assert admin.post(f"{restore}/{item['id']}/restore").status_code == 200
    chapters = admin.get(base).json()["chapters"]
    assert [s["id"] for s in chapters[0]["scenes"]] == [created["sceneId"]]
    assert admin.get(restore).json()["items"] == []


def test_delete_forever_and_empty_trash(admin, env):
    project_id = create(admin)
    one, two = new_story(admin, project_id, "One"), new_story(admin, project_id, "Two")
    trashed = admin.delete(story_url(project_id, one["storyId"])).json()
    admin.delete(story_url(project_id, two["storyId"]))
    note = new_entity(admin, project_id, "notes", "Plan")
    admin.delete(f"/api/projects/{project_id}/entities/notes/{note['id']}")
    trash_url = f"/api/projects/{project_id}/trash"
    gone = admin.delete(f"{trash_url}/{trashed['id']}")
    assert gone.json() == {"deleted": 1}
    root = folder(env, project_id) / ".trash"
    assert not (root / "stories" / one["storyId"]).exists()
    assert admin.delete(f"{trash_url}/{trashed['id']}").status_code == 404
    assert admin.delete(trash_url).json() == {"deleted": 2}
    assert not (root / "stories" / two["storyId"]).exists()
    assert not (root / "notes" / f"{note['id']}.md").exists()
    assert json.loads((folder(env, project_id) / "metadata.json").read_text())["trash"] == []


def test_purge_expired_trash(admin, env):
    from sqlmodel import Session, select

    from dreamforge_api.db import get_engine
    from dreamforge_api.models import TrashItem
    from dreamforge_api.services.trash import purge_expired

    project_id = create(admin)
    created = new_story(admin, project_id)
    admin.delete(story_url(project_id, created["storyId"]))
    with Session(get_engine(write=True)) as db:
        item = db.exec(select(TrashItem)).one()
        item.expires_at = "2000-01-01T00:00:00.000Z"
        db.add(item)
        db.commit()
        assert purge_expired(db) == 1
    assert not (folder(env, project_id) / ".trash" / "stories" / created["storyId"]).exists()
    assert admin.get(f"/api/projects/{project_id}/trash").json()["items"] == []


def test_note_and_scene_conversions(admin, env):
    project_id = create(admin)
    created = new_story(admin, project_id)
    note = new_entity(
        admin, project_id, "notes", "Idea", body="It begins.", fields={"place": "Harbor"}
    )
    targets = admin.get(f"/api/projects/{project_id}/convert-targets").json()
    assert targets[0]["chapters"][0]["id"] == created["chapterId"]
    converted = admin.post(
        f"/api/projects/{project_id}/entities/notes/{note['id']}/convert-to-scene",
        json={"storyId": created["storyId"]},
    )
    assert converted.status_code == 201, converted.text
    scene_id = converted.json()["sceneId"]
    scenes = admin.get(story_url(project_id, created["storyId"])).json()["chapters"][0]["scenes"]
    scene = next(s for s in scenes if s["id"] == scene_id)
    assert scene["title"] == "Idea" and scene["body"] == "It begins." and scene["place"] == "Harbor"
    archived = admin.get(f"/api/projects/{project_id}/entities/notes/{note['id']}").json()
    assert archived["entity"]["status"] == "archived"
    assert archived["entity"]["frontmatter"]["convertedTo"] == scene_id
    assert archived["entity"]["body"].endswith("It begins.")

    back = admin.post(
        f"{story_url(project_id, created['storyId'])}/chapters/{created['chapterId']}"
        f"/scenes/{scene_id}/convert-to-note"
    )
    assert back.status_code == 201, back.text
    new_note = admin.get(f"/api/projects/{project_id}/entities/notes/{back.json()['noteId']}")
    assert new_note.json()["entity"]["frontmatter"]["convertedFrom"] == scene_id
    missing = admin.post(
        f"/api/projects/{project_id}/entities/notes/{note['id']}/convert-to-scene",
        json={"storyId": "nope"},
    )
    assert missing.status_code == 404


def test_export_renders_markdown_safely(admin):
    project_id = create(admin)
    created = new_story(admin, project_id, "Tale <1>")
    base = story_url(project_id, created["storyId"])
    admin.patch(
        f"{base}/chapters/{created['chapterId']}/scenes/{created['sceneId']}",
        json={
            "title": "Start",
            "body": "**Bold** [@Ana](mention://character/1)<script>alert(1)</script>",
            "overwrite": True,
        },
    )
    res = admin.get(f"{base}/export", params={"author": "Me", "toc": "false"})
    assert res.status_code == 200
    html = res.text
    assert "<title>Tale &lt;1&gt;</title>" in html
    assert "<strong>Bold</strong> Ana" in html
    assert "<script>" not in html and "Table of Contents" not in html
    assert "by Me" in html
    assert res.headers["content-disposition"] == 'inline; filename="Tale _1_-export.html"'


def test_commenter_reads_stories_but_cannot_write(admin):
    from conftest import add_user

    project_id = create(admin)
    created = new_story(admin, project_id)
    invite = admin.post(f"/api/projects/{project_id}/invites", json={"role": "commenter"}).json()
    reader = add_user(admin, "c@example.test", "commenter")
    reader.post(f"/api/invites/{invite['token']}/accept", json={})
    base = story_url(project_id, created["storyId"])
    assert reader.get(base).status_code == 200
    assert reader.delete(base).status_code == 403
    assert reader.post(f"{base}/chapters", json={"title": "X"}).status_code == 403


def test_plotlines_show_on_the_story(admin, env):
    project_id = create(admin)
    created = new_story(admin, project_id)
    plots = folder(env, project_id) / "plotlines"
    plots.mkdir()
    (plots / "p1.json").write_text(
        json.dumps(
            {
                "id": "p1",
                "storyId": created["storyId"],
                "title": "Main",
                "sortOrder": 0,
                "beats": [{"id": "b1", "title": "Hook", "sceneId": created["sceneId"]}],
            }
        )
    )
    (plots / "other.json").write_text(json.dumps({"id": "o", "storyId": "x", "beats": []}))
    detail = admin.get(story_url(project_id, created["storyId"])).json()
    [plotline] = detail["plotlines"]
    assert (plotline["id"], plotline["title"]) == ("p1", "Main")
    assert plotline["beats"] == [
        {"id": "b1", "title": "Hook", "sceneId": created["sceneId"], "sortOrder": 0}
    ]
