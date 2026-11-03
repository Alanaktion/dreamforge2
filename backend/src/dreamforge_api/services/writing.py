"""Word counts and the writing log, ported from src/lib/utils/wordCount.ts and
src/lib/server/writingLog.ts.

``writing-log.json`` keeps the words written per day (net of deletions), the daily goal,
and per-story word targets.
"""

import math
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from ..storage import StorageError, project_lock, read_json, write_json

LOG_FILE = "writing-log.json"
KEEP_DAYS = 400
RECENT_DAYS = 14
DEFAULT_DAILY_GOAL = 500

_STRIP = [
    (re.compile(r"```[\s\S]*?```"), " "),
    (re.compile(r"`[^`]*`"), " "),
    (re.compile(r"<[^>]*>"), " "),
    (re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "),
    (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"),
    (re.compile(r"^\s{0,3}#{1,6}\s+", re.M), " "),
    (re.compile(r"^\s{0,3}>\s?", re.M), " "),
    (re.compile(r"^\s*[-*+]\s+", re.M), " "),
    (re.compile(r"^\s*\d+\.\s+", re.M), " "),
    (re.compile(r"^\s*([-*_])\s*(\1\s*){2,}$", re.M), " "),
    (re.compile(r"[*_~]"), " "),
    (re.compile(r"&[a-z]+;|&#\d+;", re.I), " "),
]
# A letter or digit, then letters, digits, apostrophes and hyphens ([^\W_] is \w less "_").
_WORD = re.compile(r"[^\W_](?:[^\W_]|['’-])*")


def count_words(text: str | None) -> int:
    """Words in a Markdown/HTML body, with markup stripped so it doesn't count."""
    if not text:
        return 0
    for pattern, replacement in _STRIP:
        text = pattern.sub(replacement, text)
    return len(_WORD.findall(text))


def day_key(day: date | None = None) -> str:
    """Server-local YYYY-MM-DD: writers think in their own day, not UTC."""
    return (day or datetime.now().date()).isoformat()


def _shift(key: str, days: int) -> str:
    return (date.fromisoformat(key) + timedelta(days=days)).isoformat()


def _path(base: Path) -> Path:
    return base / LOG_FILE


def _valid(value: Any) -> bool:
    def numbers(entries: Any) -> bool:
        return isinstance(entries, dict) and all(
            isinstance(v, int | float) and not isinstance(v, bool) and math.isfinite(v)
            for v in entries.values()
        )

    return (
        isinstance(value, dict)
        and isinstance(value.get("dailyGoal"), int | float)
        and not isinstance(value.get("dailyGoal"), bool)
        and value["dailyGoal"] >= 0
        and numbers(value.get("days"))
        and numbers(value.get("storyTargets"))
    )


def read_log(base: Path) -> dict[str, Any]:
    return read_json(
        _path(base), {"dailyGoal": DEFAULT_DAILY_GOAL, "storyTargets": {}, "days": {}}, _valid
    )


def record_words(base: Path, project_id: str, delta: int, today: date | None = None) -> None:
    """Add ``delta`` words to today. Deletions count against the day (net progress), but a
    day never goes below zero, so a big cut doesn't hide the next day's work."""
    if delta == 0:
        return
    with project_lock(project_id):
        log = read_log(base)
        key = day_key(today)
        log["days"][key] = max(0, log["days"].get(key, 0) + delta)
        cutoff = _shift(key, -KEEP_DAYS)
        log["days"] = {k: v for k, v in log["days"].items() if k >= cutoff}
        write_json(_path(base), log)


def set_story_target(base: Path, project_id: str, story_id: str, target: float) -> None:
    with project_lock(project_id):
        log = read_log(base)
        if target > 0:
            log["storyTargets"][story_id] = round(target)
        else:
            log["storyTargets"].pop(story_id, None)
        write_json(_path(base), log)


def set_daily_goal(base: Path, project_id: str, goal: float) -> None:
    with project_lock(project_id):
        log = read_log(base)
        log["dailyGoal"] = max(0, round(goal))
        write_json(_path(base), log)


def get_progress(base: Path, today: date | None = None, *, lenient: bool = False) -> dict[str, Any]:
    """``lenient`` shows an unreadable log as empty instead of failing the page."""
    try:
        log = read_log(base)
    except StorageError:
        if not lenient:
            raise
        log = {"dailyGoal": DEFAULT_DAILY_GOAL, "storyTargets": {}, "days": {}}
    days: dict[str, float] = log["days"]
    key = day_key(today)
    recent = [
        {"date": d, "words": days.get(d, 0)}
        for d in (_shift(key, -i) for i in range(RECENT_DAYS - 1, -1, -1))
    ]
    total30 = sum(days.get(_shift(key, -i), 0) for i in range(30))
    # A streak survives an unwritten today (the day isn't over), but not an unwritten yesterday.
    streak = 0
    cursor = key if days.get(key, 0) > 0 else _shift(key, -1)
    while days.get(cursor, 0) > 0:
        streak += 1
        cursor = _shift(cursor, -1)
    return {
        "daily_goal": log["dailyGoal"],
        "story_targets": log["storyTargets"],
        "today_words": days.get(key, 0),
        "streak": streak,
        "best": max(days.values(), default=0),
        "total30": total30,
        "recent": recent,
    }
