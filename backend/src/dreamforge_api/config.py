"""Settings read from the environment, using the same variable names as the SvelteKit app."""

import os
from dataclasses import dataclass
from pathlib import Path

# backend/src/dreamforge_api/config.py -> repository root
REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    database_path: Path
    data_dir: Path
    admin_email: str
    admin_password: str | None
    allow_registration_env: bool
    origins: frozenset[str]
    frontend_dir: Path
    api_docs: bool
    body_size_limit: int
    backup_dir: Path
    backup_interval: int
    backup_retention: int

    @classmethod
    def from_env(cls) -> "Settings":
        cwd = Path.cwd()
        data_dir = Path(os.environ.get("DATA_DIR") or cwd / "data" / "projects").resolve()
        return cls(
            database_path=Path(
                os.environ.get("DATABASE_PATH") or cwd / "data" / "dreamforge.db"
            ).resolve(),
            data_dir=data_dir,
            admin_email=(os.environ.get("ADMIN_EMAIL") or "admin@dreamforge.local").strip().lower(),
            admin_password=os.environ.get("ADMIN_PASSWORD") or None,
            allow_registration_env=os.environ.get("PUBLIC_ALLOW_REGISTRATION") == "true",
            # Public URL(s), comma-separated, e.g. https://dreamforge.example. API writes whose
            # Origin header is not listed are refused. Unset: compare with the Host header.
            origins=frozenset(
                o.strip().rstrip("/") for o in os.environ.get("ORIGIN", "").split(",") if o.strip()
            ),
            # The SvelteKit static build. Defaults to <repo>/build when run from a checkout.
            # Interactive docs at /api/docs. On in development (scripts/run.js), off otherwise.
            api_docs=os.environ.get("API_DOCS") == "true",
            body_size_limit=int(os.environ.get("BODY_SIZE_LIMIT") or 20 * 1024 * 1024),
            frontend_dir=Path(os.environ.get("FRONTEND_DIR") or REPO_ROOT / "build").resolve(),
            # Automatic ZIP backups: BACKUP_DIR/<project id>/backup-*.zip. The default sits
            # beside the projects directory, as with the old server.
            backup_dir=Path(os.environ.get("BACKUP_DIR") or data_dir.parent / "backups").resolve(),
            backup_interval=max(60, _int(os.environ.get("BACKUP_INTERVAL"), 86400)),
            backup_retention=max(1, _int(os.environ.get("BACKUP_RETENTION"), 10)),
        )


def _int(value: str | None, default: int) -> int:
    """A positive whole number from the environment, else the default (as Number() || n)."""
    try:
        number = int(float(value)) if value else 0
    except ValueError:
        number = 0
    return number if number > 0 else default


def get_settings() -> Settings:
    # Read on every call so tests (and the CLI) can change the environment.
    return Settings.from_env()
