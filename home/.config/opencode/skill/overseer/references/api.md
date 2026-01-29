# Overseer Codemode MCP API

Execute JavaScript code to interact with Overseer task management.

## Task Interface

```typescript
// Basic task - returned by list(), create(), start(), complete()
// Note: Does NOT include context or learnings fields
interface Task {
  id: string;
  parentId: string | null;
  description: string;
  priority: 1 | 2 | 3 | 4 | 5;
  completed: boolean;
  depth: 0 | 1 | 2;         // 0=milestone, 1=task, 2=subtask
  blockedBy: string[];
  blocks: string[];
  result: string | null;    // Completion result from tasks.complete()
  commitSha: string | null; // Commit ID when task completed
  createdAt: string;        // ISO 8601 timestamp
  updatedAt: string;        // ISO 8601 timestamp
  startedAt: string | null; // Set when tasks.start() called
  completedAt: string | null; // Set when tasks.complete() called
}

// Task with full context - returned by get(), nextReady()
interface TaskWithContext extends Task {
  context: {
    own: string;              // This task's context
    parent?: string;          // Parent's context (depth > 0)
    milestone?: string;       // Root milestone's context (depth > 1)
  };
  learnings: {
    own: Learning[];          // This task's learnings (bubbled from completed children)
  };
}
```

## Learning Interface

```typescript
interface Learning {
  id: string;
  taskId: string;
  content: string;
  sourceTaskId: string | null;
  createdAt: string;
}
```

## Tasks API

```typescript
declare const tasks: {
  list(filter?: { parentId?: string; ready?: boolean; completed?: boolean }): Promise<Task[]>;
  get(id: string): Promise<TaskWithContext>;
  create(input: {
    description: string;
    context?: string;
    parentId?: string;
    priority?: 1 | 2 | 3 | 4 | 5;  // Required range: 1-5
    blockedBy?: string[];
  }): Promise<Task>;
  update(id: string, input: {
    description?: string;
    context?: string;
    priority?: 1 | 2 | 3 | 4 | 5;
    parentId?: string;
  }): Promise<Task>;
  start(id: string): Promise<Task>;
  complete(id: string, input?: { result?: string; learnings?: string[] }): Promise<Task>;
  reopen(id: string): Promise<Task>;
  delete(id: string): Promise<void>;
  block(taskId: string, blockerId: string): Promise<void>;
  unblock(taskId: string, blockerId: string): Promise<void>;
  nextReady(milestoneId?: string): Promise<TaskWithContext | null>;
};
```

| Method | Returns | Description |
|--------|---------|-------------|
| `list` | `Task[]` | Filter by `parentId`, `ready`, `completed` |
| `get` | `TaskWithContext` | Get task with full context chain + inherited learnings |
| `create` | `Task` | Create task (priority must be 1-5) |
| `update` | `Task` | Update description, context, priority, parentId |
| `start` | `Task` | Mark started + **creates VCS bookmark** |
| `complete` | `Task` | Mark complete + **squashes commits** + bubbles learnings to parent |
| `reopen` | `Task` | Reopen completed task |
| `delete` | `void` | Delete task + **cleans up VCS bookmark** |
| `block` | `void` | Add blocker (cannot be self, ancestor, or descendant) |
| `unblock` | `void` | Remove blocker relationship |
| `nextReady` | `TaskWithContext \| null` | Get deepest ready leaf with full context |

## Learnings API

Learnings are added via `tasks.complete(id, { learnings: [...] })` and bubble to immediate parent (preserving `sourceTaskId`).

```typescript
declare const learnings: {
  list(taskId: string): Promise<Learning[]>;
};
```

| Method | Description |
|--------|-------------|
| `list` | List learnings for task |

## VCS Integration

VCS operations are **automatically handled** by the tasks API:

| Task Operation | VCS Effect |
|----------------|------------|
| `tasks.start(id)` | Creates bookmark `task/<id>`, records start commit, creates WIP commit |
| `tasks.complete(id)` | Squashes commits since start, rebases onto parent's bookmark (if child task) |
| `tasks.delete(id)` | Deletes bookmark `task/<id>` |

**No direct VCS API** - agents work with tasks, VCS is managed behind the scenes.

## Quick Examples

```javascript
// Create milestone with subtask
const milestone = await tasks.create({
  description: "Build authentication system",
  context: "JWT-based auth with refresh tokens",
  priority: 1
});

const subtask = await tasks.create({
  description: "Implement token refresh logic",
  parentId: milestone.id,
  context: "Handle 7-day expiry"
});

// Start work (auto-creates VCS bookmark)
await tasks.start(subtask.id);

// ... do implementation work ...

// Complete task with learnings (auto-squashes commits, bubbles learnings to parent)
await tasks.complete(subtask.id, {
  result: "Implemented using jose library",
  learnings: ["Use jose instead of jsonwebtoken"]
});
```
