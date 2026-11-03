import csv
import io
import json
import os
import time
import zipfile

import pytest
from conftest import add_user
from test_entities import folder, new_entity
from test_images_search import PNG, upload
from test_plots_timeline import commenter
from test_projects import create
from test_stories import new_story

from dreamforge_api.services import archives, starter


def stories_of(client, project_id):
    return client.get(f"/api/projects/{project_id}/stories").json()["stories"]


def story(client, project_id, story_id):
    return client.get(f"/api/projects/{project_id}/stories/{story_id}").json()


def entities(client, project_id, route):
    return client.get(f"/api/projects/{project_id}/entities/{route}").json()["entities"]


# --- Starters -------------------------------------------------------------------------------


def test_presets_seed_stories_plots_and_notes(admin):
    novel = create(admin, "Novel", preset="novel")
    [book] = stories_of(admin, novel)
    detail = story(admin, novel, book["id"])
    assert book["title"] == "Untitled novel"
    assert [c["title"] for c in detail["chapters"]] == ["Chapter 1"]
    assert len(detail["chapters"][0]["scenes"]) == 1
    [plot] = detail["plotlines"]
    assert plot["title"] == "Main plot" and plot["template"] == "save_the_cat"
    [bible] = entities(admin, novel, "notes")
    assert bible["name"] == "Story bible" and bible["body"].startswith("## Concept")

    series = create(admin, "Series", preset="series")
    assert {e["name"] for e in entities(admin, series, "notes")} == {
        "Series bible",
        "Book 1 chapter plan",
    }
    [book] = stories_of(admin, series)
    assert story(admin, series, book["id"])["plotlines"][0]["template"] == "heros_journey"

    campaign = create(admin, "Campaign", preset="campaign")
    [log] = stories_of(admin, campaign)
    detail = story(admin, campaign, log["id"])
    assert log["title"] == "Session log" and detail["story"]["description"]
    assert detail["chapters"][0]["title"] == "Session 1"
    assert detail["chapters"][0]["scenes"][0]["title"] == "Recap"
    assert {e["name"] for e in entities(admin, campaign, "notes")} == {
        "Campaign overview",
        "Starting town",
    }

    blank = create(admin, "Blank")
    assert stories_of(admin, blank) == []


def test_sample_world(admin):
    res = admin.post("/api/projects/sample", json={})
    assert res.status_code == 201, res.text
    project_id = res.json()["id"]
    assert admin.get(f"/api/projects/{project_id}").json()["project"]["name"] == (
        "Sample: The Salt Coast"
    )
    names = {e["name"] for e in entities(admin, project_id, "characters")}
    assert names == {"Maren Holt", "Tobiah Venn", "Ilse Varga"}
    page = admin.get(f"/api/projects/{project_id}/relations").json()
    assert len(page["relations"]) == 4
    [saga] = stories_of(admin, project_id)
    detail = story(admin, project_id, saga["id"])
    first = detail["chapters"][0]["scenes"][0]
    assert first["title"] == "Low water" and "mention://character/" in first["body"]
    beats = detail["plotlines"][0]["beats"]
    assert beats[0]["sceneId"] == first["id"]
    assert beats[3]["sceneId"] == detail["chapters"][1]["scenes"][0]["id"]
    events = admin.get(f"/api/projects/{project_id}/timeline").json()["timeline"]["events"]
    assert [e["year"] for e in events] == [812, 840]


def test_a_failed_starter_leaves_no_project(admin, env, monkeypatch):
    def broken(db, project, preset):
        raise RuntimeError("boom")

    monkeypatch.setattr(starter, "apply_preset", broken)
    with pytest.raises(RuntimeError):
        admin.post("/api/projects", json={"name": "Half", "preset": "novel"})
    assert admin.get("/api/projects").json()["projects"] == []
    assert not any((env / "projects").iterdir())


# --- CSV ------------------------------------------------------------------------------------


def test_csv_export(admin):
    project_id = create(admin)
    admin.post(
        f"/api/projects/{project_id}/fields",
        json={"entityType": "character", "key": "rank", "label": "Rank", "fieldType": "text"},
    )
    new_entity(
        admin,
        project_id,
        name="=HYPERLINK(1)",
        body='Line one\nsays "hi", twice',
        fields={"tags": ["a", "b"], "traits": ["brave", "kind"], "age": 30, "rank": "-1"},
    )
    res = admin.get(f"/api/projects/{project_id}/csv/characters")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert 'filename="characters.csv"' in res.headers["content-disposition"]
    [row] = list(csv.DictReader(io.StringIO(res.text)))
    assert list(row)[:6] == ["id", "name", "type", "tags", "status", "body"]
    assert list(row)[-1] == "rank"  # custom fields after the built-in ones
    assert row["name"] == "'=HYPERLINK(1)"  # formulas are neutralised
    assert row["rank"] == "'-1"
    assert row["body"] == 'Line one\nsays "hi", twice'
    assert (row["tags"], row["traits"], row["age"]) == ("a, b", "brave,kind", "30")

    reader = commenter(admin, project_id)
    assert reader.get(f"/api/projects/{project_id}/csv/characters").status_code == 200
    assert admin.get(f"/api/projects/{project_id}/csv/bogus").status_code == 404
    assert admin.get(f"/api/projects/{project_id}/csv/items").text == ""


