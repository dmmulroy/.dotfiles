# Task Hierarchies

Guidance for organizing work into milestones, tasks, and subtasks.

## Three Levels

| Level | Name | Purpose | Example |
|-------|------|---------|---------|
| 0 | **Milestone** | Large initiative (5+ tasks) | "Add user authentication system" |
| 1 | **Task** | Significant work item | "Implement JWT middleware" |
| 2 | **Subtask** | Atomic implementation step | "Add token verification function" |

**Maximum depth is 3 levels.** Attempting to create a child of a subtask will fail.

## When to Use Each Level

### Single Task (No Hierarchy)
- Small feature (1-2 files, ~1 session)
- Work is atomic, no natural breakdown

### Task with Subtasks
- Medium feature (3-5 files, 3-7 steps)
- Work naturally decomposes into discrete steps
- Subtasks could be worked on independently

### Milestone with Tasks
- Large initiative (multiple areas, many sessions)
- Work spans 5+ distinct tasks
- You want high-level progress tracking

## Creating Hierarchies

```javascript
// Create the milestone
const milestone = await tasks.create({
  description: "Add user authentication system",
  context: "Full auth system with JWT tokens, password reset...",
  priority: 2
});

// Create tasks under it
const jwtTask = await tasks.create({
  description: "Implement JWT token generation",
  context: "Create token service with signing and verification...",
  parentId: milestone.id
});

const resetTask = await tasks.create({
  description: "Add password reset flow",
  context: "Email-based password reset with secure tokens...",
  parentId: milestone.id
});

// For complex tasks, add subtasks
const verifySubtask = await tasks.create({
  description: "Add token verification function",
  context: "Verify JWT signature and expiration...",
  parentId: jwtTask.id
});
```

## Subtask Best Practices

Each subtask should be:

- **Independently understandable**: Clear on its own
- **Linked to parent**: Reference parent, explain how this piece fits
- **Specific scope**: What this subtask does vs what parent/siblings do
- **Clear completion**: Define "done" for this piece specifically

Example subtask context:
```
Part of JWT middleware (parent task). This subtask: token verification.

What it does:
- Verify JWT signature and expiration
- Extract user ID from payload
- Return 401 for invalid/expired tokens

Done when:
- Function complete and tested
- Unit tests cover valid/invalid/expired cases
```

## Decomposition Strategy

When faced with large tasks:

1. **Assess scope**: Is this milestone-level (5+ tasks) or task-level (3-7 subtasks)?
2. Create parent task/milestone with overall goal and context
3. Analyze and identify 3-7 logical children
4. Create children with specific contexts and boundaries
5. Work through systematically, completing with results
6. Complete parent with summary of overall implementation

### Don't Over-Decompose

- **3-7 children per parent** is usually right
- If you'd only have 1-2 subtasks, just make separate tasks
- If you need depth 3+, restructure your breakdown

## Viewing Hierarchies

```javascript
// List all tasks under a milestone
const children = await tasks.list({ parentId: milestoneId });

// Get task with context breadcrumb
const task = await tasks.get(taskId);
// task.context.parent - parent's context
// task.context.milestone - root milestone's context

// Check progress
const pending = await tasks.list({ parentId: milestoneId, completed: false });
const done = await tasks.list({ parentId: milestoneId, completed: true });
console.log(`Progress: ${done.length}/${done.length + pending.length}`);
```

## Completion Rules

1. **Cannot complete with pending children**
   ```javascript
   // This will fail if task has incomplete subtasks
   await tasks.complete(taskId, "Done");
   // Error: "pending children"
   ```

2. **Complete children first**
   - Work through subtasks systematically
   - Complete each with meaningful results

3. **Parent result summarizes overall implementation**
   ```javascript
   await tasks.complete(milestoneId, `User authentication system complete:

   Implemented:
   - JWT token generation and verification
   - Login/logout endpoints
   - Password reset flow
   - Rate limiting

   5 tasks completed, all tests passing.`);
   ```

## Blocking Dependencies

Use `blockedBy` for cross-task dependencies:

```javascript
// Create task that depends on another
const deployTask = await tasks.create({
  description: "Deploy to production",
  context: "...",
  blockedBy: [testTaskId, reviewTaskId]
});

// Add blocker to existing task
await tasks.block(deployTaskId, testTaskId);

// Remove blocker
await tasks.unblock(deployTaskId, testTaskId);
```

**Use blockers when:**
- Task B cannot start until Task A completes
- Multiple tasks depend on a shared prerequisite

**Don't use blockers when:**
- Tasks can be worked on in parallel
- The dependency is just logical grouping (use subtasks instead)
