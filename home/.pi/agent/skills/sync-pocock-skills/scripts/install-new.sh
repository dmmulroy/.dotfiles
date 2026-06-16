#!/usr/bin/env bash
# install-new.sh — Install a new upstream skill and report pi patch follow-ups.
#
# Usage:
#   bash install-new.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>
#
# Copies the upstream skill, applies any configured patches/local overrides, then
# scans the installed files for Claude Code / sub-agent patterns that need pi
# patches.

set -euo pipefail

SKILL_NAME="${1:?Usage: install-new.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>}"
UPSTREAM_SKILL_DIR="${2:?}"
SKILLS_DIR="${3:?}"
PATCHES_DIR="${4:?}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPLY_SCRIPT="$SCRIPT_DIR/apply-upstream.sh"
TARGET_DIR="$SKILLS_DIR/$SKILL_NAME"

if [[ ! -d "$UPSTREAM_SKILL_DIR" ]]; then
  echo "ERROR: upstream dir not found: $UPSTREAM_SKILL_DIR"
  exit 1
fi

bash "$APPLY_SCRIPT" "$SKILL_NAME" "$UPSTREAM_SKILL_DIR" "$SKILLS_DIR" "$PATCHES_DIR"

echo "INSTALLED: $SKILL_NAME"

PATTERNS='sub.agent|subagent|Agent tool|spawn.*agent|subagent_type|^[[:space:]-]*If.*CLAUDE\.md.*exists|prefer.*CLAUDE\.md|CLAUDE\.md.*first'
found=0
while IFS= read -r file; do
  rel_path="${file#"$TARGET_DIR"/}"
  # Scan the installed result even when a patch exists. A patch may handle one
  # hunk while a later upstream release adds another pattern in the same file.
  matches=$(grep -niE "$PATTERNS" "$file" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    if [[ "$found" -eq 0 ]]; then
      echo "PATTERNS: review these for pi patches"
    fi
    found=1
    echo "UNPATCHED: $SKILL_NAME/$rel_path"
    echo "$matches" | while IFS= read -r line; do
      echo "  $line"
    done
  fi
done < <(find "$TARGET_DIR" \( -name "*.md" -o -name "*.sh" \) | sort)

if [[ "$found" -eq 0 ]]; then
  echo "PATTERNS: none"
fi
