---
name: prd
description: Create Product Requirements Documents (PRDs) that define the end state of a feature. Use when planning new features, migrations, or refactors. Generates structured PRDs with acceptance criteria for Ralph to execute.
---

# PRD Creation Skill

Create Product Requirements Documents that define the **end state** of a feature.

The PRD describes WHAT to build, not HOW or in WHAT ORDER. Ralph (the agent) decides implementation path.

## Workflow

1. User requests: "Load the prd skill and create a PRD for [feature]"
2. **Ask clarifying questions** to understand the end state
3. **Explore codebase** to understand patterns and context
4. Generate markdown PRD to `prd-<feature-name>.md` in project root

## Clarifying Questions

Focus on understanding the **definition of done**:

- **End state**: What does the feature look like when complete?
- **Scope boundary**: What's explicitly out of scope?
- **Success criteria**: How do we know it works?
- **Constraints**: Performance, security, compatibility requirements?
- **Context**: What existing code/patterns should be leveraged?

Keep questions concise. 3-5 max per round.

## Output Format

Save to `prd-<feature-name>.md` (project root):

```markdown
# PRD: <Feature Name>

**Date:** <YYYY-MM-DD>
---

## Overview

One paragraph describing what this feature does when complete.

---

## End State

When this PRD is complete, the following will be true:

- [ ] Capability 1 exists and works
- [ ] Capability 2 exists and works
- [ ] All acceptance criteria pass
- [ ] Tests cover the new functionality

---

## Acceptance Criteria

### Feature: <Name>
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Feature: <Name>
- [ ] Criterion 1
- [ ] Criterion 2

---

## Technical Context

### Existing Patterns
- Pattern 1: `src/path/to/example.ts`
- Pattern 2: `src/path/to/example.ts`

### Key Files
- `src/relevant/file.ts` - Description of relevance
- `src/another/file.ts` - Description of relevance

### Dependencies
- External service/API if any
- Package requirements if any

---

## Non-Goals (v1)

Explicitly out of scope for this PRD:
- Thing we're not building
- Future enhancement deferred
- Related feature that's separate

---

## Interface Specifications

<!-- Only include if user-facing interfaces need precise definition -->

### CLI (if applicable)
```
command-name [args] [options]
```

### API (if applicable)
```
POST /api/endpoint
Request: { ... }
Response: { ... }
```

### UI (if applicable)
Component behavior and states.

---

## Open Questions

- Unresolved decisions (if any)
```

## Key Principles

### Define End State, Not Process
- Describe WHAT exists when done
- Don't prescribe implementation order
- Don't assign priorities - agent decides
- Don't create phases - agent determines path

### Acceptance Criteria are Checkboxes
- Each criterion is independently verifiable
- Agent marks them complete as it works
- All checked = PRD complete

### Technical Context Enables Autonomy
- Show existing patterns to follow
- Reference key files agent should explore
- Agent uses this to make informed decisions

### Non-Goals Prevent Scope Creep
- Explicit boundaries help agent stay focused
- Agent won't accidentally build deferred features

## Bad vs Good Examples

### Bad (Prescriptive)
```markdown
## Implementation Phases

### Phase 1: Database
1. Create users table
2. Add indexes

### Phase 2: API
1. Build registration endpoint
2. Build login endpoint

### Phase 3: Tests
1. Write unit tests
2. Write integration tests
```

### Good (End State)
```markdown
## End State

When complete:
- [ ] Users can register with email/password
- [ ] Users can log in and receive JWT
- [ ] Auth endpoints have >80% test coverage

## Acceptance Criteria

### Registration
- [ ] POST /api/auth/register creates user
- [ ] Password is hashed (never stored plain)
- [ ] Duplicate email returns 409
- [ ] Invalid input returns 400 with details

### Login
- [ ] POST /api/auth/login returns JWT
- [ ] Invalid credentials return 401
- [ ] Token expires in 24h
```

## After PRD Creation

Tell the user:

```
PRD saved to prd-<name>.md

Next steps:
1. Review the PRD - refine acceptance criteria as needed
2. Load the ralph skill to convert to prd.json
3. Run: /ralph <branch-name> [max_iterations]

Ralph will decide implementation order based on dependencies it discovers.
```
