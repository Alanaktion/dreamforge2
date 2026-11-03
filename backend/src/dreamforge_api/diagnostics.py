"""Project files that cannot be read, so the app can say which ones need repair.

Ported from src/lib/server/diagnostics.ts. Readers report a problem when a file fails and
clear it when the file reads again. The list is in memory, like before: a restart forgets
it until the next scan finds the file again.
"""

import threading
from pathlib import Path

_problems: dict[str, str] = {}
_lock = threading.Lock()


def report_file_problem(path: Path | str, message: str | None = None) -> None:
    """Record a problem with ``path``, or clear it when ``message`` is None."""
    key = str(Path(path).resolve())
    with _lock:
        if message:
            _problems[key] = message
        else:
            _problems.pop(key, None)


def project_problems(project_path: Path | str) -> list[dict[str, str]]:
    """Problems under the project folder, with paths relative to it. Files that are gone
    since they were reported are dropped (there is no file watcher to notice deletes)."""
    base = Path(project_path).resolve()
    found = []
    with _lock:
        for key in sorted(_problems):
            path = Path(key)
            if not path.is_relative_to(base):
                continue
            if not path.exists():
                del _problems[key]
                continue
            found.append({"file": path.relative_to(base).as_posix(), "message": _problems[key]})
    return found


def reset() -> None:
    with _lock:
        _problems.clear()
