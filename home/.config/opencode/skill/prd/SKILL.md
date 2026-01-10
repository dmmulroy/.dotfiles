---
name: prd
description: Create Product Requirements Documents (PRDs) that define the end state of a feature. Use when planning new features, migrations, or refactors. Generates structured PRDs with acceptance criteria.
---

# PRD Creation Skill

Create Product Requirements Documents suitable for RFC review by Principal Engineers, Designers, and Product Owners.

The PRD describes WHAT to build and WHY, not HOW or in WHAT ORDER.

## Workflow

1. User requests: "Load the prd skill and create a PRD for [feature]"
2. **Ask clarifying questions** to build full understanding
3. **Explore codebase** to understand patterns, constraints, and dependencies
4. Generate markdown PRD to `prd-<feature-name>.md` in project root

## Clarifying Questions

Ask questions across these domains.

### Problem & Motivation
- What problem does this solve? Who experiences it?
- What's the cost of NOT solving this? (user pain, revenue, tech debt)
- Why now? What triggered this work?

### Users & Stakeholders
- Who are the primary users? Secondary users?

### End State & Success
- What does "done" look like? How will users interact with it?

### Scope & Boundaries
- What's explicitly OUT of scope?
- What's deferred to future iterations?
- Are there adjacent features that must NOT be affected?

### Constraints & Requirements
- Performance requirements? 
- Security requirements? (auth, data sensitivity, compliance)
- Compatibility requirements? (browsers, versions, APIs)
- Accessibility requirements? (WCAG level, screen readers)

### Risks & Dependencies
- What could go wrong? Technical risks?
- External service dependencies?
- What decisions are still open/contentious?

Keep questions concise. 5-7 at most.

## Output Format

Save to `prd-<feature-name>.md` (project root):

```markdown
# PRD: <Feature Name>

**Date:** <YYYY-MM-DD>  

---

## Problem Statement

### What problem are we solving?
Clear description of the problem. Include user impact and business impact.

### Why now?
What triggered this work? Cost of inaction?

### Who is affected?
- **Primary users:** Description
- **Secondary users:** Description

---

## Proposed Solution

### Overview
One paragraph describing what this feature does when complete.

### User Experience (if applicable)
<!-- Include for user-facing features -->
How will users interact with this feature? Include user flows for primary scenarios.

#### User Flow: <Scenario Name>
1. User does X
2. System responds with Y
3. User sees Z

### Design Considerations (if applicable)
<!-- Include for features with UI/UX components -->
- Visual/interaction requirements
- Accessibility requirements (WCAG level)
- Platform-specific considerations

---

## End State

When this PRD is complete, the following will be true:

- [ ] Capability 1 exists and works
- [ ] Capability 2 exists and works
- [ ] All acceptance criteria pass
- [ ] Tests cover the new functionality
- [ ] Documentation is updated
- [ ] Observability/monitoring is in place

---

## Success Metrics

### Quantitative
| Metric | Current | Target | Measurement Method |
|--------|---------|--------|-------------------|
| Metric 1 | X | Y | How measured |
| Metric 2 | X | Y | How measured |

### Qualitative
- User feedback criteria
- Team/process improvements expected

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
- Pattern 1: `src/path/to/example.ts` - Why relevant
- Pattern 2: `src/path/to/example.ts` - Why relevant

### Key Files
- `src/relevant/file.ts` - Description of relevance
- `src/another/file.ts` - Description of relevance

### System Dependencies
- External services/APIs
- Package requirements
- Infrastructure requirements

### Data Model Changes
<!-- If applicable -->
- New entities/tables
- Schema migrations required
- Data backfill considerations

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Risk 1 | High/Med/Low | High/Med/Low | How to mitigate |
| Risk 2 | High/Med/Low | High/Med/Low | How to mitigate |

---

## Alternatives Considered

### Alternative 1: <Name>
- **Description:** Brief description
- **Pros:** What's good about it
- **Cons:** Why we didn't choose it
- **Decision:** Why rejected

### Alternative 2: <Name>
- **Description:** Brief description
- **Pros:** What's good about it
- **Cons:** Why we didn't choose it
- **Decision:** Why rejected
---

## Non-Goals (v1)

Explicitly out of scope for this PRD:
- Thing we're not building - why deferred
- Future enhancement - why deferred
- Related feature that's separate - why separate

---

## Interface Specifications

### CLI (if applicable)
```
command-name [args] [options]

