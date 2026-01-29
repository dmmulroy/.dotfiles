# Examples

Good and bad examples for writing task context and results.

## Writing Context

Context should include everything needed to do the work without asking questions:
- **What** needs to be done and why
- **Implementation approach** (steps, files to modify, technical choices)
- **Done when** (acceptance criteria)

### Good Context Example

```javascript
await tasks.create({
  description: "Migrate storage to one file per task",
  context: `Change storage format for git-friendliness:

Structure:
.overseer/
└── tasks/
    ├── task_01ABC.json
    └── task_02DEF.json

NO INDEX - just scan task files. For typical task counts (<100), this is fast.

Implementation:
1. Update storage.ts:
   - read(): Scan .overseer/tasks/*.json, parse each, return TaskStore
   - write(task): Write single task to .overseer/tasks/{id}.json
   - delete(id): Remove .overseer/tasks/{id}.json
   - Add readTask(id) for single task lookup

2. Task file format: Same as current Task schema (one task per file)

3. Migration: On read, if old tasks.json exists, migrate to new format

4. Update tests

Benefits:
- Create = new file (never conflicts)
- Update = single file change
- Delete = remove file
- No index to maintain or conflict
- git diff shows exactly which tasks changed`
});
```

**Why it works:** States the goal, shows the structure, lists specific implementation steps, explains benefits. Someone could pick this up without asking questions.

### Bad Context Example

```javascript
await tasks.create({
  description: "Add auth",
  context: "Need to add authentication"
});
```

**What's missing:** How to implement it, what files, what's done when, technical approach.

## Writing Results

Results should capture what was actually done:
- **What changed** (implementation summary)
- **Key decisions** (and why)
- **Verification** (tests passing, manual testing done)

### Good Result Example

```javascript
await tasks.complete(taskId, `Migrated storage from single tasks.json to one file per task:

Structure:
- Each task stored as .overseer/tasks/{id}.json
- No index file (avoids merge conflicts)
- Directory scanned on read to build task list

Implementation:
- Modified Storage.read() to scan .overseer/tasks/ directory
- Modified Storage.write() to write/delete individual task files
- Auto-migration from old single-file format on first read
- Atomic writes using temp file + rename pattern

Trade-offs:
- Slightly slower reads (must scan directory + parse each file)
- Acceptable since task count is typically small (<100)
- Better git history - each task change is isolated

Verification:
- All 60 tests passing
- Build successful
- Manually tested migration: old -> new format works`);
```

**Why it works:** States what changed, lists implementation details, explains trade-offs, confirms verification.

### Bad Result Example

```javascript
await tasks.complete(taskId, "Fixed the storage issue");
```

**What's missing:** What was actually implemented, how, what decisions were made, verification evidence.

## Subtask Context Example

Link subtasks to their parent and explain what this piece does specifically:

```javascript
await tasks.create({
  description: "Add token verification function",
  parentId: jwtTaskId,
  context: `Part of JWT middleware (parent task). This subtask: token verification.

What it does:
- Verify JWT signature and expiration on protected routes
- Extract user ID from token payload
- Attach user object to request
- Return 401 for invalid/expired tokens

Implementation:
- Create src/middleware/verify-token.ts
- Export verifyToken middleware function
- Use jose library (preferred over jsonwebtoken)
- Handle expired vs invalid token cases separately

Done when:
- Middleware function complete and working
- Unit tests cover valid/invalid/expired scenarios
- Integrated into auth routes in server.ts
- Parent task can use this to protect endpoints`
});
```

## Error Handling Examples

### Handling Pending Children

```javascript
try {
  await tasks.complete(taskId, "Done");
} catch (err) {
  if (err.message.includes("pending children")) {
    const pending = await tasks.list({ parentId: taskId, completed: false });
    console.log(`Cannot complete: ${pending.length} children pending`);
    for (const child of pending) {
      console.log(`- ${child.id}: ${child.description}`);
    }
    return;
  }
  throw err;
}
```

### Handling Blocked Tasks

```javascript
const task = await tasks.get(taskId);

if (task.blockedBy.length > 0) {
  console.log("Task is blocked by:");
  for (const blockerId of task.blockedBy) {
    const blocker = await tasks.get(blockerId);
    console.log(`- ${blocker.description} (${blocker.completed ? 'done' : 'pending'})`);
  }
  return "Cannot start - blocked by other tasks";
}

await tasks.start(taskId);
```

## Creating Task Hierarchies

```javascript
// Create milestone with tasks
const milestone = await tasks.create({
  description: "Implement user authentication",
  context: "Full auth: JWT, login/logout, password reset, rate limiting",
  priority: 2
});

const subtasks = [
  "Add login endpoint",
  "Add logout endpoint", 
  "Implement JWT token service",
  "Add password reset flow"
];

for (const desc of subtasks) {
  await tasks.create({ description: desc, parentId: milestone.id });
}
```

See @file references/hierarchies.md for sequential subtasks with blockers.
