#!/usr/bin/env python3
"""Render repository documentation from docs/src templates.

Templates in ``docs/src/`` use ``{{ include:partials/<name>.md }}`` directives
to compose shared partials into the rendered output. Run ``--write`` to
regenerate the tracked docs and ``--check`` in CI to fail if they are stale.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

DOCS_SRC = Path("docs/src")
GENERATED_HEADER = (
    "<!-- Generated from docs/src. Run `make docs-build` to update. "
    "Do not edit directly. -->"
)

INCLUDE_RE = re.compile(r"{{\s*include:([^}]+)\s*}}")

# Template path (relative to DOCS_SRC) -> output path (relative to repo root).
# AGENTS.md is hand-maintained and deliberately not rendered here.
TEMPLATES: dict[Path, tuple[Path, ...]] = {
    Path("README.md"): (Path("README.md"),),
    Path("fastapi/README.md"): (Path("fastapi/README.md"),),
    Path("frontend/README.md"): (Path("frontend/README.md"),),
}


def render_template(root: Path, template: Path) -> str:
    template_path = root / DOCS_SRC / template
    text = template_path.read_text(encoding="utf-8")

    def include(match: re.Match[str]) -> str:
        include_path = root / DOCS_SRC / match.group(1).strip()
        return include_path.read_text(encoding="utf-8").strip()

    # Re-run includes until none remain so partials may include other partials.
    for _ in range(10):
        new_text = INCLUDE_RE.sub(include, text)
        if new_text == text:
            break
        text = new_text
    else:
        raise RuntimeError(f"include depth exceeded rendering {template_path}")

    return f"{GENERATED_HEADER}\n\n{text.rstrip()}\n"


def rendered_files(root: Path) -> dict[Path, str]:
    out: dict[Path, str] = {}
    for template, outputs in TEMPLATES.items():
        rendered = render_template(root, template)
        for output in outputs:
            out[output] = rendered
    return out


def write_files(root: Path, expected: dict[Path, str]) -> None:
    for relative_path, rendered in expected.items():
        path = root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")


def stale_files(root: Path, expected: dict[Path, str]) -> list[Path]:
    stale = []
    for relative_path, rendered in expected.items():
        path = root / relative_path
        if not path.exists() or path.read_text(encoding="utf-8") != rendered:
            stale.append(relative_path)
    return stale


def check_files(root: Path, expected: dict[Path, str]) -> int:
    stale = stale_files(root, expected)
    if not stale:
        return 0
    print("Generated docs are stale. Run `make docs-build`.", file=sys.stderr)
    for path in stale:
        print(f"  - {path}", file=sys.stderr)
    return 1


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="write rendered docs")
    mode.add_argument("--check", action="store_true", help="fail if docs are stale")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help=argparse.SUPPRESS,
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    root = args.root.resolve()
    expected = rendered_files(root)
    if args.write:
        write_files(root, expected)
        return 0
    return check_files(root, expected)


if __name__ == "__main__":
    raise SystemExit(main())
