---
name: tech-spec
description: Tech spec workflow. Use when the user asks to write, convert, re-outline, or review a technical spec / typed design spec / implementation handoff, or wants to start one without enough context.
---

# Tech Spec

A tech spec is a **typed call-stack architecture handoff**: code-shaped contracts plus execution flows. Prefer TypeScript pseudocode over prose wherever precision matters.

Treat `../coding-standards/` as the standards package and `../tdd/` as the testing package for this workflow.

## Branch selection

1. Use **Path A: Convert context to spec** when the conversation, docs, or codebase already contain enough background to describe the change.
2. Use **Path B: Grill first** when the user wants a new spec but has not provided the problem, constraints, design direction, affected code, or acceptance criteria.

Completion criterion: the branch is chosen from the actual available context; missing architectural decisions are not invented.

## Path A: Convert context to spec

1. Load standards and local context.
   - Read `../coding-standards/PRINCIPLES.md`, `../coding-standards/VOCABULARY.md`, and `../coding-standards/MODULES.md`.
   - Read `../coding-standards/TYPESCRIPT.md`, `../coding-standards/CLOUDFLARE.md`, or `../coding-standards/EFFECT.md` when the spec touches those topics.
   - Read `../tdd/SKILL.md` before writing the test plan.
   - Inspect existing code/docs for local vocabulary, module layout, error handling, adapters, observability, and test style when a repo is available.
   - Completion criterion: the spec uses project vocabulary and does not introduce a new pattern before checking local precedent.

2. Extract the design from context.
   - Capture the current state, problem, goals, non-goals, constraints, invariants, risks, and open questions.
   - Mark unknowns as open questions instead of filling gaps with plausible design.
   - Completion criterion: every claimed requirement or constraint is grounded in conversation, code, docs, or an explicit open question.

3. Specify the typed contracts.
   - Outline every new, changed, or deleted type, interface, API, function signature, request/response shape, domain value, tagged error, and module contract.
   - Name seams, adapters, implementations, ownership boundaries, and what crosses each boundary.
   - State what each layer may know and what must not leak across the seam.
   - Completion criterion: every new or changed boundary has a concrete type/interface/API sketch, or an explicit reason no new contract is needed.

4. Specify call stacks and data flow.
   - For every new, changed, or deleted code path, show the call stack from entrypoint to side effects and response.
   - Include input/output type flow through the stack: raw input, parsed values, canonical domain types, service inputs, adapter calls, result types, errors, and serialized output.
   - Include old vs new call stacks when refactoring existing behavior.
   - Include failure, retry, cancellation, transactionality, idempotency, observability, and authorization flow when reachable.
   - Completion criterion: every affected behavior has an end-to-end call stack and type/data-flow trace.

5. Map files and modules.
   - List new files, changed files, deleted files, and test files.
   - For each file, state the contract, code path, or test responsibility it owns.
   - Completion criterion: every contract and call-stack step maps to a file/module or an open question.

6. Write the RGR TDD plan.
   - Plan tests as vertical Red-Green-Refactor slices: one failing behavior test, minimal implementation, repeat.
   - Favor behavior through public interfaces and real seams over implementation-coupled mocks.
   - Cover happy paths, failure paths, regressions, invariants, adapter contracts, and end-to-end flows proportionately.
   - Completion criterion: every public behavior, invariant, important failure path, and changed seam has a red test or an explicit reason not to test it.

7. Produce the spec.
   - Save to the requested path when the user asks for a file; otherwise return the spec inline.
   - Do not implement unless the user explicitly asks.
   - Completion criterion: the output follows the outline below and is implementation-ready for another engineer.

## Path B: Grill first

1. Do not write a full spec yet.
   - State that there is not enough context for an implementation-ready tech spec.
   - Completion criterion: the agent has not invented requirements, APIs, files, or call stacks.

2. Start a grilling interview.
   - Use `/grill-with-docs` when the user wants docs, ADRs, glossary/domain language, or durable design artifacts created during discovery.
   - Otherwise use `/grill-me`.
   - Ask one question at a time and provide the recommended answer with each question.
   - If a question can be answered by exploring the codebase, inspect the codebase instead of asking.
   - Completion criterion: the interview has enough context for Path A: problem, users/callers, constraints, affected systems, desired behavior, boundaries, likely APIs, invariants, risks, and acceptance tests.

3. Convert to the spec.
   - Once the grilling context is sufficient, run Path A.
   - Completion criterion: the final artifact is a typed call-stack architecture handoff, not just interview notes.

## Required spec outline

Use this shape unless the task is tiny enough to compress:

```md
# <Title>

## Summary

## Context / Current State

## Goals

## Non-Goals

## Invariants

## Proposed Design

## Types, Interfaces, and APIs

## Seams, Boundaries, Adapters, and Implementations

## Call Stacks and Data Flow

### Current / Old Flow

### Proposed / New Flow

### Failure Flow

## Files to Add / Change / Delete

## RGR TDD Test Plan

## Migration / Rollout / Backfill

## Risks and Open Questions
```

## Writing rules

- Code first: use TypeScript pseudocode to make contracts, APIs, and data flow concrete.
- Prose explains why; types and call stacks define what changes.
- Prefer precise domain values over strings, booleans, and loosely shaped objects.
- Keep seams real: adapters should translate framework, persistence, network, time, randomness, telemetry, or platform boundaries.
- Avoid speculative abstraction; every seam must earn its existence through invariants, locality, leverage, or a real boundary.
- Keep a single source of truth: do not restate the same rule in multiple sections unless one section points to the other.
