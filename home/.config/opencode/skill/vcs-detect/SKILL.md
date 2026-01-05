---
name: vcs-detect
description: Detect whether current project uses jj (Jujutsu) or git VCS. Use before ANY version control operation - commit, push, pull, fetch, status, diff, log, branch, rebase, merge, stash, reset, blame. Covers detection logic, command equivalents, and jj-specific patterns.
---

# VCS Detect

Determine if project uses jj or git, then use appropriate commands.

## When to Use

Load this skill before running ANY of these commands or operations:
- `git status`, `git commit`, `git push`, `git pull`, `git fetch`
- `git diff`, `git log`, `git branch`, `git rebase`, `git merge`
- `git stash`, `git reset`, `git blame`, `git add`
- Any user request containing: "commit", "push", "pull", "branch", "rebase"
- When user says "check in changes", "save my work", "update from remote"

**Do NOT assume git** - always check for `.jj/` first.

## Detection

Check for VCS directory at project root:

| Check | Result |
|-------|--------|
| `.jj/` exists | jj repo (may also have `.git/` for colocated) |
| `.git/` only | git repo |
| Neither | Not version controlled |

**jj colocated repos**: If `.jj/` exists, always prefer jj commands even if `.git/` present.

## Command Equivalents

| Task | git | jj |
|------|-----|-----|
| Status | `git status` | `jj status` |
| Log | `git log --oneline` | `jj log` |
| Diff | `git diff` | `jj diff` |
| Diff staged | `git diff --staged` | N/A (no staging) |
| Add | `git add <file>` | N/A (auto-tracked) |
| Commit | `git commit -m "msg"` | `jj commit -m "msg"` |
| Amend | `git commit --amend` | `jj squash` or edit description |
| Branch create | `git checkout -b name` | `jj new -m "name"` |
| Branch list | `git branch` | `jj branch list` |
| Push | `git push` | `jj git push` |
| Pull/fetch | `git pull` | `jj git fetch` then `jj rebase` |
| Rebase | `git rebase main` | `jj rebase -d main` |
| Stash | `git stash` | N/A (use new commit) |
| Reset | `git reset --hard` | `jj restore` |
| Blame | `git blame` | `jj file annotate` |

## jj Key Differences

1. **No staging area**: All changes auto-tracked, commit captures working copy
2. **No checkout**: Working copy always editable, use `jj new` to start new change
3. **Immutable history**: Changes create new revisions, never mutate
4. **Automatic rebasing**: Descendants auto-rebase when ancestors change
5. **Anonymous branches**: Commits don't need branch names

## Detection Script (inline)

```bash
if [ -d ".jj" ]; then
  echo "jj"
elif [ -d ".git" ]; then
  echo "git"
else
  echo "none"
fi
```

## Workflow

1. Before any VCS operation, check for `.jj/` directory
2. If jj: use jj commands, remember no staging
3. If git: use standard git workflow
4. When user says "commit" without specifying, detect VCS first

## References

- [jj docs](https://jj-vcs.github.io/jj/latest/)
