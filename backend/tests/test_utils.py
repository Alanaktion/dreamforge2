import pytest

from dreamforge_api.utils import iso_now, safe_next


@pytest.mark.parametrize(
    "value,expected",
    [
        ("/projects/abc", "/projects/abc"),
        ("/invite/x?invite=x", "/invite/x?invite=x"),
        ("//evil.example", "/projects"),
        ("/\\evil.example", "/projects"),
        ("https://evil.example", "/projects"),
        ("/ok\nSet-Cookie: x", "/projects"),
        (None, "/projects"),
    ],
)
def test_safe_next(value, expected):
    assert safe_next(value) == expected


def test_iso_now_matches_javascript_format():
    value = iso_now()
    assert value.endswith("Z") and len(value) == len("2026-11-03T06:50:40.123Z")
