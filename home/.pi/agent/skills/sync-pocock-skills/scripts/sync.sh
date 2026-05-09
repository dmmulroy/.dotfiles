#!/usr/bin/env bash
# sync.sh — Deterministic portion of the pocock skills sync.
#
# Clones upstream, compares against our installed skills, applies patches,
# and scans for patterns that need new patches.
#
# Usage:
#   bash sync.sh <skills_dir> <patches_dir>
#
# Output: structured report on stdout for the agent to parse.
# Exit 0 = success, exit 1 = clone failure.

set -euo pipefail

SKILLS_DIR="${1:?Usage: sync.sh <skills_dir> <patches_dir>}"
PATCHES_DIR="${2:?Usage: sync.sh <skills_dir> <patches_dir>}"
UPSTREAM_REPO="https://github.com/mattpocock/skills.git"
WORK_DIR=$(mktemp -d)
UPSTREAM_DIR="$WORK_DIR/upstream"

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

# --- Exclusions: skills we deliberately don't sync ---
EXCLUDED_FILE="$PATCHES_DIR/excluded.txt"

is_excluded() {
  local name=$1
  [[ -f "$EXCLUDED_FILE" ]] || return 1
  grep -qxF "$name" "$EXCLUDED_FILE" 2>/dev/null
}

# --- Clone upstream ---
echo "STATUS: cloning upstream"
if ! git clone --depth 1 --quiet "$UPSTREAM_REPO" "$UPSTREAM_DIR" 2>/dev/null; then
  echo "ERROR: failed to clone $UPSTREAM_REPO"
  exit 1
fi
echo "STATUS: clone complete"

# --- Discover upstream skills (skip deprecated, in-progress, personal) ---
# Write to temp file: <name>\t<path>
UPSTREAM_LIST="$WORK_DIR/upstream_skills.txt"
find "$UPSTREAM_DIR/skills/" -name "SKILL.md" \
  -not -path "*/deprecated/*" \
  -not -path "*/in-progress/*" \
  -not -path "*/personal/*" 2>/dev/null | sort | while IFS= read -r skill_md; do
  skill_dir=$(dirname "$skill_md")
  skill_name=$(basename "$skill_dir")
  printf '%s\t%s\n' "$skill_name" "$skill_dir"
done > "$UPSTREAM_LIST"

get_upstream_path() {
  local name=$1
  awk -F'\t' -v n="$name" '$1 == n { print $2; exit }' "$UPSTREAM_LIST"
}

# --- Discover our installed skills (excluding non-pocock ones) ---
OUR_LIST="$WORK_DIR/our_skills.txt"
for dir in "$SKILLS_DIR"/*/; do
  dir="${dir%/}"  # strip trailing slash
  [[ -f "$dir/SKILL.md" ]] || continue
  name=$(basename "$dir")
  # Skip non-pocock skills
  case "$name" in
    tmux|sync-pocock-skills|write-a-skill) continue ;;
  esac
  printf '%s\t%s\n' "$name" "$dir"
done > "$OUR_LIST"

get_our_path() {
  local name=$1
  awk -F'\t' -v n="$name" '$1 == n { print $2; exit }' "$OUR_LIST"
}

# --- Section 1: New upstream skills ---
echo ""
echo "=== NEW_SKILLS ==="
while IFS=$'\t' read -r name upstream_path; do
  our_path=$(get_our_path "$name")
  if [[ -z "$our_path" ]] && ! is_excluded "$name"; then
    category=$(echo "$upstream_path" | sed "s|$UPSTREAM_DIR/skills/||" | cut -d/ -f1)
    desc=$(grep -m1 '^description:' "$upstream_path/SKILL.md" 2>/dev/null | sed 's/^description: //' || echo "(no description)")
    echo "NEW: $name | category=$category | $desc"
  fi
done < "$UPSTREAM_LIST"

# --- Section 2: Upstream changes to our skills ---
echo ""
echo "=== UPSTREAM_CHANGES ==="
while IFS=$'\t' read -r name our_path; do
  upstream_path=$(get_upstream_path "$name")
  [[ -z "$upstream_path" ]] && continue

  # Compare all files in the upstream skill dir against ours
  changed_files=()
  while IFS= read -r upstream_file; do
    rel_path="${upstream_file#"$upstream_path"/}"
    our_file="$our_path/$rel_path"

    if [[ ! -f "$our_file" ]]; then
      changed_files+=("$rel_path (new file upstream)")
    elif ! diff -q "$upstream_file" "$our_file" >/dev/null 2>&1; then
      # Check if the diff is ONLY our patches or also has upstream changes
      patch_file="$PATCHES_DIR/${name}__${rel_path//\//__}.patch"
      if [[ -f "$patch_file" ]]; then
        # Reverse-apply our patch to get what upstream should look like,
        # then compare against actual upstream
        patched_tmp="$WORK_DIR/patched_check"
        cp "$our_file" "$patched_tmp"
        if patch -R --quiet "$patched_tmp" "$patch_file" 2>/dev/null; then
          if ! diff -q "$upstream_file" "$patched_tmp" >/dev/null 2>&1; then
            changed_files+=("$rel_path (upstream changed, has patch)")
          fi
          # else: only our patch differs — no upstream change, skip
        else
          changed_files+=("$rel_path (patch conflict)")
        fi
        rm -f "$patched_tmp"
      else
        changed_files+=("$rel_path (changed, no patch)")
      fi
    fi
  done < <(find "$upstream_path" -type f | sort)

  # Check for files we have that upstream removed
  while IFS= read -r our_file; do
    rel_path="${our_file#"$our_path"/}"
    upstream_file="$upstream_path/$rel_path"
    [[ -f "$upstream_file" ]] || changed_files+=("$rel_path (removed upstream)")
  done < <(find "$our_path" -type f | sort)

  if [[ ${#changed_files[@]} -gt 0 ]]; then
    echo "CHANGED: $name"
    for f in "${changed_files[@]}"; do
      echo "  - $f"
    done
  fi
done < "$OUR_LIST"

# --- Section 3: Scan for Claude Code / sub-agent patterns needing patches ---
echo ""
echo "=== UNPATCHED_PATTERNS ==="
PATTERNS='sub.agent|subagent|Agent tool|spawn.*agent|subagent_type'
while IFS=$'\t' read -r name our_path; do
  while IFS= read -r file; do
    rel_path="${file#"$our_path"/}"
    patch_file="$PATCHES_DIR/${name}__${rel_path//\//__}.patch"
    # Skip files that already have a patch
    [[ -f "$patch_file" ]] && continue
    matches=$(grep -niE "$PATTERNS" "$file" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      echo "UNPATCHED: $name/$rel_path"
      echo "$matches" | while IFS= read -r line; do
        echo "  $line"
      done
    fi
  done < <(find "$our_path" -name "*.md" -o -name "*.sh" | sort)
done < "$OUR_LIST"

# --- Section 4: Upstream dir for agent to read ---
echo ""
echo "=== UPSTREAM_DIR ==="
echo "$UPSTREAM_DIR/skills/"

echo ""
echo "STATUS: sync analysis complete"
