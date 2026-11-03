import io
import threading
import time
import zipfile
from pathlib import Path

from dreamforge_api.config import get_settings
from dreamforge_api.services import archives


def _project(admin, name):
    return admin.post("/api/projects", json={"name": name}).json()["id"]


def test_archive_does_not_hold_the_project_lock_while_compressing(admin, monkeypatch):
    """A slow archive must not stall writes: before, a request on the archived project
    waited on its lock while holding the database write lock, and every other write on the
    instance then failed with 'database is locked'."""
    busy = _project(admin, "Busy")
    other = _project(admin, "Other")
    zipping, release = threading.Event(), threading.Event()
    real_write = zipfile.ZipFile.write

    def slow_write(self, *args, **kwargs):
        zipping.set()
        release.wait(20)
        return real_write(self, *args, **kwargs)

    monkeypatch.setattr(zipfile.ZipFile, "write", slow_write)
    export = threading.Thread(target=lambda: admin.get(f"/api/projects/{busy}/export"))
    export.start()
    try:
        assert zipping.wait(10)
        started = time.monotonic()
        assert admin.get(f"/api/projects/{busy}/shell").status_code == 200
        assert admin.post(f"/api/projects/{other}/pin").status_code == 200
        assert time.monotonic() - started < 5
    finally:
        release.set()
        export.join(30)


def test_archive_is_a_snapshot_and_leaves_nothing_behind(admin, monkeypatch):
    project_id = _project(admin, "Snap")
    created = admin.post(
        f"/api/projects/{project_id}/entities/characters", json={"name": "Ada", "body": "old"}
    ).json()
    base = get_settings().data_dir / project_id
    file = base / "characters" / "ada.md"
    real_write = zipfile.ZipFile.write
    changed = []

    def write_then_edit(self, path, name, *args, **kwargs):
        if not changed:  # the project changes after the snapshot, mid-archive
            res = admin.patch(
                f"/api/projects/{project_id}/entities/characters/{created['id']}",
                json={"body": "new", "revision": created["revision"]},
            )
            changed.append(res.status_code)
        return real_write(self, path, name, *args, **kwargs)

    monkeypatch.setattr(zipfile.ZipFile, "write", write_then_edit)
    out = io.BytesIO()
    archives.write_archive(project_id, out)
    assert changed == [200]
    assert "new" in file.read_text()
    with zipfile.ZipFile(out) as z:
        assert "old" in z.read("characters/ada.md").decode()
    leftovers = [p for p in base.parent.iterdir() if archives.SNAPSHOT_MARKER in p.name]
    assert leftovers == []


def test_stale_snapshots_are_removed_at_startup(admin):
    data_dir = get_settings().data_dir
    stale = data_dir / f".abc{archives.SNAPSHOT_MARKER}123"
    (stale / "characters").mkdir(parents=True)
    archives.remove_stale_snapshots()
    assert not stale.exists()


def test_shell_reports_unreadable_and_duplicate_files(admin):
    project_id = _project(admin, "Broken")
    base = Path(get_settings().data_dir / project_id)
    ok = admin.post(f"/api/projects/{project_id}/entities/characters", json={"name": "Ada"}).json()
    shell = admin.get(f"/api/projects/{project_id}/shell").json()
    assert shell["storageProblems"] == []

    broken = base / "characters" / "broken.md"
    broken.write_text("---\nid: x\nname: [unclosed\n---\n")
    dupe = base / "characters" / "zz-copy.md"
    dupe.write_text((base / "characters" / "ada.md").read_text())
    problems = admin.get(f"/api/projects/{project_id}/shell").json()["storageProblems"]
    assert {p["file"] for p in problems} == {"characters/broken.md", "characters/zz-copy.md"}
    assert any(ok["id"] in p["message"] for p in problems)

    broken.write_text("---\nid: fixed\nname: Fixed\ntype: character\n---\n")
    dupe.unlink()
    assert admin.get(f"/api/projects/{project_id}/shell").json()["storageProblems"] == []
