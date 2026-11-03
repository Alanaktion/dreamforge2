"""Markdown files with YAML frontmatter, ported from src/lib/server/markdown.ts.

The SvelteKit server read and wrote frontmatter with the JavaScript ``yaml`` package, which
follows YAML 1.2. PyYAML follows YAML 1.1, where ``yes``/``no``/``on`` are booleans,
``2024-01-01`` is a date, ``017`` is octal and ``1:20`` is a number. Project files written
by the old server must read back the same, so the loader and dumper here use the YAML 1.2
core schema instead. The dumper also indents block sequences and writes multi-line strings
as literal blocks, like the old output, so files don't churn when they are re-saved.
"""

import logging
import math
import re
from pathlib import Path
from typing import Any

import yaml
from yaml.composer import Composer
from yaml.constructor import SafeConstructor
from yaml.emitter import Emitter
from yaml.events import AliasEvent
from yaml.parser import Parser
from yaml.reader import Reader
from yaml.representer import SafeRepresenter
from yaml.resolver import BaseResolver
from yaml.scanner import Scanner
from yaml.serializer import Serializer

from .storage import write_file_atomic
from .utils import is_safe_path_segment

log = logging.getLogger(__name__)

MAX_ALIASES = 50  # same cap as the old parser, against alias "billion laughs" files


class Core12Resolver(BaseResolver):
    """YAML 1.2 core schema: only these plain scalars are anything but strings."""


Core12Resolver.add_implicit_resolver(
    "tag:yaml.org,2002:null", re.compile(r"^(?:~|null|Null|NULL|)$"), ["~", "n", "N", ""]
)
Core12Resolver.add_implicit_resolver(
    "tag:yaml.org,2002:bool",
    re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"),
    list("tTfF"),
)
Core12Resolver.add_implicit_resolver(
    "tag:yaml.org,2002:int",
    re.compile(r"^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$"),
    list("-+0123456789"),
)
Core12Resolver.add_implicit_resolver(
    "tag:yaml.org,2002:float",
    re.compile(
        r"^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?"
        r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$"
    ),
    list("-+0123456789."),
)


class Core12Constructor(SafeConstructor):
    def construct_yaml_int(self, node):
        value = str(self.construct_scalar(node))
        if value.startswith("0o"):
            return int(value[2:], 8)
        if value.startswith("0x"):
            return int(value[2:], 16)
        return int(value, 10)

    def construct_yaml_float(self, node):
        value = str(self.construct_scalar(node)).lower()
        if value.endswith(".inf"):
            return -math.inf if value.startswith("-") else math.inf
        if value == ".nan":
            return math.nan
        number = float(value)
        # JavaScript has one number type: 1e3 read and written back is 1000, not 1000.0.
        return int(number) if number.is_integer() else number


Core12Constructor.add_constructor("tag:yaml.org,2002:int", Core12Constructor.construct_yaml_int)
Core12Constructor.add_constructor("tag:yaml.org,2002:float", Core12Constructor.construct_yaml_float)


class _LimitedComposer(Composer):
    def compose_node(self, parent, index):
        if self.check_event(AliasEvent):
            self._aliases = getattr(self, "_aliases", 0) + 1
            if self._aliases > MAX_ALIASES:
                raise yaml.YAMLError("Too many aliases in frontmatter")
        return super().compose_node(parent, index)


class Loader(Reader, Scanner, Parser, _LimitedComposer, Core12Constructor, Core12Resolver):
    def __init__(self, stream):
        Reader.__init__(self, stream)
        Scanner.__init__(self)
        Parser.__init__(self)
        Composer.__init__(self)
        Core12Constructor.__init__(self)
        Core12Resolver.__init__(self)


class _Emitter(Emitter):
    def increase_indent(self, flow=False, indentless=False):
        # Indent "- item" under its key, like the JavaScript yaml package.
        return super().increase_indent(flow, False)

    def choose_scalar_style(self):
        # The old files quote with double quotes; PyYAML prefers single ones.
        # (The old writer still used single quotes for text containing double quotes.)
        style = super().choose_scalar_style()
        if style == "'" and '"' not in self.event.value:
            return '"'
        return style


class _Representer(SafeRepresenter):
    def represent_str(self, data):
        if "\n" in data:
            return self.represent_scalar("tag:yaml.org,2002:str", data, style="|")
        return super().represent_str(data)


_Representer.add_representer(str, _Representer.represent_str)


class Dumper(_Emitter, Serializer, _Representer, Core12Resolver):
    def __init__(self, stream, **kwargs):
        _Emitter.__init__(
            self,
            stream,
            canonical=None,
            indent=2,
            width=2**31 - 1,  # lineWidth: 0, never fold
            allow_unicode=True,
            line_break=None,
        )
        Serializer.__init__(self, encoding=kwargs.get("encoding"), explicit_start=False)
        _Representer.__init__(self, default_flow_style=False, sort_keys=False)
        Core12Resolver.__init__(self)


def load_yaml(text: str) -> Any:
    return yaml.load(text, Loader=Loader)  # noqa: S506 - Loader is a safe, restricted loader


def dump_yaml(value: Any) -> str:
    return yaml.dump(value, Dumper=Dumper)


class MarkdownError(ValueError):
    pass


_FRONTMATTER = re.compile(r"^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$")


def parse_markdown(content: str) -> tuple[dict[str, Any], str]:
    content = content.removeprefix("﻿").replace("\r\n", "\n")
    match = _FRONTMATTER.match(content)
    if not match:
        if content.startswith("---\n"):
            raise MarkdownError("Unclosed frontmatter")
        return {"id": "", "name": "", "type": "note"}, content
    try:
        frontmatter = load_yaml(match.group(1))
    except yaml.YAMLError as cause:
        raise MarkdownError(str(cause)) from cause
    if not isinstance(frontmatter, dict):
        raise MarkdownError("Frontmatter must be a mapping")
    body = match.group(2)
    return frontmatter, body[1:] if body.startswith("\n") else body


def serialize_markdown(frontmatter: dict[str, Any], body: str) -> str:
    values = {k: v for k, v in frontmatter.items() if k != "body"}
    return f"---\n{dump_yaml(values) if values else ''}---\n\n{body}"


def read_markdown_file(path: Path) -> tuple[dict[str, Any], str] | None:
    """The file's frontmatter and body, or None when it is missing or unreadable.

    A file without a valid ``id`` is unreadable too: ids become path segments and URLs.
    """
    try:
        frontmatter, body = parse_markdown(path.read_text("utf-8"))
        if not is_safe_path_segment(frontmatter.get("id")):
            raise MarkdownError("Missing or invalid id")
        return frontmatter, body
    except FileNotFoundError:
        return None
    except (OSError, UnicodeDecodeError, MarkdownError) as cause:
        log.error("Cannot read Markdown: %s (%s)", path, cause)
        return None


def write_markdown_file(path: Path, frontmatter: dict[str, Any], body: str) -> None:
    write_file_atomic(path, serialize_markdown(frontmatter, body))
