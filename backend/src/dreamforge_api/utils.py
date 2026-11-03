import uuid
from datetime import UTC, datetime


def generate_id() -> str:
    return str(uuid.uuid4())


def iso_now(now: datetime | None = None) -> str:
    """An ISO timestamp in the same shape as JavaScript's Date.toISOString().

    Several columns are compared as strings (invite expiry, sort by modified time), so the
    format must match what the SvelteKit server writes exactly.
    """
    now = now or datetime.now(UTC)
    return now.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def unix_now() -> int:
    return int(datetime.now(UTC).timestamp())


def is_safe_path_segment(segment: object) -> bool:
    return (
        isinstance(segment, str)
        and len(segment) > 0
        and segment not in (".", "..")
        and not any(c in segment for c in "/\\\0")
    )


def safe_next(value: object, fallback: str = "/projects") -> str:
    """Only allow same-origin paths as a post-login redirect (open-redirect protection)."""
    if not isinstance(value, str) or not value.startswith("/") or value.startswith("//"):
        return fallback
    if any(c == "\\" or ord(c) <= 0x1F or ord(c) == 0x7F for c in value):
        return fallback
    return value
