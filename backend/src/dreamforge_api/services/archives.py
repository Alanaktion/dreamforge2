"""Project ZIP export, restore from a ZIP, and automatic backups.

Ported from src/lib/server/backups.ts. An archive holds the project folder as it is on
disk, plus metadata.json (fields, bookmarks, comments, trash, images), so a restore into a
fresh project brings those rows back. Users, sessions and memberships stay with the
instance.
"""

import errno
import logging
import os
import shutil
import stat
import threading
import time
import zipfile
import zlib
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import IO, Any

from sqlmodel import Session, select

from ..config import get_settings
from ..db import get_engine
from ..models import Project
from ..storage import StorageError, project_lock, read_json, write_json
from ..utils import generate_id, is_safe_path_segment, iso_now
from .entities import scan_project
from .members import project_path
from .metadata import persist_project_metadata, sync_project_metadata
from .projects import delete_project

log = logging.getLogger("dreamforge")

MAX_IMPORT_BYTES = 20 * 1024 * 1024
MAX_ENTRIES = 20000
MAX_EXTRACTED_BYTES = 512 * 1024 * 1024
_BACKUP_NAME = "backup-*.zip"

_active: set[str] = set()
_active_guard = threading.Lock()


class ArchiveError(ValueError):
    """A ZIP that cannot be restored, or a backup that cannot run. The message is for users."""


# --- Writing archives -----------------------------------------------------------------------


def _archived_files(base: Path) -> Iterator[tuple[Path, str]]:
    """Every file to archive, with its name in the ZIP. Temporary and quarantined files are
    left out, and so are dotfiles other than the trash, which a restore would refuse."""
    for root, dirs, files in os.walk(base):
        rel = Path(root).relative_to(base)
        top = rel == Path(".")
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") or (top and d == ".trash"))
        for name in sorted(files):
            if name.startswith(".") or name.endswith(".tmp") or ".corrupt-" in name:
                continue
            path = Path(root) / name
            if path.is_symlink() or not path.is_file():
                continue
            yield path, (rel / name).as_posix()


def _refresh_metadata(project_id: str) -> Path:
    """Bring metadata.json up to date with the rows, so the archive carries them. Uses a
    session of its own: callers must not hold the database write lock. Returns the folder."""
    with Session(get_engine(write=True)) as db:
        db.connection()  # BEGIN IMMEDIATE before the project lock (see storage.py)
        project = db.get(Project, project_id)
        if project is None:
            raise ArchiveError("Project not found")
        base = project_path(project)
        with project_lock(project.id):
            sync_project_metadata(db, project)
            persist_project_metadata(db, project)
            db.commit()
        return base


def write_archive(project_id: str, target: IO[bytes]) -> None:
    """The project folder as a ZIP, written to ``target``."""
    base = _refresh_metadata(project_id)
    with (
        project_lock(project_id),
        zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive,
    ):
        for path, name in _archived_files(base):
            archive.write(path, name)


def archive_filename(project: Project) -> str:
    return "".join(c if c.isascii() and c.isalnum() else "_" for c in project.name) + ".zip"


# --- Backups --------------------------------------------------------------------------------


def backup_directory(project_id: str) -> Path:
    if not is_safe_path_segment(project_id):
        raise ArchiveError("Invalid project ID")
    return get_settings().backup_dir / project_id


def backups_enabled(project: Project) -> bool:
    return _enabled(project_path(project))


def _enabled(base: Path) -> bool:
    settings = read_json(
        base / "backup-settings.json",
        {"enabled": True},
        lambda value: isinstance(value, dict) and isinstance(value.get("enabled"), bool),
    )
    return settings["enabled"]


def set_backups_enabled(project: Project, enabled: bool) -> None:
    with project_lock(project.id):
        write_json(project_path(project) / "backup-settings.json", {"enabled": enabled})


def list_backups(project_id: str) -> list[dict[str, Any]]:
    """Newest first."""
    directory = backup_directory(project_id)
    if not directory.is_dir():
        return []
    found = []
    for file in directory.glob(_BACKUP_NAME):
        info = file.stat()
        created = datetime.fromtimestamp(info.st_mtime, UTC).isoformat(timespec="milliseconds")
        found.append({"name": file.name, "size": info.st_size, "created_at": created})
    return sorted(found, key=lambda b: b["name"], reverse=True)


def backup_file(project_id: str, name: str) -> Path | None:
    if not any(b["name"] == name for b in list_backups(project_id)):
        return None
    return backup_directory(project_id) / name


def create_backup(project_id: str, base: Path) -> str:
    """Write a new backup of the project in ``base`` and prune old ones. Returns its file
    name. The caller must not hold the database write lock."""
    directory = backup_directory(project_id)
    base = base.resolve()
    if directory.resolve() == base or directory.resolve().is_relative_to(base):
        raise ArchiveError("BACKUP_DIR must be outside the project folder")
    with _active_guard:
        if project_id in _active:
            raise ArchiveError("A backup is already running for this project")
        _active.add(project_id)
    stamp = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    name = f"backup-{stamp.replace(':', '-').replace('.', '-')}-{generate_id()}.zip"
    temporary = directory / f".{name}.tmp"
    try:
        directory.mkdir(parents=True, exist_ok=True)
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as output:
            write_archive(project_id, output)
            output.flush()
            os.fsync(output.fileno())
        temporary.rename(directory / name)
        for old in list_backups(project_id)[get_settings().backup_retention :]:
            (directory / old["name"]).unlink(missing_ok=True)
        return name
    finally:
        temporary.unlink(missing_ok=True)
        with _active_guard:
            _active.discard(project_id)


