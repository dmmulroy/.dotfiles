---
description: Manage tasks via Overseer - create, list, start, complete, find ready work
---

Task orchestration via Overseer MCP codemode.

## Workflow

### Step 1: Load overseer skill

```
skill({ name: 'overseer' })
```

### Step 2: Parse request

Analyze $ARGUMENTS to determine operation:

| Request Pattern | Operation |
|-----------------|-----------|
| "list", "show", "status" | `tasks.list()` or `tasks.list({ ready: true })` |
| "next", "ready", "what's next" | `tasks.nextReady()` |
| "create", "add", "new" | `tasks.create()` |
| "start", "begin", "work on" | `tasks.start(id)` |
| "complete", "done", "finish" | `tasks.complete(id, result)` |
| "get", "show task" | `tasks.get(id)` |
| "tree", "hierarchy" | List with parentId to show structure |
| "learn", "learning", "note" | `learnings.add()` |

### Step 3: Execute via Overseer MCP

Use the Overseer MCP `execute` tool to run JavaScript:

```javascript
// Example: find next ready task
const task = await tasks.nextReady();
return task;
```

### Step 4: Report results

Output structured summary:

```
=== Overseer ===

<operation performed>
<task IDs affected>
<current state / next ready work>
```

<user-request>
$ARGUMENTS
</user-request>
