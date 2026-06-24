---
name: codebase-design
description: User-invoked workflow for designing and implementing code in my preferred software-design style.
disable-model-invocation: true
---

# Codebase Design

Design and implement code in the user's preferred style. Treat `../coding-standards/` as the canonical standards package for this run.

## Steps

1. Load the core design standards.
   - Always read `../coding-standards/PRINCIPLES.md`, `../coding-standards/VOCABULARY.md`, and `../coding-standards/MODULES.md`.
   - Completion criterion: the design priorities, architecture vocabulary, module idiom, and seam rules are known before proposing structure.

2. Audit local conventions before designing.
   - Inspect existing choices for module layout, error handling, schema parsing, dependency injection, adapters, observability, testing, toolchain, and platform seams.
   - Reuse matching domain concepts, parsers, adapters, services, and prelude helpers when they fit.
   - Completion criterion: every new pattern, library, adapter, or abstraction has been checked against local precedent.

3. Load relevant topic standards and frame the problem in domain terms.
   - Read `../coding-standards/TYPESCRIPT.md`, `../coding-standards/CLOUDFLARE.md`, or `../coding-standards/EFFECT.md` when the task touches those topics.
   - Identify domain concepts, invariants, lifecycle states, trust seams, expected failures, runtime hops, persistence seams, cancellation/retry paths, and verification obligations.
   - Prefer the user's vocabulary: Expected Failure, Adapter, Interface, Seam, Depth, Deep Module, Leverage, Locality, State Machine, Functional Core, Imperative Shell, Real Seam Test, etc.
   - Completion criterion: the design problem is stated as domain behavior and seams, and each relevant topic file is loaded before choosing that part of the design.

4. Choose the simplest deep design.
   - Make illegal states unrepresentable where practical.
   - Parse early and pass precise values inward.
   - Keep functional core behavior entrypoint-agnostic.
   - Put I/O, framework translation, telemetry, time/randomness, and dependency construction in the imperative shell or composition seam.
   - Prefer deep cohesive modules, narrow dependency interfaces, and constructor injection outside Effect; use Effect services/layers in Effect codebases.
   - Avoid speculative seams, shallow wrappers, dependency bags, repository-per-table habit, and drive-by migrations.
   - For consequential interfaces, sketch two or three materially different interface shapes before choosing; use parallel agents when the design space is wide enough to benefit from independent attempts.
   - Completion criterion: each proposed module/interface earns its seam by reducing caller burden, preserving invariants, improving leverage/locality, or translating a real seam.

5. Design failure, async, and verification alongside the implementation.
   - Expected failures are typed values; unrecoverable defects may throw.
   - Cancellation and retries are first-class when reachable.
   - Mutating/retryable work has an idempotency or atomicity strategy.
   - Verification uses observable behavior through real seams, with property tests for general invariants where useful.
   - Completion criterion: the plan accounts for meaningful failure paths, concurrency/retry risks, and evidence needed for trust.

6. Implement locally and proportionately when asked to code.
   - Make the smallest change that satisfies the design.
   - Follow established project style unless it conflicts with correctness, safety, debuggability, or an explicit user request.
   - Run or recommend the relevant checks/tests.
   - Completion criterion: the implementation, tests, and handoff preserve local conventions while moving the changed area toward these standards.

## Output shape

For design-only work, return this shape when the task is large enough to benefit from it; for tiny tasks, compress to only the relevant bullets:

- domain model and invariants
- proposed modules/seams
- seam/failure/async strategy
- verification plan
- trade-offs and rejected alternatives

For implementation work, return:

- concise summary of changes
- standards-sensitive decisions made
- tests/checks run or not run
- follow-up risks, if any