def run_due_backups() -> None:
    """One scheduler pass: back up each project whose newest backup is older than the
    interval, unless the owner turned backups off."""
    interval = get_settings().backup_interval
    with Session(get_engine()) as db:
        projects = [(p.id, project_path(p)) for p in db.exec(select(Project)).all()]
    for project_id, base in projects:
        try:
            if not base.is_dir() or not _enabled(base):
                continue
            newest = list_backups(project_id)[:1]
            if newest:
                last = (backup_directory(project_id) / newest[0]["name"]).stat().st_mtime
                if time.time() - last < interval:
                    continue
            create_backup(project_id, base)
        except Exception:  # one project's failure must not stop the others
            log.exception("Backup failed for project %s", project_id)


# --- Restoring ------------------------------------------------------------------------------


def _entry_parts(info: zipfile.ZipInfo) -> list[str]:
    name = info.filename
    parts = PurePosixPath(name.rstrip("/")).parts if name.rstrip("/") else ()
    mode = (info.external_attr >> 16) & 0o170000
    if (
        not parts
        or "\\" in name
        or name.startswith("/")
        or mode == stat.S_IFLNK
        or any(not is_safe_path_segment(p) or (p.startswith(".") and p != ".trash") for p in parts)
    ):
        raise ArchiveError("Unsafe or duplicate ZIP entry")
    return list(parts)


def extract_archive(zip_path: Path, destination: Path) -> None:
    """Unpack a project ZIP, refusing unsafe names, links, duplicates and archives past the
    limits (20,000 entries, 512 MB unpacked). The byte limit counts what is actually
    written, not what the headers claim."""
    try:
        archive = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as cause:
        raise ArchiveError("That file is not a ZIP archive") from cause
    with archive:
        entries = archive.infolist()
        if len(entries) > MAX_ENTRIES:
            raise ArchiveError("ZIP exceeds restore limits (20,000 files / 512 MB)")
        seen: set[str] = set()
        total = 0
        for info in entries:
            parts = _entry_parts(info)
            key = "/".join(parts)
            if key in seen:
                raise ArchiveError("Unsafe or duplicate ZIP entry")
            seen.add(key)
            total = _extract_entry(archive, info, destination.joinpath(*parts), total)


def _extract_entry(
    archive: zipfile.ZipFile, info: zipfile.ZipInfo, target: Path, total: int
) -> int:
    """Writes one entry; returns the running total of bytes written. Problems that come
    from the archive itself (a file where a folder must go, a name too long, encryption,
    corrupt data) are ArchiveErrors; other OS errors, like a full disk, are not."""
    try:
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            return total
        target.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as output, archive.open(info) as source:
            while chunk := source.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_EXTRACTED_BYTES:
                    raise ArchiveError("ZIP exceeds restore limits (20,000 files / 512 MB)")
                output.write(chunk)
        return total
    except (FileExistsError, NotADirectoryError, IsADirectoryError) as cause:
        raise ArchiveError("Unsafe or duplicate ZIP entry") from cause
    except OSError as cause:
        if cause.errno == errno.ENAMETOOLONG:
            raise ArchiveError("A file name in the ZIP is too long") from cause
        raise
    except RuntimeError as cause:  # zipfile raises this for encrypted entries
        raise ArchiveError("Encrypted ZIP archives cannot be restored") from cause
    except (zipfile.BadZipFile, EOFError, NotImplementedError, zlib.error) as cause:
        raise ArchiveError("The ZIP archive is damaged") from cause


def _set_project_id(file: Path, project_id: str) -> None:
    data = read_json(file, None, lambda value: isinstance(value, dict))
    if data is not None:
        write_json(file, {**data, "projectId": project_id})


def restore_project(db: Session, zip_path: Path, user_id: str) -> str:
    """A new project, owned by ``user_id``, from an exported or backed-up ZIP."""
    project_id = generate_id()
    directory = get_settings().data_dir / project_id
    directory.mkdir(parents=True)
    try:
        extract_archive(zip_path, directory)
        meta = read_json(
            directory / "project.json",
            {},
            lambda value: isinstance(value, dict) and isinstance(value.get("name"), str),
        )
        name = meta.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ArchiveError("ZIP must contain project.json at its root")
        now = iso_now()
        write_json(directory / "project.json", {**meta, "id": project_id, "modifiedAt": now})
        stories = directory / "stories"
        if stories.is_dir():
            for story in stories.iterdir():
                if (story / "story.json").is_file():
                    _set_project_id(story / "story.json", project_id)
        plotlines = directory / "plotlines"
        if plotlines.is_dir():
            for file in plotlines.glob("*.json"):
                _set_project_id(file, project_id)
        description = meta.get("description")
        project = Project(
            id=project_id,
            user_id=user_id,
            name=name.strip()[:1000],
            description=description if isinstance(description, str) else None,
            data_path=str(directory),
            created_at=now,
            modified_at=now,
        )
        db.add(project)
        db.flush()
        scan_project(db, project)  # loads metadata.json rows, indexes entities, commits
        with project_lock(project.id):
            persist_project_metadata(db, project)
            db.commit()
        return project_id
    except Exception as cause:
        db.rollback()
        # scan_project commits, so the project's rows may already be saved.
        leftover = db.get(Project, project_id)
        if leftover is not None:
            delete_project(db, leftover)
        shutil.rmtree(directory, ignore_errors=True)
        if isinstance(cause, StorageError):
            # Its message names the server path; say which file in the ZIP instead.
            name = Path(cause.file_path).name.split(".corrupt-")[0]
            raise ArchiveError(f"The ZIP's {name} cannot be read") from cause
        raise
