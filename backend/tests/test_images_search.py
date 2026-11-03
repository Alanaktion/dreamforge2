import json
import struct

from test_entities import folder, new_entity
from test_plots_timeline import commenter
from test_projects import create
from test_stories import new_story, story_url

PNG = (
    b"\x89PNG\r\n\x1a\n"
    + b"\x00\x00\x00\rIHDR"
    + struct.pack(">II", 4, 3)
    + b"\x08\x06\x00\x00\x00"
)
SVG = b'<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>'


def images_url(project_id):
    return f"/api/projects/{project_id}/images"


def upload(client, project_id, name="map.png", data=PNG):
    return client.post(
        images_url(project_id),
        params={"name": name},
        content=data,
        headers={"content-type": "application/octet-stream"},
    )


# --- Images ---------------------------------------------------------------------------------


def test_upload_serve_and_caption(admin, env):
    project_id = create(admin)
    res = upload(admin, project_id, "World Map.png")
    assert res.status_code == 201, res.text
    image = res.json()
    assert image["originalName"] == "World Map.png" and image["mimeType"] == "image/png"
    assert image["filename"] == f"{image['id']}.png" and image["size"] == len(PNG)
    assert (folder(env, project_id) / "images" / image["filename"]).read_bytes() == PNG

    served = admin.get(image["url"])
    assert served.status_code == 200 and served.content == PNG
    assert served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"

    # The row is mirrored to metadata.json, in the old camelCase layout.
    meta = json.loads((folder(env, project_id) / "metadata.json").read_text())
    assert meta["images"][0]["originalName"] == "World Map.png"

    url = f"{images_url(project_id)}/{image['id']}"
    changed = admin.patch(url, json={"caption": " The known world ", "altText": "A map"})
    assert changed.json()["caption"] == "The known world" and changed.json()["altText"] == "A map"
    cleared = admin.patch(url, json={"caption": ""}).json()
    assert cleared["caption"] is None and cleared["altText"] == "A map"
    assert admin.patch(f"{images_url(project_id)}/nope", json={"caption": "x"}).status_code == 404

    listing = admin.get(images_url(project_id)).json()
    assert [i["id"] for i in listing["images"]] == [image["id"]]


def test_upload_rejects_wrong_types_and_contents(admin, env):
    project_id = create(admin)
    assert upload(admin, project_id, "notes.txt", b"hello").status_code == 400
    assert upload(admin, project_id, "fake.png", b"not a png at all, really").status_code == 400
    assert upload(admin, project_id, "empty.gif", b"").status_code == 400
    huge = PNG[:16] + struct.pack(">II", 50000, 10) + PNG[24:]
    assert upload(admin, project_id, "huge.png", huge).status_code == 400
    assert not (folder(env, project_id) / "images").exists() or not any(
        (folder(env, project_id) / "images").iterdir()
    )

    svg = upload(admin, project_id, "icon.svg", SVG).json()
    served = admin.get(svg["url"])
    assert served.headers["content-type"].startswith("image/svg+xml")
    assert "sandbox" in served.headers["content-security-policy"]

    for bad in ("..%2Fmetadata.json", "nope.png", "metadata.json"):
        assert admin.get(f"{images_url(project_id)}/{bad}").status_code == 404


def test_entity_links_trash_and_restore(admin, env):
    project_id = create(admin)
    hero = new_entity(admin, project_id, "characters", "Hero")
    image = upload(admin, project_id).json()
    url = f"{images_url(project_id)}/{image['id']}"

    assert admin.put(f"{url}/links/{hero['id']}").status_code == 200
    assert admin.put(f"{url}/links/{hero['id']}").status_code == 200  # idempotent
    assert admin.put(f"{url}/links/nobody").status_code == 404
    detail = admin.get(f"{url}/details").json()
    assert detail["image"]["linkedEntities"] == [
        {"id": hero["id"], "name": "Hero", "type": "character"}
    ]
    assert [e["name"] for e in detail["entities"]] == ["Hero"]
    entity = admin.get(f"/api/projects/{project_id}/entities/characters/{hero['id']}").json()
    assert [i["id"] for i in entity["images"]] == [image["id"]]
    assert [i["id"] for i in entity["projectImages"]] == [image["id"]]

    trashed = admin.delete(url)
    assert trashed.status_code == 200, trashed.text
    root = folder(env, project_id)
    assert not (root / "images" / image["filename"]).exists()
    assert (root / ".trash" / "images" / image["filename"]).is_file()
    assert admin.get(f"{url}/details").status_code == 404
    [item] = admin.get(f"/api/projects/{project_id}/trash").json()["items"]
    assert (item["kind"], item["name"]) == ("image", "map.png")

    restored = admin.post(f"/api/projects/{project_id}/trash/{trashed.json()['id']}/restore")
    assert restored.status_code == 200, restored.text
    back = admin.get(f"{url}/details").json()["image"]
    assert back["linkedEntities"][0]["id"] == hero["id"]  # the link comes back too
    assert back["createdAt"] == image["createdAt"]
    assert (root / "images" / image["filename"]).is_file()

    assert admin.delete(f"{url}/links/{hero['id']}").status_code == 200
    assert admin.delete(f"{url}/links/{hero['id']}").status_code == 404


