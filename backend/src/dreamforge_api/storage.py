"""Crash-safe file writes and edit-conflict detection, ported from src/lib/server/storage.ts.

Project content (Markdown, JSON) lives on disk; the database only indexes it.
"""

import hashlib
import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any


class StorageError(Exception):
    def __init__(self, file_path: Path | str, cause: BaseException | None = None):
        super().__init__(f"Cannot read {file_path}. Repair the file before saving.")
        self.file_path = str(file_path)
        self.__cause__ = cause


class ConflictError(Exception):
    def __init__(self) -> None:
        super().__init__(
            "This changed elsewhere. Your edits are still here. Reload to load the latest "
            "version, or explicitly overwrite it."
        )


def file_revision(file_path: Path | str) -> str:
    return hashlib.sha256(Path(file_path).read_bytes()).hexdigest()


def assert_revision(file_path: Path | str, expected: str | None) -> None:
    """``expected=None`` means the user chose to overwrite; an empty string is still checked."""
    if expected is not None and expected != file_revision(file_path):
        raise ConflictError()


def expected_revision(revision: str | None, overwrite: bool) -> str | None:
    return None if overwrite else (revision or "")


def _sync_directory(directory: Path) -> None:
    # Best effort: some platforms and filesystems cannot open or fsync a directory.
    try:
        fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def write_file_atomic(file_path: Path | str, content: str | bytes) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.{uuid.uuid4()}.tmp"
    data = content.encode("utf-8") if isinstance(content, str) else content
    mode = (path.stat().st_mode & 0o777) if path.exists() else 0o666
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        try:
            view = memoryview(data)
            written = 0
            while written < len(data):  # os.write may write less than asked
                written += os.write(fd, view[written:])
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temporary, path)
        _sync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def read_json(file_path: Path | str, fallback: Any, validate=lambda value: True) -> Any:
    path = Path(file_path)
    try:
        content = path.read_bytes()
    except FileNotFoundError:
        return json.loads(json.dumps(fallback))
    except OSError as cause:
        raise StorageError(path, cause) from cause
    try:
        value = json.loads(content)
        if not validate(value):
            raise ValueError("Invalid data structure")
        return value
    except ValueError as cause:
        digest = hashlib.sha256(content).hexdigest()[:12]
        backup = path.with_name(f"{path.name}.corrupt-{digest}")
        if not backup.exists():
            backup.write_bytes(content)
        raise StorageError(path, cause) from cause


def write_json(file_path: Path | str, value: Any) -> None:
    path = Path(file_path)
    if path.exists():
        read_json(path, None)  # refuse to overwrite a file we cannot parse
    write_file_atomic(path, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


# The SvelteKit server relied on Node's single thread to serialize every read-modify-write
# of a project file (Markdown frontmatter, relations.json, metadata.json). FastAPI runs sync
# endpoints in a thread pool, so those sections take this per-project lock instead. It is
# process-local: run one server process per data directory, as before.
#
# Lock order: the SQLite write lock first, then the project lock. Write requests begin their
# BEGIN IMMEDIATE transaction in the access check, before any project lock, and code holding
# a project lock never commits and then writes again (that would wait for the database while
# holding the project lock, and deadlock against a request doing the opposite).
_project_locks: dict[str, threading.RLock] = {}
_project_locks_guard = threading.Lock()


def project_lock(project_id: str) -> threading.RLock:
    with _project_locks_guard:
        lock = _project_locks.get(project_id)
        if lock is None:
            lock = _project_locks[project_id] = threading.RLock()
        return lock


def move_and_write_atomic(source: Path, target: Path, content: str | bytes) -> None:
    """Rename then rewrite: a crash part way leaves one file with the id, never two."""
    if target.exists():
        raise FileExistsError(f"Cannot rename: {target} already exists")
    os.rename(source, target)
    write_file_atomic(target, content)
