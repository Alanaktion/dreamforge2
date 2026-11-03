import pytest
from fastapi.testclient import TestClient

from dreamforge_api import diagnostics, throttle
from dreamforge_api.main import create_app

ADMIN_EMAIL = "admin@example.test"
ADMIN_PASSWORD = "initial-admin-password"
NEW_ADMIN_PASSWORD = "a-much-longer-password"


@pytest.fixture(autouse=True)
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "dreamforge.db"))
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "projects"))
    monkeypatch.setenv("FRONTEND_DIR", str(tmp_path / "build"))
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASSWORD)
    for name in ("PUBLIC_ALLOW_REGISTRATION", "ORIGIN"):
        monkeypatch.delenv(name, raising=False)
    throttle.reset()
    diagnostics.reset()
    yield tmp_path


def make_client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture
def client():
    with make_client() as c:
        yield c


def login(client, email=ADMIN_EMAIL, password=ADMIN_PASSWORD, **extra):
    return client.post("/api/auth/login", json={"email": email, "password": password, **extra})


@pytest.fixture
def admin(client):
    """The client, signed in as the seeded admin with the forced password change done."""
    assert login(client).status_code == 200
    res = client.patch(
        "/api/account",
        json={
            "currentPassword": ADMIN_PASSWORD,
            "email": ADMIN_EMAIL,
            "username": "admin",
            "password": NEW_ADMIN_PASSWORD,
        },
    )
    assert res.status_code == 200, res.text
    return client


def add_user(admin_client, email, username, password="user-password-1", is_admin=False):
    """Creates a user via open registration in a second client and returns that client."""
    admin_client.put("/api/admin/registration", json={"mode": "open"})
    other = make_client()
    other.__enter__()
    res = other.post(
        "/api/auth/register", json={"email": email, "username": username, "password": password}
    )
    assert res.status_code == 200, res.text
    return other
