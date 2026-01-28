# Implementation Instructions

**For the skill agent executing `/overseer-plan`.** Follow this workflow exactly.

## Step 1: Read Markdown File

Read the provided file using the Read tool.

## Step 2: Extract Title

- Parse first `#` heading as title
- Strip "Plan: " prefix if present (case-insensitive)
- Fallback: use filename without extension

## Step 3: Create Milestone via MCP

Basic creation:

```javascript
const milestone = await tasks.create({
  description: "<extracted-title>",
  context: `<full-markdown-content>`,
  priority: <priority-if-provided-else-3>
});
return milestone;
```

With `--parent` option:

```javascript
const task = await tasks.create({
  description: "<extracted-title>",
  context: `<full-markdown-content>`,
  parentId: "<parent-id>",
  priority: <priority-if-provided-else-3>
});
return task;
```

Capture returned task ID for subsequent steps.

## Step 4: Analyze Plan Structure

### Breakdown Indicators

1. **Numbered/bulleted implementation lists (3-7 items)**
   ```markdown
   ## Implementation
   1. Create database schema
   2. Build API endpoints
   3. Add frontend components
   ```

2. **Clear subsections under implementation/tasks/steps**
   ```markdown
   ### 1. Backend Changes
   - Modify server.ts
   
   ### 2. Frontend Updates
   - Update login form
   ```

3. **File-specific sections**
   ```markdown
   ### `src/auth.ts` - Add JWT validation
   ### `src/middleware.ts` - Create auth middleware
   ```

4. **Sequential phases**
   ```markdown
   **Phase 1: Database Layer**
   **Phase 2: API Layer**
   ```

### Do NOT Break Down When

- Only 1-2 steps/items
- Plan is a single cohesive fix
- Content is exploratory ("investigate", "research")
- Work items inseparable
- Plan very short (<10 lines)

## Step 5: Validate Atomicity & Acceptance Criteria

For each proposed task, verify:
- **Atomic**: Can be completed in single commit
- **Validated**: Has clear acceptance criteria

If task too large → split further.
If no validation → add to context:

```
Done when: <specific observable criteria>
```

Examples of good acceptance criteria:
- "Done when: `npm test` passes, new migration applied"
- "Done when: API returns 200 with expected payload"
- "Done when: Component renders without console errors"
- "Done when: Type check passes (`tsc --noEmit`)"

## Step 6: Oracle Review

Before creating tasks, invoke Oracle to review the proposed breakdown.

**Prompt Oracle with:**

```
Review this task breakdown for "<milestone>":

1. <task> - Done when: <criteria>
2. <task> - Done when: <criteria>
...

Check:
- Are tasks truly atomic (single commit)?
- Is validation criteria clear and observable?
- Does milestone deliver demoable increment?
- Missing dependencies/blockers?
- Any tasks that should be split or merged?
```

Incorporate Oracle's feedback, then proceed to create tasks.

## Step 7: Create Subtasks (If Breaking Down)

### Extract for Each Subtask

1. **Description**: Strip numbering, keep concise (1-10 words), imperative form
2. **Context**: Section content + "Part of [milestone description]" + acceptance criteria

### Flat Breakdown

```javascript
const subtasks = [
  { description: "Create database schema", context: "Schema for users/tokens. Part of 'Add Auth'.\n\nDone when: Migration runs, tables exist with FK constraints." },
  { description: "Build API endpoints", context: "POST /auth/register, /auth/login. Part of 'Add Auth'.\n\nDone when: Endpoints return expected responses, tests pass." }
];

const created = [];
for (const sub of subtasks) {
  const task = await tasks.create({
    description: sub.description,
    context: sub.context,
    parentId: milestone.id
  });
  created.push(task);
}
return { milestone: milestone.id, subtasks: created };
```

### Epic-Level Breakdown (phases with sub-items)

```javascript
// Create phase as task under milestone
const phase = await tasks.create({
  description: "Backend Infrastructure",
  context: "Phase 1 context...",
  parentId: milestoneId
});

// Create subtasks under phase
for (const item of phaseItems) {
  await tasks.create({
    description: item.description,
    context: item.context,
    parentId: phase.id
  });
}
```

## Step 8: Report Results

### Subtasks Created

```
Created milestone <id> from plan

Analyzed plan structure: Found <N> distinct implementation steps
Created <N> subtasks:
- <id>: <description>
- <id>: <description>
...

View structure: execute `await tasks.list({ parentId: "<id>" })`
```

### No Breakdown

```
Created milestone <id> from plan

Plan describes a cohesive single task. No subtask breakdown needed.

View task: execute `await tasks.get("<id>")`
```

### Epic-Level Breakdown

```
Created milestone <id> from plan

Analyzed plan structure: Found <N> major phases
Created as milestone with <N> tasks:
- <id>: <phase-name> (<M> subtasks)
- <id>: <phase-name> (<M> subtasks)
...

View structure: execute `await tasks.list({ parentId: "<id>" })`
```
