---
description: Convert a markdown plan/spec to Overseer tasks
---

Convert markdown planning documents into trackable Overseer task hierarchies.

## Usage

```
/overseer-plan <file-path>
/overseer-plan <file-path> --priority 3
/overseer-plan <file-path> --parent <task-id>
```

## Workflow

### Step 1: Load skills

```
skill({ name: 'overseer' })
skill({ name: 'overseer-plan' })
```

### Step 2: Parse arguments

Extract from $ARGUMENTS:
- `file-path`: Required - path to markdown file
- `--priority N`: Optional - priority 1-10 (default: 5)
- `--parent ID`: Optional - create as child of existing task

### Step 3: Read and analyze file

1. Read the markdown file
2. Extract title from first `#` heading (strip "Plan: " prefix)
3. Analyze structure for task breakdown

### Step 4: Decide hierarchy depth

**Create subtasks when:**
- 3-7 clearly separable work items
- Implementation spans multiple files/components
- Clear sequential dependencies

**Keep single milestone when:**
- 1-2 steps only
- Work items tightly coupled
- Plan is exploratory/investigative

### Step 5: Create tasks via Overseer MCP

```javascript
// Create milestone with full markdown as context
const milestone = await tasks.create({
  description: "<extracted title>",
  context: "<full markdown content>",
  priority: <priority>,
  parentId: <parentId if provided>
});

// If breaking down, create subtasks
const subtasks = await Promise.all([
  tasks.create({ description: "...", parentId: milestone.id }),
  // ...
]);

return { milestone: milestone.id, subtasks: subtasks.map(t => t.id) };
```

### Step 6: Report results

```
=== Plan Converted ===

Milestone: <id> - <title>
Priority: <N>
Subtasks: <count> created

<list subtask descriptions if any>

Next: `tasks.start("<first-subtask-id>")` to begin work
```

<user-request>
$ARGUMENTS
</user-request>
