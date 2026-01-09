---
name: prd-task
description: Convert markdown PRDs to executable JSON format. Use after creating a PRD with the prd skill to generate the prd.json for autonomous task completion.
---

# PRD Task Skill

Convert markdown PRDs to executable JSON format for autonomous task completion.

The PRD defines the **end state** via tasks with verification steps. The agent decides HOW to get there.

Based on [Anthropic's research on long-running agents](https://www.anthropic.com/engineering/effective-harnesses-long-running-agents).

## Workflow

1. User requests: "Load the prd-task skill and convert prd-<name>.md"
2. Read the markdown PRD
3. Extract tasks with verification steps
4. Create `.opencode/state/<prd-name>/` directory
5. Move markdown PRD to `.opencode/state/<prd-name>/prd.md`
6. Output JSON to `.opencode/state/<prd-name>/prd.json`
7. Create empty `.opencode/state/<prd-name>/progress.txt`

State folder structure:
```
.opencode/state/<prd-name>/
├── prd.md       # Original markdown PRD (moved from project root)
├── prd.json     # Converted JSON for task execution
└── progress.txt # Empty file to track progress
```

## Input Format

Expects markdown PRD with end-state focus:

```markdown
# PRD: <Feature Name>

## End State
- [ ] Users can register
- [ ] Users can log in
- [ ] Auth is secure

## Tasks

### User Registration [functional]
User can register with email and password.

**Verification:**
- POST /api/auth/register with valid email/password
- Verify 201 response with user object
- Verify password not in response
- Attempt duplicate email, verify 409

### User Login [functional]
User can log in and receive JWT token.

**Verification:**
- POST /api/auth/login with valid credentials
- Verify 200 response with token
- Attempt invalid credentials, verify 401

## Context

### Patterns
- API routes: `src/routes/items.ts`

### Key Files
- `src/db/schema.ts`

### Non-Goals
- OAuth/social login
- Password reset
```

## Output Format

Move PRD and generate JSON in `.opencode/state/<prd-name>/`:
- `prd.md` - Original markdown (moved from source location)
- `prd.json` - Converted JSON:

```json
{
  "prdName": "<prd-name>",
  "tasks": [
    {
      "id": "functional-1",
      "category": "functional",
      "description": "User can register with email and password",
      "steps": [
        "POST /api/auth/register with valid email/password",
        "Verify 201 response with user object",
        "Verify password not in response",
        "Attempt duplicate email, verify 409"
      ],
      "passes": false
    }
  ],
  "context": {
    "patterns": ["API routes: src/routes/items.ts"],
    "keyFiles": ["src/db/schema.ts"],
    "nonGoals": ["OAuth/social login", "Password reset"]
  }
}
```

## Schema Details

### Task Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, e.g. "db-1", "api-auth", "setup-deps" |
| `category` | string | Grouping: "functional", "ui", "api", "security", "testing", etc. |
| `description` | string | What the task does when complete |
| `steps` | string[] | **Verification steps** - how to test it works |
| `passes` | boolean | Set to `true` when ALL steps verified |

### Key Points

- **Steps are verification, not implementation** - They describe HOW TO TEST, not how to build
- **Category is flexible** - Use what fits your codebase
- **ID format**: `<category>-<number>` or descriptive like `"api-auth"`, `"db-schema"`
- **Context helps agent explore** - Patterns and key files guide initial exploration

## Conversion Rules

### Task Sizing

Keep tasks small and focused:

- One logical change per task
- If a PRD section feels too large, break it into multiple tasks
- Prefer many small tasks over few large ones
- Each task should be completable in one commit

Quality over speed. Small steps compound into big progress.

### Tasks from Markdown
- Each `### Title [category]` becomes a task
- Generate `id` as `<category>-<number>` (e.g., "db-1", "api-2") or descriptive slug
- Text after title is the `description`
- Items under `**Verification:**` become `steps`
- `passes` always starts as `false`
- **Split large sections** into multiple focused tasks

### Context Preserved
- `context.patterns` - existing code patterns to follow
- `context.keyFiles` - files to explore first
- `context.nonGoals` - explicit scope boundaries

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Field Rules

**READ-ONLY except:**
- `passes`: Set to `true` when ALL verification steps pass

**NEVER edit or remove tasks** - This could lead to missing functionality.

## PRD Name

Derive from PRD title:
- `# PRD: User Authentication` -> `"prdName": "user-authentication"`

## After Conversion

Tell the user:

```
PRD converted and moved to .opencode/state/<prd-name>/
  - prd.md (moved from <original-path>)
  - prd.json (generated)
  - progress.txt (empty)

PRD: <prd-name>
Tasks: X total
  - functional: N
  - testing: N

Non-goals (excluded): <list>

To complete tasks:
  /complete-next-task <prd-name>

This will:
1. Get bearings (read progress, check history, verify environment)
2. Choose a task to implement
3. Implement until all verification steps pass
4. Commit and update progress
```

## Example

### Input: prd-favorites.md

```markdown
# PRD: User Favorites

## End State
- [ ] Users can favorite items
- [ ] Favorites persist
- [ ] Users can list favorites

## Tasks

### Favorites Storage [db]
Database table for storing favorites.

**Verification:**
- Favorites table exists with userId, itemId, createdAt
- Unique constraint prevents duplicates
- Foreign keys reference users and items tables

### Add Favorite [api]
User can add an item to favorites.

**Verification:**
- POST /api/favorites with itemId
- Verify 201 response
- Verify item appears in database
- Attempt duplicate, verify 409
- Attempt without auth, verify 401

### List Favorites [api]
User can retrieve their favorites.

**Verification:**
- GET /api/favorites returns array
- Results are paginated (20 per page)
- Results sorted by createdAt desc
- Only returns current user's favorites

## Context

### Patterns
- API routes: `src/routes/items.ts`
- Auth middleware: `src/middleware/auth.ts`

### Key Files
- `src/db/schema.ts`

### Non-Goals
- Favorite folders
- Sharing favorites
```

### Output: .opencode/state/user-favorites/

**prd.md** - Moved from `prd-favorites.md`

**progress.txt** - Empty file for tracking progress

**prd.json**:

```json
{
  "prdName": "user-favorites",
  "tasks": [
    {
      "id": "db-1",
      "category": "db",
      "description": "Database table for storing favorites",
      "steps": [
        "Favorites table exists with userId, itemId, createdAt",
        "Unique constraint prevents duplicates",
        "Foreign keys reference users and items tables"
      ],
      "passes": false
    },
    {
      "id": "api-1",
      "category": "api",
      "description": "User can add an item to favorites",
      "steps": [
        "POST /api/favorites with itemId",
        "Verify 201 response",
        "Verify item appears in database",
        "Attempt duplicate, verify 409",
        "Attempt without auth, verify 401"
      ],
      "passes": false
    },
    {
      "id": "api-2",
      "category": "api",
      "description": "User can retrieve their favorites",
      "steps": [
        "GET /api/favorites returns array",
        "Results are paginated (20 per page)",
        "Results sorted by createdAt desc",
        "Only returns current user's favorites"
      ],
      "passes": false
    }
  ],
  "context": {
    "patterns": [
      "API routes: src/routes/items.ts",
      "Auth middleware: src/middleware/auth.ts"
    ],
    "keyFiles": ["src/db/schema.ts"],
    "nonGoals": ["Favorite folders", "Sharing favorites"]
  }
}
```
