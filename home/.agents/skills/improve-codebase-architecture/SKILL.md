---
name: improve-codebase-architecture
description: Architecture scan for evidence-backed TypeScript refactor candidates.
disable-model-invocation: true
---

# Improve Codebase Architecture

Run an **architecture scan** grounded in `../coding-standards/SKILL.md`. Return one ranked shortlist of refactor candidates within the scan boundary.

**Scan, don’t spec.** Stop at evidence-backed **ownership moves**. Do not edit files, run refactors, update documentation, create ADRs, estimate effort, design final interfaces, or write a tech spec. Record migration, compatibility, rollout, or backfill only as current constraints supported by repository evidence or user intent; do not design them during the scan.

## 1. Set the scan boundary

Use the scope supplied by the user: repository, directory, feature, module, file set, or concern. The boundary controls where candidates may be proposed. Inspect immediate callers, dependencies, composition roots, and tests outside it when needed to establish evidence; record this **evidence halo**, but do not form candidates for it.

When no useful scope is supplied:

1. Inspect the repository shape and major entrypoints.
2. Infer the scope only when the repository is small or one area clearly dominates the request.
3. Otherwise ask one question that lets the user choose the scope.

Read `../coding-standards/SKILL.md`. Search the boundary and its ancestors through the repository root for `CONTEXT.md`, `CONTEXT-MAP.md`, equivalent domain-language files, and decision indexes. Search repository documentation and ADR collections for decisions that name or govern the boundary. Inspect every governing source found, plus precedent in the scoped code, tests, and evidence halo.

**Completion criterion:** The candidate boundary and any evidence halo are explicit; the coding standards are loaded; the prescribed context and decision locations have been searched; every governing source found has been inspected; and relevant precedent has been identified or its absence recorded.

## 2. Build an evidence map

Use file reads and search only. Do not run tests, type checks, linters, formatters, builds, package scripts, or static-analysis commands.

Build a private **evidence map** of the architectural surfaces inside the boundary:

- public and runtime entrypoints;
- domain and application module clusters;
- external, persistence, and process/runtime boundaries;
- side-effect and resource-lifetime owners;
- tests that exercise those seams.

Treat each bullet as an inventory category. For each category, record its surfaces, an equivalent group, or that it is absent or inapplicable with a reason. Group surfaces only when they share the same ownership and call-flow shape, and record representative files for the group.

For each distinct shape, trace at least one behavior from an entrypoint or direct caller through relevant boundaries and side effects, if any, to its caller-visible outcome. Inspect the existing tests at that seam or record that none were found. Record the surface or group, representative files, call path, outcome, existing test evidence, applicable standards, and findings.

**Evidence beats vibes.** Inspect for **architectural friction**: a design burden or correctness risk that is repeated, crosses a boundary, leaks into callers, obscures ownership, or prevents behavior from being tested through a real seam. An isolated code smell is local cleanup, not an architecture candidate.

For this scan, a coding-standard principle is applicable when an inventoried surface handles the concern it governs; repository-before-invention is always applicable. Account internally for each numbered principle:

- classify it as applicable or inapplicable;
- for each applicable principle, record the concrete code, call path, test, value, or runtime seam inspected;
- classify each finding as local cleanup or architectural friction.

For broad scans, parallel exploration may gather observations, but final candidate formation and ranking remain one synthesis.

**Completion criterion:** Every inventory category is traced, represented by a recorded equivalent group, or marked absent or inapplicable with a reason; every evidence-halo excursion and deliberate exclusion is recorded; every numbered standard is accounted for; every applicable standard has inspected evidence; and every retained observation is concrete architectural friction. Unsupported observations are discarded.

## 3. Form, rank, and prune candidates

Architecture changes who owns an invariant, policy, translation, orchestration, side effect, resource lifetime, or runtime coordination. Turn each retained friction into an **ownership move** from the current owner or callers to a proposed owner. Do not design the owner’s final interface.

