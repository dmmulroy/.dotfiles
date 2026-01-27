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

`nextReady()` returns a `Task` with inherited context and learnings populated.

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

// Inherited learnings
console.log("Milestone learnings:", task.learnings.milestone);
console.log("Parent learnings:", task.learnings.parent);
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

**VCS Effect:** Creates bookmark `task/<id>`, records start commit, creates WIP commit.

After starting, the task status changes to `in_progress`.

## 4. Implement + Add Learnings

As you implement, capture learnings immediately:

```javascript
// Capture discoveries as you go
await learnings.add(taskId, "bcrypt default rounds too low for production");
await learnings.add(taskId, "jose library preferred over jsonwebtoken");

// Optionally reference source task
await learnings.add(taskId, "Pattern from auth refactor", sourceTaskId);
```

**Why capture early?**
- Decisions are fresh in context
- Future tasks inherit learnings
- Avoids forgetting important insights

## 5. Verify Work

Before completing, verify your implementation. See @file references/verification.md for full checklist.

Quick checklist:
- [ ] Task description requirements met
- [ ] Context "Done when" criteria satisfied
- [ ] Tests passing (document count)
- [ ] Build succeeds
- [ ] Manual testing done

## 6. Complete Task

```javascript
await tasks.complete(taskId, `Implemented login endpoint:

Implementation:
- Created src/auth/login.ts
- Added JWT token generation
- Integrated with user service

Verification:
- All 42 tests passing (3 new)
- Manually tested valid/invalid credentials`);
```

**VCS Effect:** Squashes all commits since start, rebases onto parent's bookmark (if child task).

The `result` becomes part of the task's permanent record.

## VCS Integration (Automatic)

VCS operations are **automatically handled** by the tasks API:

| Task Operation | VCS Effect |
|----------------|------------|
| `tasks.start(id)` | Creates bookmark `task/<id>`, records start commit, creates WIP commit |
| `tasks.complete(id)` | Squashes all commits since start, rebases onto parent's bookmark |
| `tasks.delete(id)` | Deletes bookmark `task/<id>` |

**Key insight:** Agents never need to call `vcs.commit()` during normal task flow.

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
await learnings.add(task.id, "Use jose for JWT");
await tasks.complete(task.id, "Implemented: ... Verification: All 58 tests passing");
```
