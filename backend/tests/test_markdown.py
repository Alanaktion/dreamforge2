import json
from pathlib import Path

import pytest

from dreamforge_api.markdown import MarkdownError, load_yaml, parse_markdown, serialize_markdown

FIXTURES = Path(__file__).parent / "fixtures"


def test_reads_node_written_file_like_node_did():
    """node-entity.md was written by the old server's serializer; node-entity.json is what
    the JavaScript yaml package parsed it to. YAML 1.1 readers get several of these wrong."""
    text = (FIXTURES / "node-entity.md").read_text("utf-8")
    expected = json.loads((FIXTURES / "node-entity.json").read_text("utf-8"))
    frontmatter, body = parse_markdown(text)
    assert frontmatter == expected["frontmatter"]
    assert body == expected["body"]


def test_rewrites_node_written_file_byte_for_byte():
    text = (FIXTURES / "node-entity.md").read_text("utf-8")
    assert serialize_markdown(*parse_markdown(text)) == text


@pytest.mark.parametrize(
    ("source", "value"),
    [
        ("yes", "yes"),
        ("on", "on"),
        ("2024-01-01", "2024-01-01"),
        ("1:20", "1:20"),
        ("017", 17),
        ("0o17", 15),
        ("0x1F", 31),
        ("1e3", 1000),
        ("1.5", 1.5),
        ("True", True),
        ("~", None),
        ("1_000", "1_000"),
    ],
)
def test_yaml_core_schema(source, value):
    assert load_yaml(f"v: {source}") == {"v": value}


def test_rejects_bad_frontmatter():
    with pytest.raises(MarkdownError):
        parse_markdown("---\nid: x\n")
    with pytest.raises(MarkdownError):
        parse_markdown("---\n- a list\n---\n")
    bomb = "a: &a [x, x]\n" + "".join(f"b{i}: [*a, *a]\n" for i in range(60))
    with pytest.raises(MarkdownError):
        parse_markdown(f"---\n{bomb}---\n")


def test_no_frontmatter_and_crlf():
    assert parse_markdown("just text") == ({"id": "", "name": "", "type": "note"}, "just text")
    assert parse_markdown("﻿---\r\nid: a\r\n---\r\n\r\nbody") == ({"id": "a"}, "body")
