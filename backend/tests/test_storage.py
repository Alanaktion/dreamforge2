import os

import pytest

from dreamforge_api.storage import (
    ConflictError,
    StorageError,
    assert_revision,
    file_revision,
    read_json,
    write_file_atomic,
    write_json,
)


def test_atomic_write_replaces_and_leaves_no_temp_files(tmp_path):
    target = tmp_path / "nested" / "file.md"
    write_file_atomic(target, "one")
    target.chmod(0o640)
    write_file_atomic(target, "two")
    assert target.read_text() == "two"
    assert os.stat(target).st_mode & 0o777 == 0o640
    assert [p.name for p in target.parent.iterdir()] == ["file.md"]


def test_revision_conflicts(tmp_path):
    target = tmp_path / "f.md"
    target.write_text("a")
    rev = file_revision(target)
    assert_revision(target, rev)
    assert_revision(target, None)  # explicit overwrite skips the check
    target.write_text("b")
    with pytest.raises(ConflictError):
        assert_revision(target, rev)
    with pytest.raises(ConflictError):
        assert_revision(target, "")  # a client that never loaded the file


def test_corrupt_json_is_backed_up_and_never_overwritten(tmp_path):
    target = tmp_path / "relations.json"
    assert read_json(target, []) == []
    target.write_text("{oops")
    with pytest.raises(StorageError):
        write_json(target, [1])
    assert target.read_text() == "{oops"
    assert any(p.name.startswith("relations.json.corrupt-") for p in tmp_path.iterdir())
