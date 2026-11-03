import json
from pathlib import Path

from conftest import add_user
from test_projects import create


def folder(env, project_id) -> Path:
    return Path(env) / "projects" / project_id


def new_entity(client, project_id, route="characters", name="Ana", **body):
    res = client.post(f"/api/projects/{project_id}/entities/{route}", json={"name": name, **body})
    assert res.status_code == 201, res.text
    return res.json()


def test_create_writes_markdown_and_indexes(admin, env):
    project_id = create(admin)
    ana = new_entity(admin, project_id, fields={"traits": ["brave"], "age": 30})
    file = folder(env, project_id) / "characters" / "ana.md"
    text = file.read_text()
    assert text.startswith(f"---\nid: {ana['id']}\nname: Ana\nslug: ana\ntype: character\n")
    assert "traits:\n  - brave\nage: 30\n" in text
    note = new_entity(admin, project_id, "notes", "Plan", body="# Plan\n")
    assert (
        (folder(env, project_id) / "notes" / "_project" / "plan.md")
        .read_text()
        .endswith("---\n\n# Plan\n")
    )
    assert note["body"] == "# Plan\n"
    shell = admin.get(f"/api/projects/{project_id}/shell").json()
    assert shell["entityCounts"] == {"character": 1, "note": 1}
    listing = admin.get(f"/api/projects/{project_id}/entities/characters").json()
    assert [e["name"] for e in listing["entities"]] == ["Ana"]
    assert listing["entities"][0]["frontmatter"]["traits"] == ["brave"]
    assert {e["name"] for e in listing["index"]} == {"Ana", "Plan"}
    assert admin.get(f"/api/projects/{project_id}/entities/dragons").status_code == 404


def test_duplicate_names_get_unique_slugs(admin, env):
    project_id = create(admin)
    new_entity(admin, project_id, name="Ana")
    new_entity(admin, project_id, name="Ana")
    names = sorted(p.name for p in (folder(env, project_id) / "characters").iterdir())
    assert names == ["ana-1.md", "ana.md"]


def test_update_renames_file_and_detects_conflicts(admin, env):
    project_id = create(admin)
    ana = new_entity(admin, project_id)
    url = f"/api/projects/{project_id}/entities/characters/{ana['id']}"
    saved = admin.patch(
        url, json={"fields": {"name": "Ana Bell", "status": "wip"}, "revision": ana["revision"]}
    )
    assert saved.status_code == 200, saved.text
    chars = folder(env, project_id) / "characters"
    assert [p.name for p in chars.iterdir()] == ["ana-bell.md"]
    # The old revision is stale now: refuse, keep the file.
    stale = admin.patch(url, json={"body": "lost?", "revision": ana["revision"]})
    assert stale.status_code == 409
    missing = admin.patch(url, json={"body": "no revision"})
    assert missing.status_code == 409
    forced = admin.patch(url, json={"body": "mine", "overwrite": True})
    assert forced.status_code == 200 and forced.json()["entity"]["body"] == "mine"
    detail = admin.get(url).json()
    assert detail["entity"]["status"] == "wip" and detail["entity"]["body"] == "mine"
    assert detail["entity"]["revision"] == forced.json()["revision"]


def test_update_validation(admin):
    project_id = create(admin)
    ana = new_entity(admin, project_id)
    url = f"/api/projects/{project_id}/entities/characters/{ana['id']}"

    def patch(fields):
        return admin.patch(url, json={"fields": fields, "overwrite": True})

    assert patch({"name": "  "}).status_code == 400
    assert patch({"status": "done"}).status_code == 400
    assert patch({"id": "other"}).status_code == 400
    assert patch({"slug": "../x"}).status_code == 400
    assert patch({"nested": {"a": 1}}).status_code == 422
    assert patch({"alive": True, "age": 3, "aliases": ["A"]}).status_code == 200
    fm = admin.get(url).json()["entity"]["frontmatter"]
    assert fm["alive"] is True and fm["age"] == 3 and fm["aliases"] == ["A"]


