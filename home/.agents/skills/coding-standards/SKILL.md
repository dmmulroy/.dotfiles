---
name: coding-standards
description: Correct-by-construction TypeScript and Effect standards. Use for TypeScript engineering, Effect code, or when another skill needs the user's coding standards.
---

# TypeScript and Effect Coding Standards

Build **correct by construction**: parse data into meaningful types, make expected failures explicit, keep effects behind cohesive services, and test through real interfaces.

## Decision priority

When rules pull in different directions:

1. Preserve correctness, safety, and debuggability.
2. Apply these standards to new code and the complete behavior being changed.
3. Follow compatible repository architecture and conventions.
4. Contain incompatible older patterns at the nearest existing edge.
5. Keep unrelated behavior unchanged unless a broader migration was requested.
6. Record meaningful trade-offs with comments or ADRs.

## Core principles

- Expected failures are values; defects may throw or panic.
- Parse external and serialized data into domain/application types at the edge.
- Make illegal states unrepresentable where practical.
- Start meaningful services from explicit interfaces.
- Prefer composition, a functional core, and an imperative shell.
- Design deep, cohesive modules with low caller burden.
- Make every abstraction pass the deletion test.
- Test behavior through real interfaces using real or faithful implementations rather than module mocks.
- Prefer the simplest correct design and the least code.

## 1. Establish the local rules

Read the nearest `AGENTS.md`, package configuration, architecture docs, and the changed area's conventions for errors, schemas, services, tests, observability, and files.

Apply the decision priority above when local conventions conflict with these standards.

**Complete when:** the governing files and runtime/library versions have been identified, and every compatible or incompatible local pattern touching the changed behavior is accounted for.

## 2. Trace the behavior and load applicable references

Trace each caller-visible operation from input through every decision and effect to its observable result. Classify each changed concern as domain behavior, application policy, technology/framework mechanics, or composition/resource wiring.

Read every applicable reference completely before designing the change:

- [`references/effect.md`](references/effect.md) — whenever Effect code changes; follow its branch pointers before editing.
- [`references/errors.md`](references/errors.md) — when behavior can fail or absence may be ordinary.
- [`references/sensitive-data-and-observability.md`](references/sensitive-data-and-observability.md) — when behavior handles secrets, personal data, logging, tracing, metrics, or error reporting.
- [`references/parsing-and-schemas.md`](references/parsing-and-schemas.md) — when data crosses an external/serialized edge, a schema changes, or protocol/persistence representations are designed.
- [`references/domain-types-and-state.md`](references/domain-types-and-state.md) — when IDs, units, constrained values, optional inputs, entities, lifecycle states, or operation options change.
- [`references/modules-services-and-adapters.md`](references/modules-services-and-adapters.md) — when behavior owns domain rules, coordinates effects, uses dependencies, crosses technology boundaries, or changes module/service design.
- [`references/persistence.md`](references/persistence.md) — when behavior reads or writes a database, cache, durable object, ORM model, transaction, or persisted record.
- [`references/workflows-transactions-and-idempotency.md`](references/workflows-transactions-and-idempotency.md) — when work spans boundaries, retries, resumes, receives redelivery, delays, compensates, or may execute more than once.
- [`references/configuration-and-resources.md`](references/configuration-and-resources.md) — when behavior reads configuration, creates/closes resources, performs startup work, uses time/randomness, or touches global state.
- [`references/testing.md`](references/testing.md) — whenever behavior, public inference, tests, or test implementations change.
- [`references/typescript-safety.md`](references/typescript-safety.md) — when types, signatures, mutable values, casts, non-null assumptions, or compiler settings change.
- [`references/imports-exports-and-files.md`](references/imports-exports-and-files.md) — when imports, exports, entrypoints, helper placement, or file organization change.
- [`references/comments-and-jsdoc.md`](references/comments-and-jsdoc.md) — when exported symbols, comments, JSDoc, user-facing text, or rendered errors change.

**Complete when:** every changed input, output, failure, dependency, effect, state transition, external representation, and test surface maps to an owning module and an applicable reference.

## 3. Design from the public types inward

Define or confirm the caller-facing input, output, expected errors, and service interfaces before implementing them. Parse less-trusted data before it reaches inner code. Keep domain calculations pure. Put application policy and effect order in the owning service. Keep framework/provider types private to their owner.

Check existing modules, services, clients, Adapters, schemas, errors, and helpers before adding one. Apply the deletion test: an abstraction earns its place when removing it would spread meaningful complexity into callers. For each new abstraction, record the existing owner or direct implementation considered and why it does not fit.

**Complete when:** caller-facing inputs, outputs, expected errors, and service interfaces are explicit; every changed dependency and effect has one owner; each new abstraction has deletion-test evidence for the final report; and framework/provider types remain private to their owner.

## 4. Implement the complete changed behavior

Implement every path required by the caller-visible operation, including expected failures, external translations, diagnostics, and resource behavior. Keep unrelated old behavior unchanged. Preserve existing compatible telemetry and error-reporting hooks.

**Complete when:** every traced path is implemented through its owning interface; expected failures use explicit error values; external data reaches inner code as parsed types; and public application/domain contracts expose application/domain types.

## 5. Verify through public interfaces

Add or update the tests required by [`references/testing.md`](references/testing.md). Run the repository's required verification commands, adding individual typecheck, test, build, or lint commands only when they are not already covered. Re-read each applicable reference and check every changed symbol against it. Fix each exception or report it with concrete evidence.

**Complete when:** every required check passes or has a reported failure with concrete evidence; every applicable reference rule has been checked; every caller-visible feature has its required coverage; every added or changed export is intentional and has the documentation required by [`references/comments-and-jsdoc.md`](references/comments-and-jsdoc.md); each abstraction, helper, and cast in the changed behavior is required and conforms to its applicable reference; and all changes remain within the requested scope.