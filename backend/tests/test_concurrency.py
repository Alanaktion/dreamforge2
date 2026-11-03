import threading
import time

from conftest import add_user
from sqlmodel import Session, select

from dreamforge_api.db import get_engine
from dreamforge_api.services.projects import toggle_pin
from dreamforge_api.services.sessions import resolve_session


def test_read_then_write_does_not_fail_when_another_write_lands_between(admin):
    """A request that reads (auth) and then writes must not fail with 'database is locked'
    because another request committed in between."""
    project_id = admin.post("/api/projects", json={"name": "W"}).json()["id"]
    token = admin.cookies["dreamforge-session"]
    user_id = admin.get("/api/auth/me").json()["user"]["id"]
    other = add_user(admin, "x@example.test", "x")
    other_id = other.get("/api/auth/me").json()["user"]["id"]
    admin.post(f"/api/projects/{project_id}/members", json={"query": "x", "role": "editor"})

    with Session(get_engine(write=True)) as a:
        assert resolve_session(a, token)  # request A has read (and holds the write lock)
        errors = []

        def request_b():
            try:
                with Session(get_engine(write=True)) as b:
                    toggle_pin(b, other_id, project_id)
            except Exception as err:  # pragma: no cover - the failure we guard against
                errors.append(err)

        writer = threading.Thread(target=request_b)
        writer.start()
        time.sleep(0.3)  # without the fix, B commits here and A's write below then fails
        toggle_pin(a, user_id, project_id)
        writer.join(timeout=15)
    assert errors == []
    assert admin.get("/api/projects").json()["projects"][0]["pinned"]


def test_expired_session_on_a_get_is_cleaned_up_without_conflict(admin):
    """A GET that finds a dead session deletes it in its own write transaction, so a commit
    by another request in between cannot turn it into 'database is locked'."""
    from dreamforge_api.models import Session as LoginSession
    from dreamforge_api.utils import unix_now

    token = admin.cookies["dreamforge-session"]
    user_id = admin.get("/api/auth/me").json()["user"]["id"]
    project_id = admin.post("/api/projects", json={"name": "W"}).json()["id"]
    with Session(get_engine(write=True)) as db:
        row = db.get(LoginSession, token)
        row.expires_at = unix_now() - 1
        db.add(row)
        db.commit()

    with Session(get_engine()) as reader:  # a GET's deferred session
        reader.exec(select(LoginSession)).all()  # its read snapshot starts here
        with Session(get_engine(write=True)) as other:  # another request commits
            toggle_pin(other, user_id, project_id)
        assert resolve_session(reader, token) is None
    with Session(get_engine()) as db:
        assert db.get(LoginSession, token) is None


def test_concurrent_relation_writes_are_not_lost(tmp_path):
    """FastAPI runs sync endpoints on a thread pool; relations.json read-modify-writes must
    not overwrite each other (the old server relied on Node's single thread for this)."""
    from concurrent.futures import ThreadPoolExecutor

    from dreamforge_api.services.relations import add_relation, load_relations

    (tmp_path / "relations.json").write_text("[]")

    def add(i: int) -> None:
        add_relation("p1", tmp_path, f"s{i}", f"t{i}", "friend", None)

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(add, range(200)))
    assert len(load_relations(tmp_path)) == 200