def test_commenter_reads_but_cannot_write(admin):
    project_id = create(admin)
    ana = new_entity(admin, project_id)
    invite = admin.post(f"/api/projects/{project_id}/invites", json={"role": "commenter"}).json()
    other = add_user(admin, "cc@example.test", "cc")
    other.post(f"/api/invites/{invite['token']}/accept", json={})
    base = f"/api/projects/{project_id}/entities/characters"
    assert other.get(base).status_code == 200
    assert other.post(base, json={"name": "Nope"}).status_code == 403
    assert other.patch(f"{base}/{ana['id']}", json={"overwrite": True}).status_code == 403
    assert other.request("DELETE", f"{base}/{ana['id']}").status_code == 403
    # Commenters may bookmark and comment.
    assert other.post(f"{base}/{ana['id']}/bookmark", json={}).json() == {"bookmarked": True}
    comment = other.post(
        f"/api/projects/{project_id}/comments",
        json={"targetType": "entity", "targetId": ana["id"], "body": " Hi "},
    )
    assert comment.status_code == 201 and comment.json()["body"] == "Hi"


def test_soft_delete_and_restore_bring_back_links(admin, env):
    project_id = create(admin)
    ana = new_entity(admin, project_id)
    bo = new_entity(admin, project_id, name="Bo")
    base = f"/api/projects/{project_id}"
    rel = admin.post(
        f"{base}/relations",
        json={"sourceId": ana["id"], "targetId": bo["id"], "relationType": "friend"},
    )
    assert rel.status_code == 201, rel.text
    admin.post(f"{base}/entities/characters/{ana['id']}/bookmark", json={})

    trashed = admin.request("DELETE", f"{base}/entities/characters/{ana['id']}")
    assert trashed.status_code == 200, trashed.text
    root = folder(env, project_id)
    assert (root / ".trash" / "characters" / f"{ana['id']}.md").is_file()
    assert json.loads((root / "relations.json").read_text()) == []
    assert admin.get(f"{base}/shell").json()["bookmarks"] == []
    meta = json.loads((root / "metadata.json").read_text())
    assert meta["bookmarks"] == [] and len(meta["trash"]) == 1
    assert admin.get(f"{base}/entities/characters/{ana['id']}").status_code == 404

    restored = admin.post(f"{base}/trash/{trashed.json()['id']}/restore", json={})
    assert restored.status_code == 200, restored.text
    assert (root / "characters" / "ana.md").is_file()
    assert len(json.loads((root / "relations.json").read_text())) == 1
    assert [b["entityName"] for b in admin.get(f"{base}/shell").json()["bookmarks"]] == ["Ana"]
    detail = admin.get(f"{base}/entities/characters/{bo['id']}").json()
    assert [(r["otherName"], r["outgoing"]) for r in detail["relations"]] == [("Ana", False)]
    assert json.loads((root / "metadata.json").read_text())["trash"] == []


def test_duplicate_and_relation_to_new_entity(admin):
    project_id = create(admin)
    ana = new_entity(admin, project_id, body="Story", fields={"tags": ["x"], "age": 4})
    base = f"/api/projects/{project_id}"
    copy = admin.post(f"{base}/entities/characters/{ana['id']}/duplicate", json={}).json()
    assert copy["name"] == "Ana (Copy)" and copy["body"] == "Story" and copy["tags"] == ["x"]
    assert copy["frontmatter"]["age"] == 4 and copy["id"] != ana["id"]
    rel = admin.post(
        f"{base}/relations",
        json={
            "sourceId": ana["id"],
            "newName": "Harbor",
            "newType": "location",
            "relationType": "home",
        },
    )
    assert rel.status_code == 201
    locations = admin.get(f"{base}/entities/locations").json()["entities"]
    assert [e["name"] for e in locations] == ["Harbor"]
    bad = admin.post(
        f"{base}/relations",
        json={"sourceId": ana["id"], "targetId": ana["id"], "relationType": "friend"},
    )
    assert bad.status_code == 400


