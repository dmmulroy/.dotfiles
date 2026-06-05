#!/usr/bin/env bash
# install-new.sh — Install a new upstream skill and apply local overrides.
#
# Usage:
#   bash install-new.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>

set -euo pipefail

SKILL_NAME="${1:?Usage: install-new.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>}"
UPSTREAM_SKILL_DIR="${2:?}"
SKILLS_DIR="${3:?}"
PATCHES_DIR="${4:?}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPLY_SCRIPT="$SCRIPT_DIR/apply-upstream.sh"

if [[ ! -d "$UPSTREAM_SKILL_DIR" ]]; then
  echo "ERROR: upstream dir not found: $UPSTREAM_SKILL_DIR"
  exit 1
fi

bash "$APPLY_SCRIPT" "$SKILL_NAME" "$UPSTREAM_SKILL_DIR" "$SKILLS_DIR" "$PATCHES_DIR"

echo "INSTALLED: $SKILL_NAME"
