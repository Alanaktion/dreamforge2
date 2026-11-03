"""Crash-safe file writes and edit-conflict detection, ported from src/lib/server/storage.ts.

Project content (Markdown, JSON) still lives on disk. The endpoints that write it have not
moved to this server yet; these helpers are here so they keep the same guarantees when they do.
"""

import hashlib
import json
import os
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
