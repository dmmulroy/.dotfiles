# Implementation Workflow

Step-by-step guide for working with Overseer tasks during implementation.

## 1. Get Next Ready Task

```javascript
// Get next task with full context (recommended)
const task = await tasks.nextReady();

// Or scope to specific milestone
const task = await tasks.nextReady(milestoneId);

if (!task) {
  return "No tasks ready - all blocked or completed";
}
```

`nextReady()` returns a `TaskWithContext` (task with inherited context and learnings) or `null`.

## 2. Review Context

Before starting, verify you can answer:
- **What** needs to be done specifically?
- **Why** is this needed?
- **How** should it be implemented?
- **When** is it done (acceptance criteria)?

```javascript
const task = await tasks.get(taskId);

// Task's own context
console.log("Task:", task.context.own);

// Parent context (if task has parent)
if (task.context.parent) {
  console.log("Parent:", task.context.parent);
}

// Milestone context (if depth > 1)
if (task.context.milestone) {
  console.log("Milestone:", task.context.milestone);
}

// Task's own learnings (bubbled from completed children)
console.log("Task learnings:", task.learnings.own);
```

**If any answer is unclear:**
1. Check parent task or completed blockers for details
2. Suggest entering plan mode to flesh out requirements

**Proceed without full context when:**
- Task is trivial/atomic (e.g., "Add .gitignore entry")
- Conversation already provides the missing context
- Description itself is sufficiently detailed

## 3. Start Task

```javascript
await tasks.start(taskId);
```

**VCS Required:** Creates bookmark `task/<id>`, records start commit. Fails with `NotARepository` if no jj/git found.

After starting, the task status changes to `in_progress`.

## 4. Implement

Work on the task implementation. Note any learnings to include when completing.

## 5. Verify Work

Before completing, verify your implementation. See @file references/verification.md for full checklist.

Quick checklist:
- [ ] Task description requirements met
- [ ] Context "Done when" criteria satisfied
- [ ] Tests passing (document count)
- [ ] Build succeeds
- [ ] Manual testing done

## 6. Complete Task with Learnings

```javascript
await tasks.complete(taskId, {
  result: `Implemented login endpoint:

Implementation:
- Created src/auth/login.ts
- Added JWT token generation
- Integrated with user service

Verification:
- All 42 tests passing (3 new)
- Manually tested valid/invalid credentials`,
  learnings: [
    "bcrypt rounds should be 12+ for production",
    "jose library preferred over jsonwebtoken"
  ]
});
```

**VCS Required:** Commits changes (NothingToCommit treated as success), then deletes the task's bookmark (best-effort) and clears the DB bookmark field on success. Fails with `NotARepository` if no jj/git found.

**Learnings Effect:** Learnings bubble to immediate parent only. `sourceTaskId` is preserved through bubbling, so if this task's learnings later bubble further, the origin is tracked.

The `result` becomes part of the task's permanent record.

## VCS Integration (Required for Workflow)

VCS operations are **automatically handled** by the tasks API:

| Task Operation | VCS Effect |
|----------------|------------|
| `tasks.start(id)` | **VCS required** - creates bookmark `task/<id>`, records start commit |
| `tasks.complete(id)` | **VCS required** - commits changes, deletes bookmark (best-effort), clears DB bookmark on success |
| `tasks.complete(milestoneId)` | Same + deletes ALL descendant bookmarks recursively (depth-1 and depth-2) |
| `tasks.delete(id)` | Best-effort bookmark cleanup (logs warning on failure) |

**Note:** VCS (jj or git) is required for start/complete. CRUD operations work without VCS.

## Error Handling

### Pending Children

```javascript
try {
  await tasks.complete(taskId, "Done");
} catch (err) {
  if (err.message.includes("pending children")) {
    const pending = await tasks.list({ parentId: taskId, completed: false });
    return `Cannot complete: ${pending.length} children pending`;
  }
  throw err;
}
```

### Task Not Ready

```javascript
const task = await tasks.get(taskId);

// Check if blocked
if (task.blockedBy.length > 0) {
  console.log("Blocked by:", task.blockedBy);
  // Complete blockers first or unblock
  await tasks.unblock(taskId, blockerId);
}
```

## Complete Workflow Example

```javascript
const task = await tasks.nextReady();
if (!task) return "No ready tasks";

await tasks.start(task.id);
// ... implement ...
await tasks.complete(task.id, {
  result: "Implemented: ... Verification: All 58 tests passing",
  learnings: ["Use jose for JWT"]
});
```
