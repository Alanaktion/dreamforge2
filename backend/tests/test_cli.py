from sqlmodel import Session

from dreamforge_api.cli import main
from dreamforge_api.db import get_engine
from dreamforge_api.passwords import verify_password
from dreamforge_api.services.accounts import find_user


def test_migrate_reports_version(capsys):
    assert main(["migrate"]) == 0
    assert "from schema v0 to v3" in capsys.readouterr().out
    assert main(["migrate"]) == 0
    assert "up to date (schema v3)" in capsys.readouterr().out


def test_user_add_and_reset(capsys):
    assert main(["user", "add", "--email", "Ada@Example.test", "--username", "ada", "--admin"]) == 0
    out = capsys.readouterr().out
    assert "Created administrator ada <ada@example.test>" in out
    temporary = out.strip().rsplit(": ", 1)[1]
    with Session(get_engine()) as db:
        user = find_user(db, "ada")
        assert user.is_admin and user.must_change_password
        assert verify_password(temporary, user.password_hash)

    assert main(["user", "reset-password", "ada@example.test", "--password", "chosen-pw-1"]) == 0
    with Session(get_engine()) as db:
        user = find_user(db, "ada")
        assert verify_password("chosen-pw-1", user.password_hash)
        assert not user.must_change_password

    assert main(["user", "add", "--email", "ada@example.test", "--username", "x"]) == 1
    assert "already taken" in capsys.readouterr().err
    assert main(["user", "reset-password", "nobody"]) == 1
