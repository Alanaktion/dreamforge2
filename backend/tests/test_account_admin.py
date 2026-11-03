from conftest import NEW_ADMIN_PASSWORD, add_user, login


def test_account_update_rules(admin):
    base = {
        "currentPassword": NEW_ADMIN_PASSWORD,
        "email": "admin@example.test",
        "username": "admin",
    }
    assert admin.patch("/api/account", json={**base, "currentPassword": "x"}).status_code == 400
    short = admin.patch("/api/account", json={**base, "password": "short-pw"})
    assert short.status_code == 400 and "12 characters" in short.json()["detail"]
    renamed = admin.patch("/api/account", json={**base, "username": "root"})
    assert renamed.json()["user"]["username"] == "root"


def test_password_change_signs_out_other_sessions(admin):
    from conftest import make_client

    second = make_client()
    with second:
        assert login(second, password=NEW_ADMIN_PASSWORD).status_code == 200
        admin.patch(
            "/api/account",
            json={
                "currentPassword": NEW_ADMIN_PASSWORD,
                "email": "admin@example.test",
                "username": "admin",
                "password": "yet-another-long-password",
            },
        )
        assert second.get("/api/auth/me").json()["user"] is None
        assert admin.get("/api/auth/me").json()["user"] is not None


def test_last_admin_rules(admin):
    me = admin.get("/api/auth/me").json()["user"]["id"]
    res = admin.put(f"/api/admin/users/{me}/admin", json={"value": False})
    assert res.status_code == 400 and "administrator must remain" in res.json()["detail"]
    assert admin.put(f"/api/admin/users/{me}/disabled", json={"value": True}).status_code == 400
    delete = admin.request(
        "DELETE", "/api/account", json={"password": NEW_ADMIN_PASSWORD, "confirm": "DELETE"}
    )
    assert delete.status_code == 400


def test_admin_overview_and_reset(admin):
    other = add_user(admin, "cy@example.test", "cy")
    overview = admin.get("/api/admin").json()
    assert overview["registration"] == "open" and overview["registrationOpen"]
    cy = next(u for u in overview["users"] if u["username"] == "cy")
    assert cy["ownedProjects"] == 0 and not cy["isAdmin"]
    assert other.get("/api/admin").status_code == 403

    reset = admin.post(f"/api/admin/users/{cy['id']}/reset-password", json={})
    temporary = reset.json()["password"]
    assert other.get("/api/auth/me").json()["user"] is None  # signed out everywhere
    res = login(other, "cy@example.test", temporary)
    assert res.json()["redirect"] == "/account"


def test_delete_account(admin):
    other = add_user(admin, "di@example.test", "di")
    res = other.request(
        "DELETE", "/api/account", json={"password": "user-password-1", "confirm": "DELETE"}
    )
    assert res.status_code == 200
    assert login(other, "di@example.test", "user-password-1").status_code == 400
