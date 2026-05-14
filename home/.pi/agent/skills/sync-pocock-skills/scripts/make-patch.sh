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
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OVERRIDES_SCRIPT="$SCRIPT_DIR/apply-frontmatter-overrides.py"

# Convert path separators to __ for flat patch filename
PATCH_NAME="${SKILL_NAME}__${REL_PATH//\//__}.patch"
PATCH_FILE="$PATCHES_DIR/$PATCH_NAME"

mkdir -p "$PATCHES_DIR"

COMPARE_OUR_FILE="$OUR_FILE"
TEMP_OUR_FILE=""
cleanup() {
  [[ -z "$TEMP_OUR_FILE" ]] || rm -f "$TEMP_OUR_FILE"
}
trap cleanup EXIT

# Frontmatter overrides are configured in local-overrides.json and applied by
# apply-upstream.sh after text patches. Strip them from our comparison copy so
# make-patch.sh does not generate one-line metadata patches.
if [[ "$REL_PATH" == "SKILL.md" && -f "$OVERRIDES_SCRIPT" ]]; then
  TEMP_OUR_FILE=$(mktemp)
  cp "$OUR_FILE" "$TEMP_OUR_FILE"
  python3 "$OVERRIDES_SCRIPT" "$SKILL_NAME" "$TEMP_OUR_FILE" "$PATCHES_DIR" --strip --quiet
  COMPARE_OUR_FILE="$TEMP_OUR_FILE"
fi

if diff -q "$UPSTREAM_FILE" "$COMPARE_OUR_FILE" >/dev/null 2>&1; then
  echo "No difference — no patch needed"
  # Remove stale patch if exists
  rm -f "$PATCH_FILE"
  exit 0
fi

# Generate unified diff (patch format, from upstream to ours). Use stable labels
# so regenerated patches do not churn on temp paths or timestamps.
diff -u \
  --label "upstream/$SKILL_NAME/$REL_PATH" \
  --label "ours/$SKILL_NAME/$REL_PATH" \
  "$UPSTREAM_FILE" \
  "$COMPARE_OUR_FILE" > "$PATCH_FILE" || true

echo "Created: $PATCH_FILE"
echo "Lines changed: $(grep -c '^[-+]' "$PATCH_FILE" | head -1)"
