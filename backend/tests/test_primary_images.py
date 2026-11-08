import pytest
from test_entities import folder, new_entity
from test_images_search import images_url, upload
from test_plots_timeline import commenter
from test_projects import create


@pytest.mark.parametrize(
    "route", ["characters", "organizations", "locations", "cultures", "species", "items", "notes"]
)
def test_primary_image_persistence_and_summaries(admin, env, route):
    project_id = create(admin)
    entity = new_entity(admin, project_id, route, "Portrait", fields={"extra": "Keep me"})
    url = f"/api/projects/{project_id}/entities/{route}/{entity['id']}"
    image = upload(admin, project_id).json()
    link = f"{images_url(project_id)}/{image['id']}/links/{entity['id']}"
    assert admin.put(link).status_code == 200
    assert admin.get(url).json()["entity"]["primaryImageUrl"] is None
    path = f"images/{image['filename']}"
    saved = admin.patch(url, json={"fields": {"imagePath": path}, "revision": entity["revision"]})
    assert saved.status_code == 200, saved.text
    selected = saved.json()["entity"]
    assert selected["imagePath"] == path
    assert selected["primaryImageUrl"] == image["url"]
    assert selected["frontmatter"]["extra"] == "Keep me"
    assert f"imagePath: {path}" in next((folder(env, project_id)).rglob("portrait.md")).read_text()
    stale = admin.patch(url, json={"fields": {"imagePath": None}, "revision": entity["revision"]})
    assert stale.status_code == 409
    assert admin.post(f"/api/projects/{project_id}/sync").status_code == 200
    listing = admin.get(f"/api/projects/{project_id}/entities/{route}").json()
    assert listing["entities"][0]["primaryImageUrl"] == image["url"]
    assert listing["index"][0]["primaryImageUrl"] == image["url"]
    assert (
        admin.get(f"/api/projects/{project_id}/palette").json()["entities"][0]["primaryImageUrl"]
        == image["url"]
    )
    assert (
        admin.get(f"/api/projects/{project_id}/search?q=Portrait").json()["results"][0][
            "primaryImageUrl"
        ]
        == image["url"]
    )
    assert (
        admin.get(f"/api/projects/{project_id}/dashboard").json()["stats"]["recent"][0][
            "primaryImageUrl"
        ]
        == image["url"]
    )
    assert admin.post(f"{url}/bookmark").status_code == 200
    assert (
        admin.get(f"/api/projects/{project_id}/shell").json()["bookmarks"][0]["primaryImageUrl"]
        == image["url"]
    )
    duplicate = admin.post(f"{url}/duplicate").json()
    assert duplicate["imagePath"] is None
    assert duplicate["primaryImageUrl"] is None
    second = upload(admin, project_id, "other.png").json()
    assert (
        admin.put(f"{images_url(project_id)}/{second['id']}/links/{entity['id']}").status_code
        == 200
    )
    replaced = admin.patch(
        url,
        json={
            "fields": {"imagePath": f"images/{second['filename']}"},
            "revision": selected["revision"],
        },
    )
    assert replaced.status_code == 200
    assert replaced.json()["entity"]["primaryImageUrl"] == second["url"]
    cleared = admin.patch(
        url, json={"fields": {"imagePath": None}, "revision": replaced.json()["revision"]}
    )
    assert cleared.status_code == 200
    assert cleared.json()["entity"]["imagePath"] is None
    assert cleared.json()["entity"]["primaryImageUrl"] is None


def test_primary_image_remembers_unlink_trash_restore_and_missing_file(admin, env):
    project_id = create(admin)
    entity = new_entity(admin, project_id)
    url = f"/api/projects/{project_id}/entities/characters/{entity['id']}"
    image = upload(admin, project_id).json()
    image_url = f"{images_url(project_id)}/{image['id']}"
    link = f"{image_url}/links/{entity['id']}"
    path = f"images/{image['filename']}"
    admin.put(link)
    assert (
        admin.patch(
            url, json={"fields": {"imagePath": path}, "revision": entity["revision"]}
        ).status_code
        == 200
    )

    def check(expected):
        current = admin.get(url).json()["entity"]
        assert current["imagePath"] == path
        assert current["primaryImageUrl"] == expected

    admin.delete(link)
    check(None)
    admin.put(link)
    check(image["url"])
    file = folder(env, project_id) / path
    data = file.read_bytes()
    file.unlink()
    check(None)
    file.write_bytes(data)
    check(image["url"])
    trashed = admin.delete(image_url).json()
    check(None)
    assert (
        admin.post(f"/api/projects/{project_id}/trash/{trashed['id']}/restore").status_code == 200
    )
    check(image["url"])
    trashed = admin.delete(image_url).json()
    assert admin.delete(f"/api/projects/{project_id}/trash/{trashed['id']}").status_code == 200
    check(None)


def test_primary_image_validation_and_permissions(admin):
    project_id = create(admin)
    entity = new_entity(admin, project_id)
    url = f"/api/projects/{project_id}/entities/characters/{entity['id']}"
    image = upload(admin, project_id).json()
    foreign = upload(admin, create(admin, name="Other project")).json()
    for path in [
        f"images/{image['filename']}",
        f"images/{foreign['filename']}",
        "../secret.png",
        "https://example.com/image.png",
        "",
        12,
        True,
        [],
    ]:
        result = admin.patch(
            url, json={"fields": {"imagePath": path}, "revision": entity["revision"]}
        )
        assert result.status_code == 400, result.text
    assert (
        admin.post(
            f"/api/projects/{project_id}/entities/characters",
            json={"name": "Invalid", "fields": {"imagePath": f"images/{image['filename']}"}},
        ).status_code
        == 400
    )
    admin.put(f"{images_url(project_id)}/{image['id']}/links/{entity['id']}")
    reader = commenter(admin, project_id)
    assert (
        reader.patch(
            url,
            json={
                "fields": {"imagePath": f"images/{image['filename']}"},
                "revision": entity["revision"],
            },
        ).status_code
        == 403
    )
    assert reader.get(url).status_code == 200


def test_primary_images_in_relations_and_backlinks(admin):
    project_id = create(admin)
    target = new_entity(admin, project_id, name="Target")
    source = new_entity(
        admin, project_id, name="Source", body=f"[@Target](mention://character/{target['id']})"
    )
    image = upload(admin, project_id).json()
    admin.put(f"{images_url(project_id)}/{image['id']}/links/{source['id']}")
    assert (
        admin.patch(
            f"/api/projects/{project_id}/entities/characters/{source['id']}",
            json={
                "fields": {"imagePath": f"images/{image['filename']}"},
                "revision": source["revision"],
            },
        ).status_code
        == 200
    )
    assert (
        admin.post(
            f"/api/projects/{project_id}/relations",
            json={"sourceId": source["id"], "targetId": target["id"], "relationType": "related_to"},
        ).status_code
        == 201
    )
    detail = admin.get(f"/api/projects/{project_id}/entities/characters/{target['id']}").json()
    assert detail["backlinks"][0]["primaryImageUrl"] == image["url"]
    assert detail["relations"][0]["primaryImageUrl"] == image["url"]
