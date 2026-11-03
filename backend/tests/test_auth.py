from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, add_user, login, make_client

from dreamforge_api.services.sessions import COOKIE_NAME


def test_me_signed_out(client):
    assert client.get("/api/auth/me").json() == {"user": None, "allowRegistration": False}


def test_seeded_admin_must_change_password(client):
    res = login(client, next="/projects/abc")
    assert res.status_code == 200
    body = res.json()
    assert body["redirect"] == "/account"  # forced change wins over ?next=
    assert body["user"]["isAdmin"] and body["user"]["mustChangePassword"]
    assert "passwordHash" not in body["user"]
    cookie = res.headers["set-cookie"]
    assert COOKIE_NAME in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    # Everything but the account page is closed until the password changes.
    assert client.get("/api/projects").status_code == 403
    assert client.get("/api/account").status_code == 200


def test_login_redirect_is_same_origin_only(admin):
    admin.post("/api/auth/logout", json={})
    from conftest import NEW_ADMIN_PASSWORD

    ok = login(admin, password=NEW_ADMIN_PASSWORD, next="/projects/abc").json()
    assert ok["redirect"] == "/projects/abc"
    evil = login(admin, password=NEW_ADMIN_PASSWORD, next="//evil.example").json()
    assert evil["redirect"] == "/projects"


def test_bad_credentials_and_throttle(client):
    res = login(client, password="nope")
    assert res.status_code == 400 and res.json()["detail"] == "Invalid email or password"
    for _ in range(9):
        login(client, password="nope")
    assert login(client).status_code == 429


def test_logout_ends_session(admin):
    assert admin.get("/api/auth/me").json()["user"]["email"] == ADMIN_EMAIL
    assert admin.post("/api/auth/logout", json={}).status_code == 200
    assert admin.get("/api/auth/me").json()["user"] is None


def test_bearer_token_works_for_scripts(client):
    session_id = login(client).cookies[COOKIE_NAME]
    other = make_client()
    with other:
        res = other.get("/api/account", headers={"Authorization": f"Bearer {session_id}"})
        assert res.status_code == 200


def test_registration_closed_by_default(client):
    res = client.post(
        "/api/auth/register", json={"email": "a@b.test", "username": "a", "password": "x" * 8}
    )
    assert res.status_code == 403


def test_register_and_duplicate(admin):
    other = add_user(admin, "Ada@Example.test", "ada")
    assert other.get("/api/auth/me").json()["user"]["email"] == "ada@example.test"
    res = other.post(
        "/api/auth/register",
        json={"email": "ADA@example.test", "username": "someone", "password": "x" * 8},
    )
    assert res.status_code == 400 and "already taken" in res.json()["detail"]


def test_disabled_user_is_signed_out(admin):
    other = add_user(admin, "bo@example.test", "bo")
    user_id = other.get("/api/auth/me").json()["user"]["id"]
    assert (
        admin.put(f"/api/admin/users/{user_id}/disabled", json={"value": True}).status_code == 200
    )
    assert other.get("/api/auth/me").json()["user"] is None
    res = login(other, "bo@example.test", "user-password-1")
    assert res.status_code == 403


def test_cross_site_writes_are_refused(client):
    res = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": "https://evil.example"},
    )
    assert res.status_code == 403
    same = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": "http://testserver"},
    )
    assert same.status_code == 200


def test_existing_scrypt_hash_still_signs_in(client):
    """An account created by the old Node server signs in unchanged."""
    from sqlmodel import Session
    from test_passwords import NODE_HASH, NODE_PASSWORD

    from dreamforge_api.db import get_engine
    from dreamforge_api.models import User

    with Session(get_engine()) as db:
        db.add(
            User(
                id="legacy",
                email="legacy@example.test",
                username="legacy",
                password_hash=NODE_HASH,
                created_at="2025-01-01T00:00:00.000Z",
            )
        )
        db.commit()
    assert login(client, "legacy@example.test", NODE_PASSWORD).status_code == 200


def test_origin_list(monkeypatch):
    monkeypatch.setenv("ORIGIN", "http://localhost:5173, http://localhost:3000/")
    with make_client() as client:
        for origin, status in (
            ("http://localhost:3000", 200),
            ("http://localhost:5173", 200),
            ("http://localhost:4000", 403),
        ):
            res = client.post(
                "/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                headers={"Origin": origin},
            )
            assert res.status_code == status, origin


def test_lone_surrogate_password_is_not_a_server_error(client):
    res = client.post(
        "/api/auth/login",
        content=b'{"email": "admin@example.test", "password": "\\ud800"}',
        headers={"content-type": "application/json"},
    )
    assert res.status_code in (400, 422)


def test_oversized_password_is_rejected_before_hashing(client):
    res = login(client, password="x" * 2000)
    assert res.status_code == 422
    assert "xxxx" not in res.text  # the bad value is not echoed back
