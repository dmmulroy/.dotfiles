#!/usr/bin/env bash
# sync.sh — Deterministic portion of the pocock skills sync.
#
# Clones upstream, compares against our installed skills, applies configured
# local overrides, and scans for patterns that need new patches.
#
# Usage:
#   bash sync.sh <skills_dir> <patches_dir> [--ref <git-ref>] [--keep-upstream] [--upstream-dir <dir>]
#
# Output: structured report on stdout for the agent to parse.
# Exit 0 = success, exit 1 = clone failure.

set -euo pipefail

usage() {
  echo "Usage: sync.sh <skills_dir> <patches_dir> [--ref <git-ref>] [--keep-upstream] [--upstream-dir <dir>]" >&2
}

[[ $# -ge 2 ]] || { usage; exit 2; }

SKILLS_DIR="$1"
PATCHES_DIR="$2"
shift 2

KEEP_UPSTREAM=0
REQUESTED_UPSTREAM_DIR=""
UPSTREAM_REF=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      UPSTREAM_REF="$2"
      shift 2
      ;;
    --keep-upstream)
      KEEP_UPSTREAM=1
      shift
      ;;
    --upstream-dir)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      REQUESTED_UPSTREAM_DIR="$2"
      KEEP_UPSTREAM=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

UPSTREAM_REPO="https://github.com/mattpocock/skills.git"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OVERRIDES_SCRIPT="$SCRIPT_DIR/apply-frontmatter-overrides.py"
LOCAL_ONLY_FILE="$PATCHES_DIR/local-only.txt"
MIGRATIONS_FILE="$PATCHES_DIR/upstream-migrations.tsv"

if [[ -n "$REQUESTED_UPSTREAM_DIR" ]]; then
  WORK_DIR=$(mktemp -d)
  UPSTREAM_DIR="$REQUESTED_UPSTREAM_DIR"
elif [[ "$KEEP_UPSTREAM" -eq 1 ]]; then
  WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/pocock-skills-sync.XXXXXX")
  UPSTREAM_DIR="$WORK_DIR/upstream"
else
  WORK_DIR=$(mktemp -d)
  UPSTREAM_DIR="$WORK_DIR/upstream"
fi

