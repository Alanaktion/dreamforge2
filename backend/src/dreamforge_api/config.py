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

    @classmethod
    def from_env(cls) -> "Settings":
        cwd = Path.cwd()
        return cls(
            database_path=Path(
                os.environ.get("DATABASE_PATH") or cwd / "data" / "dreamforge.db"
            ).resolve(),
            data_dir=Path(os.environ.get("DATA_DIR") or cwd / "data" / "projects").resolve(),
            admin_email=(os.environ.get("ADMIN_EMAIL") or "admin@dreamforge.local").strip().lower(),
            admin_password=os.environ.get("ADMIN_PASSWORD") or None,
            allow_registration_env=os.environ.get("PUBLIC_ALLOW_REGISTRATION") == "true",
            # Public URL(s), comma-separated, e.g. https://dreamforge.example. API writes whose
            # Origin header is not listed are refused. Unset: compare with the Host header.
            origins=frozenset(
                o.strip().rstrip("/") for o in os.environ.get("ORIGIN", "").split(",") if o.strip()
            ),
            # The SvelteKit static build. Defaults to <repo>/build when run from a checkout.
            frontend_dir=Path(os.environ.get("FRONTEND_DIR") or REPO_ROOT / "build").resolve(),
        )


def get_settings() -> Settings:
    # Read on every call so tests (and the CLI) can change the environment.
    return Settings.from_env()
