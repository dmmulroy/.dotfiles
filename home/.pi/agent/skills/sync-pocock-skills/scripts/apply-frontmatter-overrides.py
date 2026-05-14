#!/usr/bin/env python3
"""Apply or strip local frontmatter overrides for synced Pocock skills.

Usage:
  apply-frontmatter-overrides.py <skill_name> <skill_md_file> <patches_dir> [--quiet]
  apply-frontmatter-overrides.py <skill_name> <skill_md_file> <patches_dir> --strip [--quiet]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def usage() -> None:
    print(
        "Usage: apply-frontmatter-overrides.py <skill_name> <skill_md_file> <patches_dir> [--strip] [--quiet]",
        file=sys.stderr,
    )


def yaml_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    # Keep simple scalar strings bare so existing frontmatter stays readable.
    if text and all(ch not in text for ch in "\n:#{}[],&*?|-<>=!%@`\"'"):
        return text
    return json.dumps(text, ensure_ascii=False)


def load_overrides(skill_name: str, patches_dir: Path) -> dict[str, Any]:
    config_path = patches_dir / "local-overrides.json"
    if not config_path.exists():
        return {}

    data = json.loads(config_path.read_text())
    frontmatter = data.get("frontmatter", {})
    preserve = frontmatter.get("preserve", {})
    overrides = preserve.get(skill_name, {})
    if not isinstance(overrides, dict):
        raise SystemExit(f"frontmatter.preserve.{skill_name} must be an object in {config_path}")
    return overrides


def read_frontmatter(skill_md: Path) -> tuple[str, bool, list[str], int]:
    if not skill_md.exists():
        raise SystemExit(f"SKILL.md not found: {skill_md}")

    original = skill_md.read_text()
    trailing_newline = original.endswith("\n")
    lines = original.splitlines()

    if not lines or lines[0] != "---":
        raise SystemExit(f"Expected YAML frontmatter in {skill_md}")

    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise SystemExit(f"Missing closing frontmatter marker in {skill_md}") from exc

    return original, trailing_newline, lines, end


def write_if_changed(skill_md: Path, original: str, trailing_newline: bool, lines: list[str]) -> bool:
    updated = "\n".join(lines) + ("\n" if trailing_newline else "")
    if updated == original:
        return False
    skill_md.write_text(updated)
    return True


def apply_overrides(skill_name: str, skill_md: Path, patches_dir: Path) -> bool:
    overrides = load_overrides(skill_name, patches_dir)
    if not overrides:
        return False

    original, trailing_newline, lines, end = read_frontmatter(skill_md)

    for key, value in overrides.items():
        desired = f"{key}: {yaml_scalar(value)}"
        existing_index = None
        for idx in range(1, end):
            if lines[idx].startswith(f"{key}:"):
                existing_index = idx
                break

        if existing_index is not None:
            lines[existing_index] = desired
            continue

        insert_at = end
        for idx in range(1, end):
            if lines[idx].startswith("description:"):
                insert_at = idx + 1
        lines.insert(insert_at, desired)
        end += 1

    return write_if_changed(skill_md, original, trailing_newline, lines)


def strip_overrides(skill_name: str, skill_md: Path, patches_dir: Path) -> bool:
    overrides = load_overrides(skill_name, patches_dir)
    if not overrides:
        return False

    original, trailing_newline, lines, end = read_frontmatter(skill_md)
    keys = set(overrides)
    stripped = [line for idx, line in enumerate(lines) if not (1 <= idx < end and line.split(":", 1)[0] in keys)]
    return write_if_changed(skill_md, original, trailing_newline, stripped)


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        usage()
        return 2

    skill_name = argv[1]
    skill_md = Path(argv[2])
    patches_dir = Path(argv[3])
    flags = set(argv[4:])
    allowed = {"--quiet", "--strip"}
    unknown = flags - allowed
    if unknown or len(flags) != len(argv[4:]):
        usage()
        return 2

    quiet = "--quiet" in flags
    strip = "--strip" in flags

    changed = strip_overrides(skill_name, skill_md, patches_dir) if strip else apply_overrides(skill_name, skill_md, patches_dir)
    if changed and not quiet:
        action = "STRIPPED" if strip else "OVERRIDE"
        print(f"  {action}: SKILL.md frontmatter")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