cleanup() {
  if [[ "$KEEP_UPSTREAM" -eq 1 ]]; then
    # Keep the clone for follow-up reads. Remove only temp files if the clone
    # lives outside WORK_DIR via --upstream-dir.
    if [[ -n "$REQUESTED_UPSTREAM_DIR" ]]; then
      rm -rf "$WORK_DIR"
    fi
  else
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

# --- Exclusions: skills we deliberately don't sync ---
EXCLUDED_FILE="$PATCHES_DIR/excluded.txt"

list_contains() {
  local file=$1
  local name=$2
  [[ -f "$file" ]] || return 1
  grep -vE '^[[:space:]]*(#|$)' "$file" | grep -qxF "$name" 2>/dev/null
}

is_excluded() {
  list_contains "$EXCLUDED_FILE" "$1"
}

is_local_only() {
  list_contains "$LOCAL_ONLY_FILE" "$1"
}

apply_local_overrides_quiet() {
  local skill_name=$1
  local rel_path=$2
  local file=$3

  [[ "$rel_path" == "SKILL.md" ]] || return 0
  [[ -f "$OVERRIDES_SCRIPT" ]] || return 0
  python3 "$OVERRIDES_SCRIPT" "$skill_name" "$file" "$PATCHES_DIR" --quiet
}

# --- Clone upstream ---
echo "STATUS: cloning upstream"
if [[ -n "$REQUESTED_UPSTREAM_DIR" ]]; then
  rm -rf "$UPSTREAM_DIR"
  mkdir -p "$(dirname "$UPSTREAM_DIR")"
fi
clone_args=(--depth 1 --quiet)
[[ -z "$UPSTREAM_REF" ]] || clone_args+=(--branch "$UPSTREAM_REF")
if ! git clone "${clone_args[@]}" "$UPSTREAM_REPO" "$UPSTREAM_DIR" 2>/dev/null; then
  echo "ERROR: failed to clone $UPSTREAM_REPO${UPSTREAM_REF:+ at $UPSTREAM_REF}"
  exit 1
fi
RESOLVED_COMMIT=$(git -C "$UPSTREAM_DIR" rev-parse HEAD)
echo "STATUS: clone complete"
echo "STATUS: upstream ref=${UPSTREAM_REF:-default branch} commit=$RESOLVED_COMMIT"

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
  # Skip skills explicitly declared local-only. Upstream exclusions are not
  # skipped here: an installed upstream skill may later be removed or renamed.
  is_local_only "$name" && continue
  printf '%s\t%s\n' "$name" "$dir"
done > "$OUR_LIST"

get_our_path() {
  local name=$1
  awk -F'\t' -v n="$name" '$1 == n { print $2; exit }' "$OUR_LIST"
}

upstream_depends_on() {
  local source_name=$1
  local dependency_name=$2
  local source_path
  source_path=$(get_upstream_path "$source_name")
  [[ -n "$source_path" ]] || return 1
  grep -rhoE '`/[a-z0-9-]+`' "$source_path"/*.md 2>/dev/null \
    | tr -d '`/' \
    | grep -qxF "$dependency_name"
}

required_by_installed() {
  local dependency_name=$1
  local requiring=()
  local source_name source_path
  while IFS=$'\t' read -r source_name source_path; do
    if upstream_depends_on "$source_name" "$dependency_name"; then
      requiring+=("$source_name")
    fi
  done < "$OUR_LIST"
  local IFS=,
  echo "${requiring[*]}"
}

missing_dependencies_of() {
  local source_name=$1
  local missing=()
  local dependency_name dependency_path
  while IFS=$'\t' read -r dependency_name dependency_path; do
    [[ "$dependency_name" == "$source_name" ]] && continue
    [[ -n "$(get_our_path "$dependency_name")" ]] && continue
    if upstream_depends_on "$source_name" "$dependency_name"; then
      missing+=("$dependency_name")
    fi
  done < "$UPSTREAM_LIST"
  local IFS=,
  echo "${missing[*]}"
}

# --- Section 1: New upstream skills ---
echo ""
echo "=== NEW_SKILLS ==="
while IFS=$'\t' read -r name upstream_path; do
  our_path=$(get_our_path "$name")
  if [[ -z "$our_path" ]] && ! is_excluded "$name"; then
    category=$(echo "$upstream_path" | sed "s|$UPSTREAM_DIR/skills/||" | cut -d/ -f1)
    desc=$(grep -m1 '^description:' "$upstream_path/SKILL.md" 2>/dev/null | sed 's/^description: //' || echo "(no description)")
    required_by=$(required_by_installed "$name")
    missing_dependencies=$(missing_dependencies_of "$name")
    dependency_note=""
    [[ -z "$required_by" ]] || dependency_note+=" | required_by=$required_by"
    [[ -z "$missing_dependencies" ]] || dependency_note+=" | missing_dependencies=$missing_dependencies"
    echo "NEW: $name | category=$category$dependency_note | $desc"
  fi
done < "$UPSTREAM_LIST"

# --- Section 2: Installed skills removed, renamed, or replaced upstream ---
echo ""
echo "=== LIFECYCLE_CHANGES ==="
while IFS=$'\t' read -r name our_path; do
  [[ -n "$(get_upstream_path "$name")" ]] && continue

  migration=""
  if [[ -f "$MIGRATIONS_FILE" ]]; then
    migration=$(awk -F'\t' -v n="$name" '$1 == n { print; exit }' "$MIGRATIONS_FILE")
  fi

  if [[ -n "$migration" ]]; then
    IFS=$'\t' read -r old_name new_name kind release note <<< "$migration"
    case "$kind" in
      renamed) echo "RENAMED: $old_name -> $new_name | release=$release | $note" ;;
      replaced) echo "REPLACED: $old_name -> $new_name | release=$release | $note" ;;
      removed) echo "REMOVED: $old_name | release=$release | $note" ;;
      *) echo "MISSING_UPSTREAM: $name | invalid migration kind=$kind" ;;
    esac
  else
    echo "MISSING_UPSTREAM: $name | no migration recorded"
  fi
done < "$OUR_LIST"

# --- Section 3: Missing dependencies of installed skills ---
echo ""
echo "=== DEPENDENCY_GAPS ==="
while IFS=$'\t' read -r dependency_name dependency_path; do
  [[ -n "$(get_our_path "$dependency_name")" ]] && continue
  required_by=$(required_by_installed "$dependency_name")
  [[ -z "$required_by" ]] || echo "MISSING: $dependency_name | required_by=$required_by"
done < "$UPSTREAM_LIST"

# --- Section 4: Upstream changes to our skills ---
echo ""
echo "=== UPSTREAM_CHANGES ==="
while IFS=$'\t' read -r name our_path; do
  upstream_path=$(get_upstream_path "$name")
  [[ -z "$upstream_path" ]] && continue

  # Compare all files in the upstream skill dir against ours, after applying
  # our patch files and configured local overrides to a temporary upstream copy.
  changed_files=()
  while IFS= read -r upstream_file; do
    rel_path="${upstream_file#"$upstream_path"/}"
    our_file="$our_path/$rel_path"

    if [[ ! -f "$our_file" ]]; then
      changed_files+=("$rel_path (new file upstream)")
      continue
    fi

    expected_tmp="$WORK_DIR/expected_${name//[^A-Za-z0-9_.-]/_}_${rel_path//[^A-Za-z0-9_.-]/_}"
    cp "$upstream_file" "$expected_tmp"

    patch_file="$PATCHES_DIR/${name}__${rel_path//\//__}.patch"
    patch_status="none"
    if [[ -f "$patch_file" ]]; then
      patch_status="has patch"
      if ! patch --quiet --forward "$expected_tmp" "$patch_file" 2>/dev/null; then
        changed_files+=("$rel_path (patch conflict)")
        rm -f "$expected_tmp"
        continue
      fi
    fi

    apply_local_overrides_quiet "$name" "$rel_path" "$expected_tmp"

    if ! diff -q "$expected_tmp" "$our_file" >/dev/null 2>&1; then
      if [[ "$patch_status" == "has patch" ]]; then
        changed_files+=("$rel_path (upstream changed, has patch)")
      else
        changed_files+=("$rel_path (changed, no patch)")
      fi
    fi
    rm -f "$expected_tmp"
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

# --- Section 5: Scan for Claude Code / sub-agent patterns needing patches ---
echo ""
echo "=== UNPATCHED_PATTERNS ==="
PATTERNS='sub.agent|subagent|Agent tool|spawn.*agent|subagent_type|^[[:space:]-]*If.*CLAUDE\.md.*exists|prefer.*CLAUDE\.md|CLAUDE\.md.*first'
while IFS=$'\t' read -r name our_path; do
  upstream_path=$(get_upstream_path "$name")

  if [[ -n "$upstream_path" ]]; then
    # Scan the effective version we would install: current upstream plus any
    # cleanly-applying pi patch and local metadata. A patch for one hunk must
    # not hide a newly-added pattern elsewhere in the same file.
    while IFS= read -r upstream_file; do
      [[ "$upstream_file" == *.md || "$upstream_file" == *.sh ]] || continue
      rel_path="${upstream_file#"$upstream_path"/}"
      scan_file="$WORK_DIR/scan_${name//[^A-Za-z0-9_.-]/_}_${rel_path//[^A-Za-z0-9_.-]/_}"
      cp "$upstream_file" "$scan_file"
      patch_file="$PATCHES_DIR/${name}__${rel_path//\//__}.patch"
      if [[ -f "$patch_file" ]]; then
        patch --quiet --forward "$scan_file" "$patch_file" 2>/dev/null || true
      fi
      apply_local_overrides_quiet "$name" "$rel_path" "$scan_file"
      matches=$(grep -niE "$PATTERNS" "$scan_file" 2>/dev/null || true)
      if [[ -n "$matches" ]]; then
        echo "UNPATCHED: $name/$rel_path"
        echo "$matches" | while IFS= read -r line; do echo "  $line"; done
      fi
      rm -f "$scan_file"
    done < <(find "$upstream_path" -type f | sort)
  else
    # A removed or renamed local skill has no upstream candidate; scan the
    # installed copy until its lifecycle migration is resolved.
    while IFS= read -r file; do
      [[ "$file" == *.md || "$file" == *.sh ]] || continue
      rel_path="${file#"$our_path"/}"
      matches=$(grep -niE "$PATTERNS" "$file" 2>/dev/null || true)
      if [[ -n "$matches" ]]; then
        echo "UNPATCHED: $name/$rel_path"
        echo "$matches" | while IFS= read -r line; do echo "  $line"; done
      fi
    done < <(find "$our_path" -type f | sort)
  fi
done < "$OUR_LIST"

# --- Section 6: Upstream dir for agent to read ---
echo ""
echo "=== UPSTREAM_DIR ==="
echo "$UPSTREAM_DIR/skills/"
echo "UPSTREAM_REF: ${UPSTREAM_REF:-default branch}"
echo "UPSTREAM_COMMIT: $RESOLVED_COMMIT"
if [[ "$KEEP_UPSTREAM" -eq 1 ]]; then
  echo "STATUS: upstream retained"
else
  echo "STATUS: upstream temp dir will be removed on exit; use --keep-upstream to inspect it"
fi

echo ""
echo "STATUS: sync analysis complete"
