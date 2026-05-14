#!/usr/bin/env bash
# apply-upstream.sh — Copy upstream skill files then re-apply patches and local overrides.
#
# Usage:
#   bash apply-upstream.sh <skill_name> <upstream_skill_dir> <skills_dir> <patches_dir>
#
# Copies all files from the upstream skill dir into our installed skill dir,
# applies any patches we have for this skill, then applies configured local
# frontmatter overrides from patches/local-overrides.json.

set -euo pipefail

SKILL_NAME="${1:?Usage: apply-upstream.sh <skill_name> <upstream_dir> <skills_dir> <patches_dir>}"
UPSTREAM_SKILL_DIR="${2:?}"
SKILLS_DIR="${3:?}"
PATCHES_DIR="${4:?}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OVERRIDES_SCRIPT="$SCRIPT_DIR/apply-frontmatter-overrides.py"

TARGET_DIR="$SKILLS_DIR/$SKILL_NAME"

if [[ ! -d "$UPSTREAM_SKILL_DIR" ]]; then
  echo "ERROR: upstream dir not found: $UPSTREAM_SKILL_DIR"
  exit 1
fi

# Copy upstream files
echo "Copying upstream $SKILL_NAME..."
mkdir -p "$TARGET_DIR"
rsync -a --delete "$UPSTREAM_SKILL_DIR/" "$TARGET_DIR/"

# Apply patches
applied=0
failed=0
for patch_file in "$PATCHES_DIR"/"${SKILL_NAME}"__*.patch; do
  [[ -f "$patch_file" ]] || continue
  patch_basename=$(basename "$patch_file")
  # Derive the target file from the patch name
  # Format: skillname__path__to__file.ext.patch
  rel_path="${patch_basename#"${SKILL_NAME}"__}"
  rel_path="${rel_path%.patch}"
  rel_path="${rel_path//__//}"  # Convert __ back to /
  target_file="$TARGET_DIR/$rel_path"

  if [[ ! -f "$target_file" ]]; then
    echo "  SKIP: $rel_path (file no longer exists)"
    continue
  fi

  if patch --quiet --forward "$target_file" "$patch_file" 2>/dev/null; then
    echo "  PATCHED: $rel_path"
    applied=$((applied + 1))
  else
    echo "  CONFLICT: $rel_path — patch did not apply cleanly"
    failed=$((failed + 1))
  fi
done

# Apply local frontmatter overrides after patches so they are independent of
# upstream text changes and do not need one-line patch files.
if [[ -f "$TARGET_DIR/SKILL.md" && -f "$OVERRIDES_SCRIPT" ]]; then
  python3 "$OVERRIDES_SCRIPT" "$SKILL_NAME" "$TARGET_DIR/SKILL.md" "$PATCHES_DIR"
fi

echo "Result: $applied patched, $failed conflicts"
exit $failed
