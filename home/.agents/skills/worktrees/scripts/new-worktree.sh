#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: new-worktree.sh <local-dir> <branch> [base]

Create a linked worktree under a canonical repository root:
  <repo>/.git   -> gitdir: ./.bare
  <repo>/.bare  -> shared bare repository
  <repo>/<name> -> linked worktree

Branch selection:
  1. Reuse <branch> when it exists locally.
  2. Track WORKTREE_REMOTE/<branch> when it exists remotely.
  3. Create <branch> from [base].

The default remote is origin. The default base is the remote's default branch,
then main or master when either exists locally. Set WORKTREE_ROOT to override
root discovery and WORKTREE_REMOTE to select another remote.
USAGE
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 2
fi

local_dir=$1
branch=$2
base=${3:-}

if [[ -z "$local_dir" || "$local_dir" == "." || "$local_dir" == ".." || "$local_dir" == */* ]]; then
  echo "new-worktree: local-dir must name one direct child of the repository root: $local_dir" >&2
  exit 2
fi

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "new-worktree: invalid branch name: $branch" >&2
  exit 2
fi

if [[ -n ${WORKTREE_ROOT:-} ]]; then
  root=$WORKTREE_ROOT
else
  if ! common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    echo "new-worktree: run from a canonical repository root or one of its linked worktrees" >&2
    exit 1
  fi

  if [[ ${common_dir##*/} != ".bare" ]]; then
    echo "new-worktree: shared Git directory is not a canonical .bare directory: $common_dir" >&2
    echo "new-worktree: set WORKTREE_ROOT or convert the repository to the canonical layout" >&2
    exit 1
  fi
  root=${common_dir%/.bare}
fi

if [[ $(git -C "$root" rev-parse --is-bare-repository 2>/dev/null) != "true" ]]; then
  echo "new-worktree: repository root does not resolve to a bare repository: $root" >&2
  exit 1
fi

if [[ -e "$root/$local_dir" ]]; then
  echo "new-worktree: destination already exists: $root/$local_dir" >&2
  exit 1
fi

remote=${WORKTREE_REMOTE:-origin}
if git -C "$root" remote get-url "$remote" >/dev/null 2>&1; then
  echo "Fetching $remote..." >&2
  git -C "$root" fetch --prune "$remote"
  has_remote=true
else
  has_remote=false
  if [[ -n ${WORKTREE_REMOTE:-} ]]; then
    echo "new-worktree: remote does not exist: $remote" >&2
    exit 1
  fi
fi

if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Adding existing local branch '$branch' at $root/$local_dir" >&2
  git -C "$root" worktree add -- "$local_dir" "$branch"
elif [[ $has_remote == true ]] && git -C "$root" show-ref --verify --quiet "refs/remotes/$remote/$branch"; then
  echo "Creating tracking branch '$branch' from $remote/$branch at $root/$local_dir" >&2
  git -C "$root" worktree add --track -b "$branch" -- "$local_dir" "$remote/$branch"
else
  if [[ -z "$base" && $has_remote == true ]]; then
    base=$(git -C "$root" symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null || true)
  fi

  if [[ -z "$base" ]]; then
    if git -C "$root" show-ref --verify --quiet refs/heads/main; then
      base=main
    elif git -C "$root" show-ref --verify --quiet refs/heads/master; then
      base=master
    else
      echo "new-worktree: no default base found; pass [base] explicitly" >&2
      exit 1
    fi
  fi

  if ! git -C "$root" rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
    echo "new-worktree: base does not resolve to a commit: $base" >&2
    exit 1
  fi

  echo "Creating branch '$branch' from $base at $root/$local_dir" >&2
  git -C "$root" worktree add --no-track -b "$branch" -- "$local_dir" "$base"
fi

echo >&2
git -C "$root" worktree list --verbose
