#!/usr/bin/env bash
# make-patch.sh — Generate a patch file from the diff between upstream and our version.
#
# Usage:
#   bash make-patch.sh <skill_name> <rel_path> <upstream_file> <our_file> <patches_dir>
#
# Creates: <patches_dir>/<skill_name>__<rel_path>.patch

set -euo pipefail

SKILL_NAME="${1:?Usage: make-patch.sh <skill_name> <rel_path> <upstream_file> <our_file> <patches_dir>}"
REL_PATH="${2:?}"
UPSTREAM_FILE="${3:?}"
OUR_FILE="${4:?}"
PATCHES_DIR="${5:?}"

# Convert path separators to __ for flat patch filename
PATCH_NAME="${SKILL_NAME}__${REL_PATH//\//__}.patch"
PATCH_FILE="$PATCHES_DIR/$PATCH_NAME"

mkdir -p "$PATCHES_DIR"

if diff -q "$UPSTREAM_FILE" "$OUR_FILE" >/dev/null 2>&1; then
  echo "No difference — no patch needed"
  # Remove stale patch if exists
  rm -f "$PATCH_FILE"
  exit 0
fi

# Generate unified diff (patch format, from upstream to ours)
diff -u "$UPSTREAM_FILE" "$OUR_FILE" > "$PATCH_FILE" || true

echo "Created: $PATCH_FILE"
echo "Lines changed: $(grep -c '^[-+]' "$PATCH_FILE" | head -1)"
