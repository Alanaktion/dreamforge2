"""Markdown to safe HTML for exports, ported from src/lib/server/renderMarkdown.ts."""

import re

import nh3
from markdown_it import MarkdownIt

_md = MarkdownIt("commonmark", {"html": True}).enable(["table", "strikethrough"])
_MENTION = re.compile(r"\[@([^\]]+)\]\(mention://[^)]*\)")


def strip_mentions(markdown: str) -> str:
    """Mentions are ``[@Label](mention://type/id)``. The link means nothing outside the app,
    so exported prose keeps the label and drops the link."""
    return _MENTION.sub(r"\1", markdown)


def render_markdown(markdown: str | None) -> str:
    """Bodies can contain inline HTML, so the result is sanitized."""
    if not markdown or not markdown.strip():
        return ""
    return nh3.clean(_md.render(strip_mentions(markdown)))