Rank all candidates within the scan boundary together, rather than by standards category. Rank by **architectural leverage**: the breadth and consequence of concrete burden or risk removed relative to the interface, indirection, or machinery introduced. Consider affected callers, behaviors, runtime ownership, and tests. When leverage is comparable, prefer stronger evidence and then the smaller coherent ownership move.

Merge candidates that address the same root friction or require the same ownership move; treat secondary standards improvements as gains of the stronger candidate. Drop candidates that are aesthetic, evidence-free, contradicted by sound local precedent, speculative flexibility, isolated cleanup, or implementation work disguised as architecture. Keep at most five candidates, including zero when none clears the evidence bar.

Use recommendation strength consistently:

- `Strong` — the friction, ownership move, and leverage are supported by concrete evidence;
- `Worth exploring` — the friction is supported, but the ownership move or leverage depends on an exact unverified claim.

Do not use `Worth exploring` to defer available inspection. Resolve every claim verifiable through permitted reads and searches first; retain a gap only when the required evidence is unavailable through source inspection.

**Completion criterion:** Every surviving candidate names concrete friction, a current-to-proposed ownership move, its leverage basis, existing test evidence, a verification seam, and recommendation strength; every uncertain claim is an exact source-unverifiable evidence gap; and no more than five candidates survive.

## 4. Present the result

Begin every result with a concise scan summary naming the candidate boundary, any evidence halo, covered inventory categories, governing context or decision sources, and material exclusions.

If no candidate survives, state that no evidence-backed architecture candidate was found and explain why observed signals were pruned. Do not manufacture a top recommendation or ask the user to start the tech-spec workflow.

Otherwise, return concise candidate cards in ranked order. Cite enough representative evidence to prove the friction, not every occurrence:

```md
### <Candidate title> — <Strong | Worth exploring>

- **Standards:** <applicable coding-standard principle names>
- **Files/modules:** `path:line`, `path:line`
- **Current friction:** <caller burden, risk, duplicated policy, poor seam, or test friction>
- **Evidence:** <concrete call path, repetition, leaked representation, invalid state path, or test contortion>
- **Ownership move:** <current owner or callers> -> <proposed owner>
- **Expected leverage:** <burden or risk removed relative to new machinery>
- **Existing test evidence:** <test path:line or none found>
- **Verification seam:** <public interface or real adapter through which the move would be tested>
- **Evidence gap:** <required only for Worth exploring; the exact source-unverifiable claim>
- **Context/ADR note:** <optional; only for a durable term, conflict, or decision>
```

Use a small current/proposed ASCII diagram when call flow, data flow, ownership, or runtime topology is clearer visually than in prose.

Suggest an exact `CONTEXT.md` clarification only for stable domain language. Mention an ADR conflict only when concrete friction justifies revisiting it.

End with:

```md
Top recommendation: <candidate title> — <why it has the greatest architectural leverage>

Which candidate would you like to prepare for the tech-spec workflow?
```

**Completion criterion:** The scan summary exposes the ranking universe; every card follows the candidate contract; every claim traces to cited evidence or an exact evidence gap; and the zero-candidate branch contains no recommendation.

## After selection: prepare the handoff

Stop after presenting the result. Run this branch only after the user selects a candidate.

Prepare a concise brief for `../tech-spec/` containing:

- candidate title and involved files/modules;
- problem, current friction, and gathered evidence;
- current-to-proposed ownership move;
- applicable coding-standard principles;
- known constraints and invariants;
- suspected seams, boundaries, adapters, and call paths;
- open questions;
- context or ADR suggestions, if any.

After the brief, tell the user to invoke `@tech-spec` with it; do not invoke or write the spec inside this skill.

**Completion criterion:** Every claim in the brief traces to scan evidence or is labeled as an open question; every gathered constraint, invariant, and affected path is included; and the user receives the explicit user-invoked handoff.