def test_csv_import_creates_updates_and_reports_rows(admin):
    project_id = create(admin)
    ana = new_entity(admin, project_id, name="Ana", fields={"age": "20"})
    new_entity(admin, project_id, name="Ben")
    url = f"/api/projects/{project_id}/csv/characters"
    rows = [
        {"id": ana["id"], "name": "Ana Prime", "fields": {"age": "21"}},  # by id, renamed
        {"name": "ben", "status": "complete", "tags": ["x"]},  # by name, any case
        {"name": "Cy", "body": "New", "fields": {"traits": ["calm"], "id": "no"}},
        {"name": " "},
        {"name": "Dee", "status": "nonsense"},
        {"id": "missing", "name": "Eve"},  # an unknown id creates a new entity
    ]
    res = admin.post(url, json={"rows": rows})
    assert res.status_code == 200, res.text
    result = res.json()
    assert (result["created"], result["updated"]) == (2, 2)
    assert result["errors"] == ["Row 5: missing name", "Row 6: unknown status 'nonsense'"]

    by_name = {e["name"]: e for e in entities(admin, project_id, "characters")}
    assert set(by_name) == {"Ana Prime", "ben", "Cy", "Eve"}  # a match takes the CSV's name
    assert by_name["Ana Prime"]["id"] == ana["id"]
    assert by_name["Ana Prime"]["frontmatter"]["age"] == "21"
    assert by_name["ben"]["status"] == "complete" and by_name["ben"]["tags"] == ["x"]
    assert by_name["Cy"]["body"] == "New" and by_name["Cy"]["frontmatter"]["traits"] == ["calm"]
    assert by_name["Eve"]["id"] != "missing"

    assert admin.post(url, json={"rows": []}).status_code == 400
    reader = commenter(admin, project_id)
    assert reader.post(url, json={"rows": [{"name": "X"}]}).status_code == 403


# --- Project ZIP export and import ----------------------------------------------------------


def export(client, project_id) -> bytes:
    res = client.get(f"/api/projects/{project_id}/export")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "application/zip"
    return res.content


def restore(client, data: bytes):
    return client.post(
        "/api/projects/import", content=data, headers={"content-type": "application/zip"}
    )


def test_export_and_restore_round_trip(admin, env):
    project_id = create(admin, "Round Trip", description="Desc")
    hero = new_entity(admin, project_id, name="Hero")
    admin.post(
        f"/api/projects/{project_id}/fields",
        json={"entityType": "character", "key": "rank", "label": "Rank", "fieldType": "text"},
    )
    admin.post(
        f"/api/projects/{project_id}/comments",
        json={"targetType": "entity", "targetId": hero["id"], "body": "Nice"},
    )
    image = upload(admin, project_id).json()
    admin.put(f"/api/projects/{project_id}/images/{image['id']}/links/{hero['id']}")
    saga = new_story(admin, project_id)
    root = folder(env, project_id)
    (root / "characters" / ".DS_Store").write_text("junk")  # dotfiles are left out
    (root / "characters" / "x.md.tmp").write_text("junk")

    data = export(admin, project_id)
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert "project.json" in names and "metadata.json" in names
    assert f"images/{image['filename']}" in names
    assert not any(n.endswith((".DS_Store", ".tmp")) for n in names)

    other = add_user(admin, "o@example.test", "other")
    res = restore(other, data)
    assert res.status_code == 201, res.text
    copy = res.json()["id"]
    assert copy != project_id
    access = other.get(f"/api/projects/{copy}").json()
    assert access["role"] == "owner" and access["project"]["name"] == "Round Trip"
    [restored] = entities(other, copy, "characters")
    assert restored["name"] == "Hero"
    fields = other.get(f"/api/projects/{copy}/fields").json()
    assert [f["key"] for f in fields] == ["rank"]
    comments = other.get(
        f"/api/projects/{copy}/comments", params={"targetType": "entity", "targetId": hero["id"]}
    ).json()
    assert [c["body"] for c in comments] == ["Nice"]
    images = other.get(f"/api/projects/{copy}/images").json()["images"]
    assert images[0]["linkedEntities"][0]["name"] == "Hero"
    assert other.get(images[0]["url"]).content == PNG
    new_root = folder(env, copy)
    assert json.loads((new_root / "project.json").read_text())["id"] == copy
    meta = json.loads((new_root / "stories" / saga["storyId"] / "story.json").read_text())
    assert meta["projectId"] == copy
    # The copy's rows are its own: the original keeps its field.
    assert fields[0]["id"] != admin.get(f"/api/projects/{project_id}/fields").json()[0]["id"]


