---
description: Load spec-planner skill for dialogue-driven spec development
---

Load the spec-planner skill and develop implementation-ready specs through iterative dialogue.

## Conversation Phases (State Machine)

```
CLARIFY ──[user responds]──► DISCOVER ──[done]──► DRAFT ──[complete]──► REFINE ──[approved]──► DONE
   │                            │                   │                      │
   └──[still ambiguous]──◄──────┴───────────────────┴────[gaps found]──────┘
```

**State each phase at end of response:**
```
---
Phase: CLARIFY | Waiting for: answers to questions 1-4
```

**Phase transitions:**
- CLARIFY → DISCOVER: User answered questions AND no new ambiguities
- DISCOVER → DRAFT: System context understood
- DRAFT → REFINE: Spec produced, needs review
- REFINE → DONE: Completeness check passes + user approval

## Workflow

### Step 1: Load spec-planner skill

Use the skill tool:
```
skill(name="spec-planner")
```

### Step 2: Identify planning type from user request

Analyze $ARGUMENTS to determine:
- **Planning type**: Feature plan, architecture decision, refactoring evaluation, work planning, technical strategy
- **Scope**: Single component, cross-cutting, system-wide
- **Unknowns**: Any unfamiliar tech, frameworks, or APIs mentioned

### Step 3: Clarify before planning (MANDATORY)

**Before any planning work:**

1. Read the request. Identify what's ambiguous or assumed.
2. Ask 3-5 clarifying questions that would change your approach.
3. **STOP and wait for user response.**

```
Before I plan this, I need to understand:

1. [Scope question]
2. [Motivation question]  
3. [Constraint question]
4. [Edge case question]

Once I understand these, I can give you a proper plan.
```

**Skip clarification ONLY if:**
- Request is highly specific with bounded scope
- Constraints are explicit in the request
- You'd give the same plan regardless of reasonable answers

If skipping, state: "Proceeding without clarification because [reason]."

### Escape Prevention

**Even if the request seems complete, ALWAYS ask at least 2 clarifying questions.**

Skip clause is for truly mechanical requests (e.g., "rename X to Y"). For any feature, architecture, or planning request, dialogue is mandatory.

**Anti-patterns to resist:**
- "Just give me a rough plan" → Still needs scope questions
- "I'll figure out the details" → Those details ARE the spec
- Very long initial request → Longer ≠ clearer; probe assumptions

**Hard rule:** No spec document until user has responded to at least one round of questions.

### Step 4: Discover existing system

**After clarification, before planning:** Understand what exists.

Launch explore subagents (in parallel when areas are independent):

```
Task(
  subagent_type="explore",
  description="Explore [area name]",
  prompt="Explore [specific area] for [planning context]. Return: key files, abstractions, patterns, integration points, test coverage."
)
```

**Discovery targets based on request:**

| Planning Type | Explore |
|---------------|---------|
| Feature plan | Affected modules, similar features, shared abstractions |
| Architecture | Current architecture, integration points, data flows |
| Refactoring | Code to change, dependencies, test coverage |
| Tech decision | Existing patterns, tech already in use |

**Parallelize:** If feature touches auth AND payments, launch two explore agents simultaneously.

**Output:** Brief architecture summary before proceeding.

### Step 5: Research unfamiliar technology (if needed)

If the request involves technology, frameworks, or APIs you're not confident about, **invoke Librarian**:

```
Task(
  subagent_type="librarian",
  description="Research [tech name]",
  prompt="Research [specific tech] for [use case]. Return: recommended patterns, gotchas, how production systems use it."
)
```

**Always research before recommending** when:
- Specific library/framework mentioned you haven't used extensively
- Comparing implementation approaches
- Need current best practices (not training data)
- Integration patterns between systems

### Step 6: Synthesize context

Combine findings from:
- User answers to clarifying questions
- Explore agent discoveries
- Librarian research (if any)

Summarize before planning:
```
=== System Context ===

Affected areas: [from explore]
Existing patterns: [how similar things work]
Key constraints: [from user + discovery]
Tech considerations: [from librarian, if invoked]
```

### Step 7: Apply planning framework

Use the appropriate template from the skill:
- **Quick Decision** — For scoped technical choices
- **Feature Plan** — For new feature development
- **ADR** — For significant architecture decisions

### Step 8: Provide trade-off analysis

Every recommendation must include:
1. What we're choosing and why
2. What we're trading away
3. When to reconsider this decision
4. Effort estimate (S/M/L/XL)

### Step 9: Read reference docs if needed

For complex decisions, read from `references/`:

| Situation | Reference |
|-----------|-----------|
| Multi-factor prioritization | decision-frameworks.md |
| Breaking down work | estimation.md |
| Evaluating refactor ROI | technical-debt.md |

### Step 10: Spec Completeness Check

**Before declaring spec complete, verify:**

| Criterion | Check |
|-----------|-------|
| **Scope bounded** | Every deliverable listed; non-goals explicit |
| **Ambiguity resolved** | No "TBD" or "to be determined" |
| **Acceptance testable** | Each criterion is pass/fail verifiable |
| **Dependencies ordered** | Clear what blocks what |
| **Types defined** | Data shapes specified (not "some object") |
| **Effort estimated** | Each deliverable has S/M/L/XL |
| **Risks identified** | At least 2 risks with mitigations |
| **Open questions** | Resolved OR assigned owner |

**If any criterion fails:** Return to dialogue. "To finalize, I need clarity on: [failing criteria]."

**Spec is DONE when:**
1. All criteria pass
2. User explicitly approves
3. Open questions have owners

### Step 11: Summarize

```
=== Spec Complete ===

Phase: DONE
Type: <feature plan | architecture decision | refactoring | strategy>
Effort: <S/M/L/XL>
Status: Ready for task breakdown

Discovery:
- Explored: <areas investigated>
- Key findings: <relevant architecture/patterns>

Recommendation:
<brief summary>

Key Trade-offs:
- <what we're choosing vs alternatives>

Deliverables (Ordered):
1. [D1] (effort) — depends on: -
2. [D2] (effort) — depends on: D1

Open Questions:
- [ ] <if any remain> → Owner: [who]
```

<user-request>
$ARGUMENTS
</user-request>
