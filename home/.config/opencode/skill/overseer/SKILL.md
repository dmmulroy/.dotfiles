---
name: overseer
description: Manage tasks via Overseer MCP codemode. Use when tracking multi-session work, breaking down implementation, or persisting context for handoffs.
license: MIT
metadata:
  author: dmmulroy
  version: "1.0.0"
---

# Agent Coordination with Overseer

## Core Principle: Tickets, Not Todos

Overseer tasks are **tickets** - structured artifacts with comprehensive context:

- **Description**: One-line summary (issue title)
- **Context**: Full background, requirements, approach (issue body)
- **Result**: Implementation details, decisions, outcomes (PR description)

Think: "Would someone understand the what, why, and how from this task alone?"

## Task IDs are Ephemeral

**Never reference task IDs in external artifacts** (commits, PRs, docs). Task IDs like `task_01JQAZ...` become meaningless once tasks complete. Describe the work itself, not the task that tracked it.

## Overseer vs OpenCode's TodoWrite

|                 | Overseer                              | TodoWrite              |
| --------------- | ------------------------------------- | ---------------------- |
| **Persistence** | SQLite database                       | Session-only           |
| **Context**     | Rich (description + context + result) | Basic                  |
| **Hierarchy**   | 3-level (milestone -> task -> subtask)| Flat                   |

Use **Overseer** for persistent work. Use **TodoWrite** for ephemeral in-session tracking only.

## When to Use Overseer

**Use Overseer when:**
- Breaking down complexity into subtasks
- Work spans multiple sessions
- Context needs to persist for handoffs
- Recording decisions for future reference

**Skip Overseer when:**
- Work is a single atomic action
- Everything fits in one message exchange
- Overhead exceeds value
- TodoWrite is sufficient

## Finding Work

```javascript
// Get single next task with full context (recommended for work sessions)
const task = await tasks.nextReady(milestoneId);

// Get all ready tasks (for progress overview)
const readyTasks = await tasks.list({ ready: true });
```

**Use `nextReady()`** when starting work - returns `Task` with full inherited context populated.
**Use `list({ ready: true })`** for status/progress checks - returns flat `Task[]` without context.

## Basic Workflow

```javascript
// 1. Get next ready task
const task = await tasks.nextReady();

// 2. Review context
console.log(task.context.own);       // This task's context
console.log(task.context.parent);    // Parent's context (if depth > 0)
console.log(task.context.milestone); // Root milestone context (if depth > 1)

// 3. Start work (auto-creates VCS bookmark)
await tasks.start(task.id);

// 4. Implement... add learnings as you go
await learnings.add(task.id, "bcrypt rounds should be 12 for production");

// 5. Complete (auto-squashes commits)
await tasks.complete(task.id, "Implemented login endpoint with JWT tokens");
```

See @file references/workflow.md for detailed workflow guidance.

## Understanding Task Context

Tasks have **progressive context** - inherited from ancestors:

```javascript
const task = await tasks.get(taskId);
// task.context.own      - this task's context (always present)
// task.context.parent   - parent task's context (if depth > 0)
// task.context.milestone - root milestone's context (if depth > 1)

// Inherited learnings
// task.learnings.milestone - learnings from root milestone
// task.learnings.parent    - learnings from parent task
```

## Task Hierarchies

Three levels: **Milestone** (depth 0) -> **Task** (depth 1) -> **Subtask** (depth 2).

| Level | Name | Purpose | Example |
|-------|------|---------|---------|
| 0 | **Milestone** | Large initiative | "Add user authentication system" |
| 1 | **Task** | Significant work item | "Implement JWT middleware" |
| 2 | **Subtask** | Atomic step | "Add token verification function" |

**Choosing the right level:**
- Small feature (1-2 files) -> Single task
- Medium feature (3-7 steps) -> Task with subtasks
- Large initiative (5+ tasks) -> Milestone with tasks

See @file references/hierarchies.md for detailed guidance.

## Recording Results

Complete tasks **immediately after implementing AND verifying**:
- Capture decisions while fresh
- Note deviations from plan
- Document verification performed
- Create follow-up tasks for tech debt

Your result must include explicit verification evidence. See @file references/verification.md.

## Best Practices

1. **Right-size tasks**: Completable in one focused session
2. **Clear completion criteria**: Context should define "done"
3. **Don't over-decompose**: 3-7 children per parent
4. **Action-oriented descriptions**: Start with verbs ("Add", "Fix", "Update")
5. **Verify before completing**: Tests passing, manual testing done

---

## Reading Order

| Task | File |
|------|------|
| Understanding API | @file references/api.md |
| Implementation workflow | @file references/workflow.md |
| Task decomposition | @file references/hierarchies.md |
| Good/bad examples | @file references/examples.md |
| Verification checklist | @file references/verification.md |

## In This Reference

| File | Purpose |
|------|---------|
| `references/api.md` | Overseer MCP codemode API types/methods |
| `references/workflow.md` | Start->implement->complete workflow |
| `references/hierarchies.md` | Milestone/task/subtask organization |
| `references/examples.md` | Good/bad context and result examples |
| `references/verification.md` | Verification checklist and process |
