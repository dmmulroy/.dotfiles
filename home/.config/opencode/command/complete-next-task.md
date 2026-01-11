---
description: Complete the next incomplete task from a PRD
---

Complete one task from a PRD file. Implements the next task with `passes: false`, runs feedback loops, and commits.

## Usage

```
/complete-next-task <prd-name>
```

Where `<prd-name>` matches `.opencode/state/<prd-name>/prd.json`

## Before Starting

First, invoke the skill tool to detect the VCS:

```
skill({ name: 'vcs-detect' })
```

Use the detected VCS (jj or git) for all version control operations.

## File Locations

**IMPORTANT**: The `.opencode/state/` directory may not be at cwd. Search for it:

1. Start at cwd
2. Check if `.opencode/state/<prd-name>/prd.json` exists
3. If not, go up one directory
4. Repeat until found or reaching filesystem root

Use this bash to find the state directory:

```bash
find_opencode_state() {
  local prd="$1"
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/.opencode/state/$prd/prd.json" ]]; then
      echo "$dir/.opencode/state/$prd"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}
```

Once found, use **absolute paths** for all file operations:

```
<state-dir>/
├── prd.json       # Task list with passes field
└── progress.txt   # Cross-iteration memory
```

## Process

### 1. Get Bearings

- Read progress file - **CHECK 'Codebase Patterns' SECTION FIRST**
- Read PRD - find next task with `passes: false`
  - **Task Priority** (highest to lowest):
    1. Architecture/core abstractions
    2. Integration points
    3. Spikes/unknowns
    4. Standard features
    5. Polish/cleanup
- Check recent history (jj: `jj log --limit 10`, git: `git log --oneline -10`)

### 2. Initialize Progress (if needed)

If progress.txt doesn't exist, create it:

```markdown
# Progress Log
PRD: <prdName from PRD>
Started: <YYYY-MM-DD>

## Codebase Patterns
<!-- Consolidate reusable patterns here -->

---
<!-- Task logs below - APPEND ONLY -->
```

### 3. Branch Setup

Extract `prdName` from PRD, then:
- jj: `jj new -m '<prdName>'`
- git: `git checkout -b <prdName>` (or checkout if exists)

### 4. Implement Task

Work on the single task until verification steps pass.


### 5. Feedback Loops (REQUIRED)

Before committing, run ALL applicable:
- Type checking
- Tests
- Linting
- Formatting

**Do NOT commit if any fail.** Fix issues first.

### 6. Update PRD

Set the task's `passes` field to `true` in the PRD file.

### 7. Update Progress

Append to progress.txt:

```markdown
## Task - [task.id]
- What was implemented
- Files changed
- **Learnings:** patterns, gotchas
```

If you discover a **reusable pattern**, also add to `## Codebase Patterns` at the TOP.

### 8. Commit

- jj: `jj describe -m 'feat(<scope>): <description>' && jj bookmark create <prdName>/<task-id> && jj new`
- git: `git add -A && git commit -m 'feat(<scope>): <description>'`

Bookmark format: `<prdName>/<task-id>` (e.g., `lib-relay-implementation/types-2`)

## Completion

If all tasks have `passes: true`, output:

```
<tasks>COMPLETE</tasks>
```

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Patterns you establish will be copied. Corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

<user-request>
$ARGUMENTS
</user-request>
