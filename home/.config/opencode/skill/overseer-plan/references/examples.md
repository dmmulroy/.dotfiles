# Examples

## Example 1: With Breakdown

### Input (`auth-plan.md`)

```markdown
# Plan: Add Authentication System

## Implementation
1. Create database schema for users/tokens
2. Implement auth controller with endpoints
3. Add JWT middleware for route protection
4. Build frontend login/register forms
5. Add integration tests
```

### Execution

```javascript
const milestone = await tasks.create({
  description: "Add Authentication System",
  context: `# Add Authentication System\n\n## Implementation\n1. Create database schema...`,
  priority: 3
});

const subtasks = [
  "Create database schema for users/tokens",
  "Implement auth controller with endpoints",
  "Add JWT middleware for route protection",
  "Build frontend login/register forms",
  "Add integration tests"
];

for (const desc of subtasks) {
  await tasks.create({ description: desc, parentId: milestone.id });
}

return { milestone: milestone.id, subtaskCount: subtasks.length };
```

### Output

```
Created milestone task_01ABC from plan

Analyzed plan structure: Found 5 distinct implementation steps
Created 5 subtasks:
- task_02XYZ: Create database schema for users/tokens
- task_03ABC: Implement auth controller with endpoints
- task_04DEF: Add JWT middleware for route protection
- task_05GHI: Build frontend login/register forms
- task_06JKL: Add integration tests

View structure: execute `await tasks.list({ parentId: "task_01ABC" })`
```

## Example 2: No Breakdown

### Input (`bugfix-plan.md`)

```markdown
# Plan: Fix Login Validation Bug

## Problem
Login fails when username has spaces

## Solution
Update validation regex in auth.ts line 42
```

### Execution

```javascript
const milestone = await tasks.create({
  description: "Fix Login Validation Bug",
  context: `# Fix Login Validation Bug\n\n## Problem\nLogin fails...`,
  priority: 3
});

return { milestone: milestone.id, breakdown: false };
```

### Output

```
Created milestone task_01ABC from plan

Plan describes a cohesive single task. No subtask breakdown needed.

View task: execute `await tasks.get("task_01ABC")`
```

## Example 3: Epic-Level (Two-Level Hierarchy)

### Input (`full-auth-plan.md`)

```markdown
# Complete User Authentication System

## Phase 1: Backend Infrastructure
1. Database schema for users/sessions
2. Password hashing with bcrypt
3. JWT token generation

## Phase 2: API Endpoints
1. POST /auth/register
2. POST /auth/login
3. POST /auth/logout

## Phase 3: Frontend
1. Login/register forms
2. Protected routes
3. Session persistence
```

### Execution

```javascript
const milestone = await tasks.create({
  description: "Complete User Authentication System",
  context: `<full-markdown>`,
  priority: 3
});

const phases = [
  { name: "Backend Infrastructure", items: ["Database schema", "Password hashing", "JWT tokens"] },
  { name: "API Endpoints", items: ["POST /auth/register", "POST /auth/login", "POST /auth/logout"] },
  { name: "Frontend", items: ["Login/register forms", "Protected routes", "Session persistence"] }
];

for (const phase of phases) {
  const phaseTask = await tasks.create({
    description: phase.name,
    parentId: milestone.id
  });
  for (const item of phase.items) {
    await tasks.create({ description: item, parentId: phaseTask.id });
  }
}

return milestone;
```

### Output

```
Created milestone task_01ABC from plan

Analyzed plan structure: Found 3 major phases
Created as milestone with 3 tasks:
- task_02XYZ: Backend Infrastructure (3 subtasks)
- task_03ABC: API Endpoints (3 subtasks)
- task_04DEF: Frontend (3 subtasks)

View structure: execute `await tasks.list({ parentId: "task_01ABC" })`
```
