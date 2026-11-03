import json
from pathlib import Path

from conftest import add_user


def create(client, name="World", **extra):
    res = client.post("/api/projects", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_create_lists_and_writes_files(admin, env):
    project_id = create(admin, description="A test world")
    folder = Path(env) / "projects" / project_id
    assert (folder / "characters").is_dir() and (folder / "notes" / "_story").is_dir()
    assert json.loads((folder / "project.json").read_text())["name"] == "World"
    listing = admin.get("/api/projects").json()
    assert [p["id"] for p in listing["projects"]] == [project_id]
    assert set(listing["presets"]) == {"blank", "novel", "series", "campaign"}
    assert admin.post("/api/projects", json={"name": "x", "preset": "bogus"}).status_code == 400


def test_pins_sort_first(admin):
    first = create(admin, "First")
    create(admin, "Second")
    assert admin.post(f"/api/projects/{first}/pin", json={}).json() == {"pinned": True}
    names = [p["name"] for p in admin.get("/api/projects").json()["projects"]]
    assert names == ["First", "Second"]


def test_update_and_delete(admin, env):
    project_id = create(admin)
    assert admin.patch(f"/api/projects/{project_id}", json={"name": "Renamed"}).status_code == 200
    folder = Path(env) / "projects" / project_id
    assert json.loads((folder / "project.json").read_text())["name"] == "Renamed"
    wrong = admin.request("DELETE", f"/api/projects/{project_id}", json={"confirmName": "World"})
    assert wrong.status_code == 400
    ok = admin.request("DELETE", f"/api/projects/{project_id}", json={"confirmName": "Renamed"})
    assert ok.status_code == 200 and not folder.exists()
    assert admin.get(f"/api/projects/{project_id}").status_code == 404


def test_invite_flow_and_roles(admin):
    project_id = create(admin)
    invite = admin.post(f"/api/projects/{project_id}/invites", json={"role": "commenter"}).json()
    other = add_user(admin, "ed@example.test", "ed")
    assert other.get(f"/api/projects/{project_id}").status_code == 404

    preview = other.get(f"/api/invites/{invite['token']}").json()
    assert preview["projectName"] == "World" and not preview["alreadyMember"]
    assert other.post(f"/api/invites/{invite['token']}/accept", json={}).json() == {
        "id": project_id
    }
    assert other.get(f"/api/projects/{project_id}").json()["role"] == "commenter"
    shared = other.get("/api/projects").json()["sharedProjects"]
    assert [p["id"] for p in shared] == [project_id] and not shared[0]["isOwner"]

    # Members are owner-only.
    assert other.get(f"/api/projects/{project_id}/members").status_code == 403
    members = admin.get(f"/api/projects/{project_id}/members").json()
    assert [m["username"] for m in members] == ["ed"]
    ed = members[0]["userId"]
    admin.patch(f"/api/projects/{project_id}/members/{ed}", json={"role": "editor"})
    assert other.get(f"/api/projects/{project_id}").json()["role"] == "editor"

    # A commenter invite never downgrades an editor.
    other.post(f"/api/invites/{invite['token']}/accept", json={})
    assert other.get(f"/api/projects/{project_id}").json()["role"] == "editor"

    admin.request("DELETE", f"/api/projects/{project_id}/invites/{invite['token']}")
    assert other.post(f"/api/invites/{invite['token']}/accept", json={}).status_code == 410
    admin.request("DELETE", f"/api/projects/{project_id}/members/{ed}")
    assert other.get(f"/api/projects/{project_id}").status_code == 404


def test_add_member_by_email_case_insensitive(admin):
    project_id = create(admin)
    add_user(admin, "fay@example.test", "fay")
    res = admin.post(
        f"/api/projects/{project_id}/members", json={"query": "FAY@example.test", "role": "editor"}
    )
    assert res.status_code == 200
    me = admin.post(
        f"/api/projects/{project_id}/members", json={"query": "admin", "role": "editor"}
    )
    assert me.status_code == 400


def test_shell(admin):
    project_id = create(admin)
    shell = admin.get(f"/api/projects/{project_id}/shell").json()
    assert shell == {"projectName": "World", "role": "owner", "entityCounts": {}, "bookmarks": []}


def test_delete_never_removes_folders_outside_data_dir(admin, env):
    from sqlmodel import Session

    from dreamforge_api.db import get_engine
    from dreamforge_api.models import Project

    project_id = create(admin)
    outside = Path(env) / "elsewhere"
    outside.mkdir()
    (outside / "project.json").write_text("{}")
    with Session(get_engine(write=True)) as db:
        project = db.get(Project, project_id)
        project.data_path = str(outside)
        db.add(project)
        db.commit()
    # Move the real folder away so resolve_project_path keeps the stored (outside) path.
    (Path(env) / "projects" / project_id).rename(Path(env) / "moved")
    admin.request("DELETE", f"/api/projects/{project_id}", json={"confirmName": "World"})
    assert outside.exists()