def zip_of(files: dict[str, bytes], symlink: str | None = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
        if symlink:
            info = zipfile.ZipInfo(symlink)
            info.external_attr = 0o120777 << 16
            archive.writestr(info, "/etc/passwd")
    return buffer.getvalue()


PROJECT = json.dumps({"name": "Restored"}).encode()


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"not a zip", "not a ZIP"),
        (zip_of({"notes/a.md": b"x"}), "project.json"),
        (zip_of({"project.json": PROJECT, "../evil.md": b"x"}), "Unsafe"),
        (zip_of({"project.json": PROJECT, ".git/config": b"x"}), "Unsafe"),
        (zip_of({"project.json": PROJECT}, symlink="link"), "Unsafe"),
        (zip_of({"project.json": b"{nope"}), "project.json cannot be read"),
        (zip_of({"project.json": PROJECT, "metadata.json": b"[]"}), "metadata.json"),
    ],
)
def test_restore_refuses_bad_archives(admin, env, data, message):
    res = restore(admin, data)
    assert res.status_code == 400 and message in res.json()["detail"], res.text
    assert admin.get("/api/projects").json()["projects"] == []
    assert not any((env / "projects").iterdir())  # nothing left behind


def test_restore_limits(admin, monkeypatch):
    monkeypatch.setattr(archives, "MAX_EXTRACTED_BYTES", 10)
    res = restore(admin, zip_of({"project.json": PROJECT, "notes/a.md": b"x" * 100}))
    assert res.status_code == 400 and "limits" in res.json()["detail"]
    monkeypatch.setattr(archives, "MAX_IMPORT_BYTES", 10)
    assert restore(admin, zip_of({"project.json": PROJECT})).status_code == 413
    assert restore(admin, b"").status_code in (400, 413)


def test_restore_minimal_project(admin):
    res = restore(admin, zip_of({"project.json": PROJECT, "characters/": b""}))
    assert res.status_code == 201, res.text
    assert admin.get(f"/api/projects/{res.json()['id']}").json()["project"]["name"] == "Restored"


# --- Backups --------------------------------------------------------------------------------


def test_backups(admin, env, monkeypatch):
    monkeypatch.setenv("BACKUP_RETENTION", "2")
    project_id = create(admin)
    new_entity(admin, project_id, name="Hero")
    url = f"/api/projects/{project_id}/backups"
    assert admin.get(url).json() == {"backups": [], "enabled": True}

    names = []
    for _ in range(3):
        res = admin.post(url, json={})
        assert res.status_code == 201, res.text
        names.append(res.json()["name"])
    listing = admin.get(url).json()["backups"]
    assert [b["name"] for b in listing] == sorted(names, reverse=True)[:2]  # retention
    assert (env / "backups" / project_id / listing[0]["name"]).is_file()

    download = admin.get(f"{url}/{listing[0]['name']}")
    assert download.status_code == 200 and download.headers["content-type"] == "application/zip"
    assert "characters/hero.md" in zipfile.ZipFile(io.BytesIO(download.content)).namelist()
    assert admin.get(f"{url}/backup-nope.zip").status_code == 404
    assert admin.get(f"{url}/..%2F..%2Fdreamforge.db").status_code == 404

    assert admin.put(f"{url}/settings", json={"enabled": False}).status_code == 200
    assert admin.get(url).json()["enabled"] is False

    reader = commenter(admin, project_id)
    assert reader.get(url).status_code == 403
    assert reader.post(url, json={}).status_code == 403
    assert reader.get(f"{url}/{listing[0]['name']}").status_code == 403


def test_scheduled_backups_respect_the_switch_and_interval(admin, env, monkeypatch):
    monkeypatch.setenv("BACKUP_INTERVAL", "3600")
    on = create(admin, "On")
    off = create(admin, "Off")
    admin.put(f"/api/projects/{off}/backups/settings", json={"enabled": False})

    archives.run_due_backups()
    assert len(archives.list_backups(on)) == 1 and archives.list_backups(off) == []
    archives.run_due_backups()  # the newest backup is recent: nothing new
    assert len(archives.list_backups(on)) == 1

    newest = env / "backups" / on / archives.list_backups(on)[0]["name"]
    old = time.time() - 7200
    os.utime(newest, (old, old))
    archives.run_due_backups()
    assert len(archives.list_backups(on)) == 2
