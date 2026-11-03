"""In-memory attempt limiter, as in src/lib/server/loginThrottle.ts (10 tries per 15 minutes)."""

import threading
import time

WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS = 10

_attempts: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()


def allow_attempt(key: str, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    with _lock:
        for k in [k for k, (_, expires) in _attempts.items() if expires <= now]:
            del _attempts[k]
        count, expires = _attempts.get(key, (0, now + WINDOW_SECONDS))
        if count >= MAX_ATTEMPTS:
            return False
        _attempts[key] = (count + 1, expires)
        return True


def reset() -> None:
    with _lock:
        _attempts.clear()
