---
name: ralph-prd
description: Convert markdown PRDs to Ralph-executable JSON format. Use after creating a PRD with the prd skill to generate the prd.json that Ralph uses for autonomous implementation.
---

# Ralph Skill

Convert markdown PRDs to Ralph-executable JSON format.

Ralph is an autonomous coding agent. The PRD defines the **end state** via features with verification steps. Ralph decides HOW to get there.

Based on [Anthropic's research on long-running agents](https://www.anthropic.com/engineering/effective-harnesses-long-running-agents).

## Workflow

1. User requests: "Load the ralph skill and convert prd-<name>.md"
2. Read the markdown PRD
3. Extract features with verification steps
4. Create `.opencode/state/ralph/<branch-name>/` directory
5. Move markdown PRD to `.opencode/state/ralph/<branch-name>/prd.md`
6. Output JSON to `.opencode/state/ralph/<branch-name>/prd.json`
7. Create empty `.opencode/state/ralph/<branch-name>/progress.txt`

State folder structure:
```
.opencode/state/ralph/<branch-name>/
├── prd.md       # Original markdown PRD (moved from project root)
├── prd.json     # Converted JSON for Ralph
└── progress.txt # Empty file for Ralph to track progress
```

## Input Format

Expects markdown PRD with end-state focus:

```markdown
# PRD: <Feature Name>

## End State
- [ ] Users can register
- [ ] Users can log in
- [ ] Auth is secure

## Features

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

Move PRD and generate JSON in `.opencode/state/ralph/<branch-name>/`:
- `prd.md` - Original markdown (moved from source location)
- `prd.json` - Converted JSON:

```json
{
  "branchName": "<feature-name>",
  "features": [
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

### Feature Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, e.g. "db-1", "api-auth", "setup-deps" |
| `category` | string | Grouping: "functional", "ui", "api", "security", "testing", etc. |
| `description` | string | What the feature does when complete |
| `steps` | string[] | **Verification steps** - how to test it works |
| `passes` | boolean | Ralph sets to `true` when ALL steps verified |

### Key Points

- **Steps are verification, not implementation** - They describe HOW TO TEST, not how to build
- **Category is flexible** - Use what fits your codebase
- **ID format**: `<category>-<number>` or descriptive like `"api-auth"`, `"db-schema"`
- **Context helps agent explore** - Patterns and key files guide initial exploration

## Conversion Rules

### Feature Sizing

Keep features small and focused:

- One logical change per feature
- If a PRD section feels too large, break it into multiple features
- Prefer many small features over few large ones
- Each feature should be completable in one commit

Quality over speed. Small steps compound into big progress.

### Features from Markdown
- Each `### Title [category]` becomes a feature
- Generate `id` as `<category>-<number>` (e.g., "db-1", "api-2") or descriptive slug
- Text after title is the `description`
- Items under `**Verification:**` become `steps`
- `passes` always starts as `false`
- **Split large sections** into multiple focused features

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
- `passes`: Ralph sets to `true` when ALL verification steps pass

**NEVER edit or remove features** - This could lead to missing functionality.

## Branch Name

Derive from PRD title:
- `# PRD: User Authentication` → `"branchName": "user-authentication"`

## After Conversion

Tell the user:

```
PRD converted and moved to .opencode/state/ralph/<branch-name>/
  - prd.md (moved from <original-path>)
  - prd.json (generated)
  - progress.txt (empty)

Branch: <feature-name>
Features: X total
  - functional: N
  - testing: N

Non-goals (excluded): <list>

To run Ralph:
  /ralph <branch-name> [max_iterations]

Ralph will:
1. Get bearings (read progress, git log, verify environment)
2. Choose a feature to implement
3. Implement until all verification steps pass
4. Commit and update progress
5. Repeat until all features pass
```

## Example

### Input: prd-favorites.md

```markdown
# PRD: User Favorites

## End State
- [ ] Users can favorite items
- [ ] Favorites persist
- [ ] Users can list favorites

## Features

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

### Output: .opencode/state/ralph/user-favorites/

**prd.md** - Moved from `prd-favorites.md`

**progress.txt** - Empty file for Ralph to track progress

**prd.json**:

```json
{
  "branchName": "user-favorites",
  "features": [
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
