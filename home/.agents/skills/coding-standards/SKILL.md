---
name: coding-standards
description: Correct-by-construction TypeScript standards. Use for TypeScript engineering or when another skill needs the user's coding standards.
---

# Coding Standards

Build **correct by construction**. A principle applies when the change introduces or alters the concern it governs. Apply it across the change’s full semantic surface—contracts, behavior, data flow, state, effects, and verification—but do not introduce machinery for absent concerns. Follow compatible project conventions, containing incompatible conventions at their seams rather than copying them inward.

## Principles

### 1. Repository before invention

- Inspect existing contracts, modules, adapters, tests, and dependencies before introducing a library, pattern, module, or seam.
- Make the smallest coherent improvement.
- Speculative abstractions and migration, rollout, or compatibility machinery require a concrete current constraint or explicit user intent.

### 2. Parse, don’t validate

- Treat external, serialized, persisted, framework-shaped, and configuration values as unknown boundary input.
- A boundary parser returns the refined value that flows inward; checking a value and then continuing with the original is not parsing.
- Never trust decoded data with `as`.
- Keep protocol and persistence DTOs as explicit projections defined at the boundary.
- Treat every serialization or process hop as a new boundary: cross it with explicit serializable DTOs and required context, then parse again.
- At the **composition root**, parse environment and configuration once and translate raw platform capabilities and bindings into typed configuration and narrow application capabilities.

### 3. Make invalid states unrepresentable

- A **Domain Module** is a pure, type-centric abstract data type in the OCaml tradition. It centers one primary domain type or tightly related type family and co-locates its supporting types, invariants, parsers, smart constructors, combinators, predicates, legal transitions, domain projections, test generators, and formatting.
- It owns its invariants in application code; callers use its operations rather than reimplementing checks or branding with casts, and persistence mirrors applicable invariants with constraints.
- Use precise operation inputs and required values; push optionality outward.
- Prefer branded values or immutable value classes for distinctions that prevent realistic misuse, and state machines over contradictory flags.
- Use **exhaustive case analysis** for closed variants; never use a default branch that masks newly added cases.

### 4. Expected failures are values; defects fail fast

- Define an **error algebra** of custom `Error` subclasses with stable literal discriminants such as `_tag`, safe structured fields, and optional `unknown` causes; expose the precise union through typed result channels.
- Do not hide expected failures in throws or rejected promises.
- Catch thrown `unknown` only where it can be classified, recovered from, or translated.
- Detect cancellation first.
- Retain original causes internally, but expose or record only explicit safe projections.

### 5. Design deep modules around real seams

- Depth is caller leverage per unit of interface.
- An **Application Service Module** owns one cohesive use case or capability, applying application policy and sequencing effects through narrow, application-owned ports.
- An **Adapter Module** owns boundary translation and technology mechanics. It either:
  - translates an external request or event into an Application Service call and projects the result; or
  - implements an Application Service port using a framework, protocol, persistence store, runtime, or third party.
- Use a **functional core, imperative shell**: Domain Modules form the core; Application Services and Adapters form the shell.
- Raw external types stay at the composition root or inside Adapters.
- Every interface must hide meaningful invariants, policy, sequencing, or translation; reject globals, mega-interfaces, and pass-through wrappers.

### 6. Every side effect has an owner

- Acquire each resource in the scope that owns its lifetime and release it on every exit.
- Enforce **no floating promises**: every promise is awaited, returned, collected, or handed to explicit detached-work machinery.
- Detached work has an explicit owner for lifetime, cancellation, rejection handling, and observability.
- Modules do not acquire resources or perform I/O at import time.
- When independent work benefits from overlap, use **structured concurrency**: bound fan-out, propagate caller cancellation, await all child work, and prevent it from outliving the owning scope.

### 7. Make mutation retry-safe

- Make retried commands idempotent and guard concurrent transitions atomically.
- Do not hold database transactions open across network calls; use a **transactional outbox** or equivalent when commit and delivery must agree.
- Persist coordination state when progress must survive crashes or redelivery; introduce durable workflow machinery only when that need exists.

### 8. Observe without exposing

- Wrap sensitive values in redaction-safe types at ingress and unwrap them only at the use site.
- Secrets never enter errors, logs, traces, metrics, snapshots, or diagnostic strings.
- Apply **data minimization** to correlated, structured telemetry: record only stable fields for relevant operations, dependencies, states, retries, safe correlation identifiers, and error tags; never serialize arbitrary payloads, thrown values, or environments.
- Preserve existing reporting hooks, and keep telemetry out of domain decisions.

### 9. Verify behavior through real seams

- Assert caller-visible results, failures, persisted state, messages, responses, or adapter records—not private helpers or incidental call order.
- Replace dependencies through production seams; do not use module mocks or method spies.
- Control time, randomness, IDs, cancellation, and external behavior.
- Use **risk-based testing**: match evidence depth to consequence.
- Use property tests for general invariants.
- Verify database and runtime claims against the actual implementation, applying the production migration path when persistence semantics matter.

### 10. Preserve TypeScript's checks

- Keep compiler strictness and precise, readonly contracts.
- Avoid `any`, non-null assertions, unchecked casts, hidden mutation, and accidental thenables.
- Treat an unavoidable escape hatch as an unsafe block: keep it local behind a precise interface, and use `SAFETY:` to state the runtime invariant that makes it sound.
- Document every directly exported function, class, constant, type, and public method with JSDoc that explains its contract, invariants, side effects, and expected failure values; use `@throws` only for defects or boundary-required exception contracts.
- Never weaken project-wide checks for a local change.

## Completion criterion

Treat every principle as a **proof obligation** against the full semantic change. Done means each is either inapplicable or supported by repository inspection, static checks, focused tests, or evidence from the actual runtime. For each blocked obligation, report the unsupported claim, blocker, risk, and remaining check; do not present it as verified.