def test_backlinks_from_mentions_and_fields(admin):
    project_id = create(admin)
    ana = new_entity(admin, project_id)
    mention = f"[@Ana](mention://character/{ana['id']})"
    new_entity(admin, project_id, "notes", "Plan", body=f"See {mention}.")
    new_entity(admin, project_id, "locations", "Harbor", fields={"ruler": mention})
    detail = admin.get(f"/api/projects/{project_id}/entities/characters/{ana['id']}").json()
    assert sorted((b["name"], b["reason"]) for b in detail["backlinks"]) == [
        ("Harbor", "field"),
        ("Plan", "mention"),
    ]


def test_files_edited_outside_the_app_are_indexed(admin, env):
    project_id = create(admin)
    ana = new_entity(admin, project_id)
    chars = folder(env, project_id) / "characters"
    (chars / "ana.md").unlink()
    (chars / "cy.md").write_text("---\nid: cy-1\nname: Cy\n---\n\nHi\n")
    shell = admin.get(f"/api/projects/{project_id}/shell").json()
    assert shell["entityCounts"] == {"character": 1}
    palette = admin.get(f"/api/projects/{project_id}/palette").json()
    assert [e["name"] for e in palette["entities"]] == ["Cy"]
    assert (
        admin.get(f"/api/projects/{project_id}/entities/characters/{ana['id']}").status_code == 404
    )


def test_custom_fields_owner_only_and_mirrored(admin, env):
    project_id = create(admin)
    base = f"/api/projects/{project_id}/fields"
    res = admin.post(
        base,
        json={"entityType": "character", "key": "eyes", "label": "Eyes", "fieldType": "text"},
    )
    assert res.status_code == 201, res.text
    assert (
        admin.post(
            base, json={"entityType": "character", "key": "name", "label": "N", "fieldType": "text"}
        ).status_code
        == 400
    )
    meta = json.loads((folder(env, project_id) / "metadata.json").read_text())
    assert [f["key"] for f in meta["fields"]] == ["eyes"]
    assert meta["fields"][0]["entityType"] == "character" and meta["fields"][0]["sortOrder"] == 0
    listing = admin.get(f"/api/projects/{project_id}/entities/characters").json()
    assert [f["key"] for f in listing["customFields"]] == ["eyes"]
    assert admin.request("DELETE", f"{base}/{res.json()['id']}").status_code == 200
    assert admin.get(base).json() == []


def test_metadata_json_is_read_back(admin, env):
    """A copied project folder brings its rows: metadata.json wins over the database."""
    project_id = create(admin)
    admin.post(
        f"/api/projects/{project_id}/fields",
        json={"entityType": "item", "key": "weight", "label": "Weight", "fieldType": "number"},
    )
    file = folder(env, project_id) / "metadata.json"
    meta = json.loads(file.read_text())
    meta["fields"].append({**meta["fields"][0], "id": "f2", "key": "value", "label": "Value"})
    file.write_text(json.dumps(meta))
    admin.get(f"/api/projects/{project_id}/shell")
    assert [f["key"] for f in admin.get(f"/api/projects/{project_id}/fields").json()] == [
        "weight",
        "value",
    ]


def test_comments_resolve_and_delete(admin):
    project_id = create(admin)
    base = f"/api/projects/{project_id}/comments"
    made = admin.post(base, json={"targetType": "entity", "targetId": "e1", "body": "Hm"}).json()
    listed = admin.get(base, params={"targetType": "entity", "targetId": "e1"}).json()
    assert [c["username"] for c in listed] == ["admin"]
    assert admin.patch(f"{base}/{made['id']}", json={"resolved": True}).status_code == 200
    assert admin.get(base, params={"targetType": "entity", "targetId": "e1"}).json()[0]["resolved"]
    assert admin.request("DELETE", f"{base}/{made['id']}").status_code == 200
    assert admin.get(base, params={"targetType": "entity", "targetId": "e1"}).json() == []
