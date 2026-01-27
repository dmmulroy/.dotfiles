# Overseer Codemode MCP API

Execute JavaScript code to interact with Overseer task management.

## Task Interface

```typescript
interface Task {
  id: string;
  parentId: string | null;
  description: string;
  context: { own: string; parent?: string; milestone?: string };
  learnings: { milestone: Learning[]; parent: Learning[] };
  priority: 1 | 2 | 3 | 4 | 5;
  completed: boolean;
  depth: 0 | 1 | 2;
  blockedBy: string[];
  blocks: string[];
  result: string | null;    // Completion result from tasks.complete()
  commitSha: string | null; // Commit ID when task completed
  createdAt: string;        // ISO 8601 timestamp
  updatedAt: string;        // ISO 8601 timestamp
  startedAt: string | null; // Set when tasks.start() called
  completedAt: string | null; // Set when tasks.complete() called
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
  get(id: string): Promise<Task>;
  create(input: {
    description: string;
    context?: string;
    parentId?: string;
    priority?: 1 | 2 | 3 | 4 | 5;
    blockedBy?: string[];
  }): Promise<Task>;
  update(id: string, input: {
    description?: string;
    context?: string;
    priority?: 1 | 2 | 3 | 4 | 5;
    parentId?: string;
  }): Promise<Task>;
  start(id: string): Promise<Task>;
  complete(id: string, result?: string): Promise<Task>;
  reopen(id: string): Promise<Task>;
  delete(id: string): Promise<void>;
  block(taskId: string, blockerId: string): Promise<void>;
  unblock(taskId: string, blockerId: string): Promise<void>;
  nextReady(milestoneId?: string): Promise<Task | null>;
};
```

| Method | Description |
|--------|-------------|
| `list` | Filter by `parentId`, `ready`, `completed` |
| `get` | Get single task by ID |
| `create` | Create task with description, context, parentId, priority, blockedBy |
| `update` | Update description, context, priority, parentId |
| `start` | Mark started + **creates VCS bookmark**, records start commit |
| `complete` | Mark complete + **squashes commits**, rebases onto parent bookmark |
| `reopen` | Reopen completed task |
| `delete` | Delete task + **cleans up VCS bookmark** |
| `block` | Add blocker relationship |
| `unblock` | Remove blocker relationship |
| `nextReady` | Get next ready task (optionally scoped to milestone) |

## Learnings API

```typescript
declare const learnings: {
  add(taskId: string, content: string, sourceTaskId?: string): Promise<Learning>;
  list(taskId: string): Promise<Learning[]>;
  delete(id: string): Promise<void>;
};
```

| Method | Description |
|--------|-------------|
| `add` | Add learning to task (optionally from source task) |
| `list` | List learnings for task |
| `delete` | Delete learning by ID |

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

// Complete task (auto-squashes commits) and add learning
await tasks.complete(subtask.id, "Implemented using jose library");
await learnings.add(subtask.id, "Use jose instead of jsonwebtoken");
```
