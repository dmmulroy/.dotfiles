---
name: worktrees
description: Manage Git worktrees in a canonical `.bare` repository root. Use when creating, reusing, listing, removing, or repairing worktrees, or when setting up a repository to keep all branch checkouts under one root.
---

# Git worktrees

Use one root per repository:

```text
<repo>/
  .git       # gitdir: ./.bare
  .bare/     # shared repository and object store
  main/      # linked worktree
  <topic>/   # linked worktree
```

Run repository-wide commands from `<repo>` and development commands from a linked worktree. Keep every checkout under `<repo>`.

## Create or reuse a worktree

1. From any linked worktree or the canonical root, run [`scripts/new-worktree.sh`](scripts/new-worktree.sh):

   ```bash
   scripts/new-worktree.sh <local-dir> <branch> [base]
   ```

   Set `WORKTREE_ROOT` only when root discovery is unavailable. Set `WORKTREE_REMOTE` when the remote is not `origin`.

2. Enter `<repo>/<local-dir>` and run:

   ```bash
   git status --short --branch
   ```

Creation is complete when `git worktree list` contains the path and its expected branch, and status is clean unless the branch already carried changes.

The helper fetches and prunes, reuses an existing local branch, tracks a matching remote branch, or creates a new branch from `[base]`. Run it with `--help` for the exact decision order and defaults.

## Remove a worktree

1. Account for every staged, unstaged, and untracked change:

   ```bash
   git -C <repo>/<local-dir> status --short --branch
   ```

2. Remove the checkout through Git:

   ```bash
   git -C <repo> worktree remove <local-dir>
   ```

3. Delete the local branch only when its commits are integrated or intentionally discarded:

   ```bash
   git -C <repo> branch -d <branch>
   ```

Removal is complete when the path is absent from both the filesystem and `git -C <repo> worktree list`.

## Setup and recovery

Read [`references/canonical-root.md`](references/canonical-root.md) when converting a repository to this layout, validating its invariants, cleaning stale registrations, or repairing moved worktrees.
