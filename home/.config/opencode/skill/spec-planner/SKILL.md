---
name: spec-planner
description: Dialogue-driven spec development through skeptical questioning and iterative refinement. Triggers: "spec this out", feature planning, architecture decisions, "is this worth it?" questions, RFC/design doc creation, work scoping. Invoke Librarian for unfamiliar tech/frameworks/APIs.
---

# Spec Planner

Produce implementation-ready specs through rigorous dialogue and honest trade-off analysis.

## Core Philosophy

- **Dialogue over deliverables** — Plans emerge from discussion, not assumption
- **Skeptical by default** — Requirements are incomplete until proven otherwise
- **Second-order thinking** — Consider downstream effects and maintenance burden

## Workflow Phases

```
CLARIFY ──[user responds]──► DISCOVER ──[done]──► DRAFT ──[complete]──► REFINE ──[approved]──► DONE
   │                            │                   │                      │
   └──[still ambiguous]──◄──────┴───────────────────┴────[gaps found]──────┘
```

**State phase at end of every response:**
```
---
Phase: CLARIFY | Waiting for: answers to questions 1-4
```

---

## Phase 1: CLARIFY (Mandatory)

**Hard rule:** No spec until user has responded to at least one round of questions.

1. **STOP.** Do not proceed to planning.
2. Identify gaps in: scope, motivation, constraints, edge cases, success criteria
3. Ask 3-5 pointed questions that would change the approach
4. **Wait for responses**

| Category | Example |
|----------|---------|
| Scope | "Share where? Social media? Direct link? Embed?" |
| Motivation | "What user problem are we actually solving?" |
| Constraints | "Does this need to work with existing privacy settings?" |
| Success | "How will we know this worked?" |

**Escape prevention:** Even if request seems complete, ask 2+ clarifying questions. Skip only for mechanical requests (e.g., "rename X to Y").

**Anti-patterns to resist:**
- "Just give me a rough plan" → Still needs scope questions
- "I'll figure out the details" → Those details ARE the spec
- Very long initial request → Longer ≠ clearer; probe assumptions

**Transition:** User answered AND no new ambiguities → DISCOVER

---

## Phase 2: DISCOVER

**After clarification, before planning:** Understand existing system.

Launch explore subagents in parallel:

```
Task(
  subagent_type="explore",
  description="Explore [area name]",
  prompt="Explore [area]. Return: key files, abstractions, patterns, integration points."
)
```

| Target | What to Find |
|--------|--------------|
| Affected area | Files, modules that will change |
| Existing patterns | How similar features are implemented |
| Integration points | APIs, events, data flows touched |

**If unfamiliar tech involved**, invoke Librarian:

```
Task(
  subagent_type="librarian",
  description="Research [tech name]",
  prompt="Research [tech] for [use case]. Return: recommended approach, gotchas, production patterns."
)
```

**Output:** Brief architecture summary before proposing solutions.

**Transition:** System context understood → DRAFT

---

## Phase 3: DRAFT

Apply planning framework from [decision-frameworks.md](./references/decision-frameworks.md):

1. **Problem Definition** — What are we solving? For whom? Cost of not solving?
2. **Constraints Inventory** — Time, system, knowledge, scope ceiling
3. **Solution Space** — Simplest → Balanced → Full engineering solution
4. **Trade-off Analysis** — See table format in references
5. **Recommendation** — One clear choice with reasoning

Use appropriate template from [templates.md](./references/templates.md):
- **Quick Decision** — Scoped technical choices
- **Feature Plan** — New feature development  
- **ADR** — Architecture decisions
- **RFC** — Larger proposals

**Transition:** Spec produced → REFINE

---

## Phase 4: REFINE

Run completeness check:

| Criterion | Check |
|-----------|-------|
| Scope bounded | Every deliverable listed; non-goals explicit |
| Ambiguity resolved | No "TBD" or "to be determined" |
| Acceptance testable | Each criterion pass/fail verifiable |
| Dependencies ordered | Clear what blocks what |
| Types defined | Data shapes specified (not "some object") |
| Effort estimated | Each deliverable has S/M/L/XL |
| Risks identified | At least 2 risks with mitigations |
| Open questions | Resolved OR assigned owner |

**If any criterion fails:** Return to dialogue. "To finalize, I need clarity on: [failing criteria]."

**Transition:** All criteria pass + user approval → DONE

---

## Phase 5: DONE

### Final Output

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

### Write Spec to File (MANDATORY)

1. Derive filename from feature/decision name (kebab-case)
2. Write spec to `specs/<filename>.md`
3. Confirm: `Spec written to: specs/<filename>.md`

---

## Effort Estimates

| Size | Time | Scope |
|------|------|-------|
| **S** | <1 hour | Single file, isolated change |
| **M** | 1-3 hours | Few files, contained feature |
| **L** | 1-2 days | Cross-cutting, multiple components |
| **XL** | >2 days | Major refactor, new system |

## Scope Control

When scope creeps:
1. **Name it:** "That's scope expansion. Let's finish X first."
2. **Park it:** "Added to Open Questions. Revisit after core spec stable."
3. **Cost it:** "Adding Y changes effort from M to XL. Worth it?"

**Hard rule:** If scope changes, re-estimate and flag explicitly.

## References

| File | When to Read |
|------|--------------|
| [templates.md](./references/templates.md) | Output formats for plans, ADRs, RFCs |
| [decision-frameworks.md](./references/decision-frameworks.md) | Complex multi-factor decisions |
| [estimation.md](./references/estimation.md) | Breaking down work, avoiding underestimation |
| [technical-debt.md](./references/technical-debt.md) | Evaluating refactoring ROI |

## Integration

| Agent | When to Invoke |
|-------|----------------|
| **Librarian** | Research unfamiliar tech, APIs, frameworks |
| **Oracle** | Deep architectural analysis, complex debugging |