Options:
  --flag    Description
```

### API (if applicable)
```
POST /api/endpoint
Request: { field: type }
Response: { field: type }
Errors: 4xx/5xx scenarios
```

### UI (if applicable)
Component behavior, states, and error handling.

---

## Documentation Requirements

- [ ] User-facing documentation updates
- [ ] API documentation updates
- [ ] Internal runbook/playbook updates
- [ ] Architecture decision records (ADRs)

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Question 1 | Name | Date | Open/Resolved |
| Question 2 | Name | Date | Open/Resolved |

---

## Appendix

### Glossary
- **Term:** Definition

### References
- Link to related PRDs, ADRs, designs
- External documentation/specs
```

## Key Principles

### Problem Before Solution
- Lead with the problem, not the solution
- Quantify the impact of NOT solving this
- Make the case for why this work matters

### Define End State, Not Process
- Describe WHAT exists when done
- Don't prescribe implementation order
- Don't assign priorities
- Don't create phases

### Technical Context Enables Autonomy
- Show existing patterns to follow
- Reference key files agent should explore
- Agent uses this to make informed decisions

### Non-Goals Prevent Scope Creep
- Explicit boundaries help agent stay focused
- Agent won't accidentally build deferred features

### Risks & Alternatives Show Rigor
- Demonstrate you've thought through what could go wrong
- Show alternatives considered and why rejected
- Builds confidence in the proposed approach

## Bad vs Good Examples

### Bad (Prescriptive / Thin)
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

### Bad (Missing RFC Context)
```markdown
## Overview
We need user authentication.

## Acceptance Criteria
- [ ] Users can register
- [ ] Users can log in
```
Missing: Why? What problem? Success metrics? Risks? Alternatives?

### Good (RFC-Ready)
```markdown
## Problem Statement

### What problem are we solving?
Users currently can't persist data across sessions. 47% of users drop off 
when asked to re-enter information. This costs ~$50k/month in lost conversions.

### Why now?
Q4 retention initiative. Competitor X launched auth last month.

### Who is affected?
- **Primary users:** End users who want persistent sessions
- **Secondary users:** Support team handling "lost data" tickets (~200/week)

---
## End State

When complete:
- [ ] Users can register with email/password
- [ ] Users can log in and receive JWT
- [ ] Auth endpoints have >80% test coverage
- [ ] Monitoring dashboards track auth success/failure rates

---

## Acceptance Criteria

### Registration
- [ ] POST /api/auth/register creates user
- [ ] Password is hashed (bcrypt, cost factor 12)
- [ ] Duplicate email returns 409
- [ ] Invalid input returns 400 with details

### Login
- [ ] POST /api/auth/login returns JWT
- [ ] Invalid credentials return 401 (no user enumeration)
- [ ] Token expires in 24h, refresh token in 7d
---
## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Credential stuffing | High | High | Rate limiting + CAPTCHA after 3 failures |
| Token theft | Med | High | Short expiry + secure cookie flags |

---

## Alternatives Considered

### Alternative 1: OAuth-only (Google/GitHub)
- **Pros:** No password storage liability
- **Cons:** Some users don't have/want social accounts
- **Decision:** Rejected. Add OAuth in v2, but need email/password baseline.

---
## After PRD Creation

### RFC Review Checklist

Before marking PRD ready for review and sharing with the user, verify:

- [ ] Technical risks identified and mitigated
- [ ] User flows documented (if applicable)
- [ ] Edge cases and error states covered (if applicable)
- [ ] Accessibility requirements specified (if applicable)
- [ ] Design considerations captured (if applicable)
- [ ] Problem statement is clear and compelling
- [ ] Scope boundaries explicit

Tell the user:

PRD saved to prd-<name>.md
```
