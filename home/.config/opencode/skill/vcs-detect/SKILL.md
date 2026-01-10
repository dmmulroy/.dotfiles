---
name: vcs-detect
description: Detect whether the current project uses jj (Jujutsu) or git for version control. Run this BEFORE any VCS command to use the correct tool.
---

# VCS Detection Skill

Detect the version control system in use before running any VCS commands.

## Why This Matters

- jj (Jujutsu) and git have different CLIs and workflows
- Running `git` commands in a jj repo (or vice versa) causes errors
- Some repos use jj with git colocated (both `.jj/` and `.git/` exist)

## Detection Logic

Both `jj root` and `git rev-parse --show-toplevel` walk up the filesystem to find repo root.

**Priority order:**

1. `jj root` succeeds → jj (handles colocated too)
2. `git rev-parse` succeeds → git
3. Both fail → no VCS

## Detection Command

```bash
if jj root &>/dev/null; then echo "jj"
elif git rev-parse --show-toplevel &>/dev/null; then echo "git"
else echo "none"
fi
```

## Command Mappings

| Operation | git | jj |
|-----------|-----|-----|
| Status | `git status` | `jj status` |
| Log | `git log` | `jj log` |
| Diff | `git diff` | `jj diff` |
| Commit | `git commit` | `jj commit` / `jj describe` |
| Branch list | `git branch` | `jj branch list` |
| New branch | `git checkout -b <name>` | `jj branch create <name>` |
| Push | `git push` | `jj git push` |
| Pull/Fetch | `git pull` / `git fetch` | `jj git fetch` |
| Rebase | `git rebase` | `jj rebase` |

## Usage

Before any VCS operation:

1. Run detection command
2. Use appropriate CLI based on result
3. If `none`, warn user directory is not version controlled

## Example Integration

```
User: Show me the git log
Agent: [Runs detection] -> Result: jj
Agent: [Runs `jj log` instead of `git log`]
```

## Colocated Repos

When both `.jj/` and `.git/` exist, the repo is "colocated":
- jj manages the working copy
- git is available for compatibility (GitHub, etc.)
- **Always prefer jj commands** in colocated repos