def test_scan_picks_up_files_copied_in(admin, env):
    project_id = create(admin)
    directory = folder(env, project_id) / "images"
    directory.mkdir(exist_ok=True)
    (directory / "copied.png").write_bytes(PNG)
    (directory / "readme.txt").write_text("not an image")
    [image] = admin.get(images_url(project_id)).json()["images"]
    assert image["filename"] == "copied.png" and image["size"] == len(PNG)
    assert len(admin.get(images_url(project_id)).json()["images"]) == 1  # no duplicate


def test_commenter_sees_images_but_cannot_change_them(admin):
    project_id = create(admin)
    image = upload(admin, project_id).json()
    reader = commenter(admin, project_id)
    assert reader.get(images_url(project_id)).json()["role"] == "commenter"
    assert reader.get(image["url"]).status_code == 200
    assert upload(reader, project_id).status_code == 403
    url = f"{images_url(project_id)}/{image['id']}"
    assert reader.patch(url, json={"caption": "x"}).status_code == 403
    assert reader.delete(url).status_code == 403


def test_upload_access_is_checked_before_the_body_is_read(admin):
    project_id = create(admin)
    reader = commenter(admin, project_id)

    def oversized():  # no Content-Length, so only reading the body would refuse it (413)
        for _ in range(21):
            yield b"\0" * (1024 * 1024)

    res = reader.post(
        images_url(project_id),
        params={"name": "big.png"},
        content=oversized(),
        headers={"content-type": "application/octet-stream"},
    )
    assert res.status_code == 403
    assert upload(admin, project_id).status_code == 201  # the editor path still works


def test_image_endpoints_need_project_access(admin, client):
    from conftest import add_user

    project_id = create(admin)
    image = upload(admin, project_id).json()
    stranger = add_user(admin, "s@example.test", "stranger")
    assert stranger.get(image["url"]).status_code == 404
    assert stranger.get(images_url(project_id)).status_code == 404


# --- Search and the relations page ----------------------------------------------------------


def test_search_names_bodies_fields_and_scenes(admin):
    project_id = create(admin)
    new_entity(admin, project_id, "characters", "Lantern Keeper")
    new_entity(admin, project_id, "locations", "Harbor", body="A <b>lantern</b> burns here.")
    new_entity(admin, project_id, "items", "Lamp", fields={"traits": ["lantern-like", "old"]})
    story = new_story(admin, project_id)
    scene = (
        f"{story_url(project_id, story['storyId'])}/chapters/{story['chapterId']}"
        f"/scenes/{story['sceneId']}"
    )
    admin.patch(scene, json={"summary": "The lantern goes out.", "overwrite": True})
    url = f"/api/projects/{project_id}/search"

    found = admin.get(url, params={"q": "LANTERN"}).json()
    by_name = {r["name"]: r for r in found["results"]}
    assert by_name["Lantern Keeper"]["matchedIn"] == "name"
    assert by_name["Harbor"]["matchedIn"] == "body"
    assert by_name["Harbor"]["snippet"] == "A lantern burns here."
    assert by_name["Lamp"]["matchedIn"] == "field"
    assert by_name["Scene 1"]["matchedIn"] == "summary"
    assert by_name["Scene 1"]["context"] == "Saga › Chapter 1"

    scenes = admin.get(url, params={"q": "lantern", "kind": "scene"}).json()["results"]
    assert [r["kind"] for r in scenes] == ["scene"]
    typed = admin.get(url, params={"q": "lantern", "type": "locations"}).json()
    assert [r["name"] for r in typed["results"]] == ["Harbor"] and typed["type"] == "locations"
    assert admin.get(url, params={"q": "lantern", "type": "bogus"}).json()["type"] == ""
    assert admin.get(url, params={"q": "  "}).json()["results"] == []


def test_relations_page(admin):
    project_id = create(admin)
    a = new_entity(admin, project_id, "characters", "Ana")
    b = new_entity(admin, project_id, "characters", "Ben")
    res = admin.post(
        f"/api/projects/{project_id}/relations",
        json={"sourceId": a["id"], "targetId": b["id"], "relationType": "sibling"},
    )
    assert res.status_code == 201, res.text
    page = admin.get(f"/api/projects/{project_id}/relations").json()
    assert page["relations"] == [
        {
            "id": res.json()["id"],
            "sourceId": a["id"],
            "targetId": b["id"],
            "relationType": "sibling",
            "label": None,
        }
    ]
    assert {e["name"] for e in page["entities"]} == {"Ana", "Ben"}
