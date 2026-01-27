---
name: overseer-plan
description: Convert markdown planning documents to Overseer tasks via MCP codemode. Use when converting plans, specs, or design docs to trackable task hierarchies.
license: MIT
metadata:
  author: dmmulroy
  version: "1.0.0"
---

# Converting Markdown Documents to Overseer Tasks

Use `/overseer-plan` to convert any markdown planning document into trackable Overseer tasks.

## When to Use

- After completing a plan in plan mode
- Converting specs/design docs to implementation tasks
- Creating tasks from roadmap or milestone documents

## Usage

```
/overseer-plan <markdown-file-path>
/overseer-plan <file> --priority 3           # Set priority (1-5)
/overseer-plan <file> --parent <task-id>     # Create as child of existing task
```

## What It Does

1. Reads markdown file
2. Extracts title from first `#` heading (strips "Plan: " prefix)
3. Creates Overseer milestone with full markdown as context
4. Analyzes structure for subtask breakdown
5. Creates subtasks when appropriate
6. Returns task ID and breakdown summary

## Hierarchy Levels

| Depth | Name | Example |
|-------|------|---------|
| 0 | **Milestone** | "Add user authentication system" |
| 1 | **Task** | "Implement JWT middleware" |
| 2 | **Subtask** | "Add token verification function" |

## Breakdown Decision

**Create subtasks when:**
- 3-7 clearly separable work items
- Implementation across multiple files/components
- Clear sequential dependencies

**Keep single milestone when:**
- 1-2 steps only
- Work items tightly coupled
- Plan is exploratory/investigative

## After Creating

```javascript
await tasks.get("<id>");                    // View task
await tasks.list({ parentId: "<id>" });     // List children
await tasks.start("<id>");                  // Start work (creates VCS bookmark)
await tasks.complete("<id>", "result");     // Complete (squashes commits)
```

**VCS Integration**: `start` and `complete` automatically manage VCS bookmarks and commits. No manual VCS operations needed.

## When NOT to Use

- Document incomplete or exploratory
- Content not actionable
- No meaningful planning content

---

## Reading Order

| Task | File |
|------|------|
| Understanding API | @file references/api.md |
| Agent implementation | @file references/implementation.md |
| See examples | @file references/examples.md |

## In This Reference

| File | Purpose |
|------|---------|
| `references/api.md` | Overseer MCP codemode API types/methods |
| `references/implementation.md` | Step-by-step execution instructions for agent |
| `references/examples.md` | Complete worked examples |
