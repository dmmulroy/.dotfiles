# Principles

These standards optimize for correctness, safety, debuggability, local consistency, and humane maintainability. They are defaults for agents designing or changing code; they do not authorize broad migrations unless the user asks.

## Decision priority

1. Correctness, safety, and debuggability.
2. Established project architecture and conventions.
3. Local improvement toward these standards.
4. Avoidance of broad unrelated migrations.
5. Explicit documentation of meaningful trade-offs through ADRs or focused comments.

## Adoption rule

Before adding a pattern, library, adapter, service, schema system, testing style, or dependency-injection style, inspect the existing codebase. Prefer the local convention unless it conflicts with a non-negotiable correctness or safety concern.

At framework and dependency seams, translate between preferred internal contracts and existing external contracts rather than forcing the whole project to switch styles.

## Core taste

Prefer Expected Failures as typed values, Parse Don't Validate, correct-by-construction APIs, branded/refined/domain types where they carry meaning, state machines for lifecycle states, composition over inheritance, functional core/imperative shell, deep modules, narrow dependency interfaces, real seams, behavior tests through interfaces, and discoverable code.

Avoid convention-only invariants, domain logic coupled to framework/ORM/env/logger/time/random/UUID APIs, shallow wrappers, repository-per-table habit, speculative interfaces, module mocks, spy-driven tests, implementation-detail verification, raw DTOs/IDs, nullable bags, broad shape plumbing, and `Partial<T>` in core/application contracts.

## Domain integrity

Domain values and interfaces should protect invariants at construction and transition points. Callers should not remember scattered validation rules.

Use precise operation inputs, domain types, branded/refined primitives, value classes, and tagged unions when they protect an invariant, clarify a domain distinction, or reduce caller burden.

A function that semantically requires a value should not accept optional, `null`, or `undefined` input. Push optionality outward: branch, parse, or refine before calling.

Use state machines for mutually exclusive lifecycle states and state-specific data. Persisted lifecycle invariants must be protected with constraints, uniqueness, guarded writes, or equivalent storage safeguards when practical.

Internal finite variants should usually be string-literal unions or discriminated unions with `_tag`. Prefer exhaustive decisions using a shared `casesHandled` helper when available. TypeScript `enum`, especially numeric `enum`, is not preferred except for external interoperability.

## Seams and parsing

Seam input is untrusted or less-structured until parsed: JSON, request bodies, response bodies, queue payloads, RPC payloads, env vars, local storage, database rows, JSON columns, and third-party payloads.

Adapters must parse at the earliest practical seam into precise application or domain values. Core/application modules should receive precise input types, domain values, tagged unions, or narrow dependency interfaces, not `unknown`, `any`, `object`, `Record<string, unknown>`, broad DTOs, raw rows, or raw protocol shapes.

Do not cast serialized data into trusted types. A parser or smart constructor must establish the invariant, and the refined value must be used.

Use `parseX` for untrusted or less-structured input, `makeX`/`createX` for construction from already-typed pieces, and `isX` only for predicates/type predicates. Avoid `validateX` when the function returns a refined value.

Do not export generic shape guards such as `isRecord`, `isObject`, or `isArray`. Local shape checks belong inside concrete parsers, schema adapters, or interop adapters.

Use the repository's established schema library when it can express the contract. Generic schema helpers should be Standard Schema-compatible. In Effect codebases, use Effect Schema. Otherwise prefer Zod 4. Hand-written parsers are fine when clearer.

Mutating command and request-body parsers must reject unknown fields unless the external contract is explicitly extensible.

Protocol projections, persistence projections, and runtime serialization codecs must be explicit and owned by the adapter for that seam. Do not reuse HTTP/public JSON DTOs as persistence records or queue/RPC payloads by convenience.

## Failures and observability

Expected Failures should appear in the local return type through a typed value channel: Effect typed errors, `better-result` where established, or a small local tagged union.

Throws and promise rejections are acceptable for Unrecoverable Defects: violated internal invariants, impossible branches, catastrophic runtime conditions, startup misconfiguration, or explicit temporary unimplemented paths.

Adapters catching exception-style dependencies must catch `unknown`, classify it, preserve useful causes, recognize cancellation before ordinary wrapping, and translate into the local typed failure contract or established framework contract.

Expected failure values should usually be custom tagged errors with stable tags, useful messages, structured context, safe telemetry fields, and optional `cause: unknown`. Keep error unions precise at module seams.

Required get/find/read operations should usually represent absence as a typed Not Found Failure. Optional result shapes are fine only when optional lookup semantics are intentional and obvious.

Do not put secrets in errors, logs, traces, metrics, snapshots, or panic summaries. Wrap sensitive values in a Redacted Value at the seam and unwrap only where raw value is needed.

Preserve established observability. New adapters/translations must not bypass tracing, logging, metrics, or error reporting.

## Modules and seams

A good module owns a cohesive concept, capability, or policy. Its interface gives leverage by hiding implementation choices, invariants, ordering constraints, and incidental steps.

Prefer deep modules, domain-centered organization, explicit dependency seams, adapter reuse before new adapter creation, and small shared helpers that stay domain-independent. Avoid shallow abstractions, speculative seams, dependency bags, repository-per-table habit, and policy dumped into `utils`, `helpers`, `common`, `misc`, or `prelude`.

Load `MODULES.md` for design or review decisions about domain modules, application/service modules, dependency interfaces, adapters, persistence seams, shared helpers, and abstraction depth.

## Functional core and imperative shell

The functional core contains domain logic, parsers, state transitions, combinators, and pure decisions. It avoids hidden dependencies, I/O, ambient time/randomness, thrown expected failures, and entrypoint-specific concerns.

The imperative shell parses untrusted input, sequences effects, calls the core with refined values, classifies external failures, handles I/O/persistence/queues/HTTP/telemetry/time/randomness, and owns resource lifecycle.

Entrypoint adapters translate protocol input/output around the same application/domain behavior. Do not duplicate business rules or authorization policy across controllers, resolvers, CLIs, Workers, or jobs.

Configuration should be parsed at startup or earliest composition seam into typed config with redacted values where appropriate. Do not read raw environment variables throughout the application.

Time, randomness, and identifier generation that affect behavior should be injected through `Clock`, `Random`, `IdGenerator`, or passed explicitly.

Resource creation and cleanup should be explicit and owned by bootstrap, composition roots, imperative shell code, or managed runtime layers. Avoid import-time I/O outside true entrypoints/bootstrap files.

## Async, workflows, and mutation

Async work that can wait on I/O, timers, retries, queues, subprocesses, workflows, resource acquisition, or long computation must accept caller-owned cancellation through a final options object such as `{ signal }` and propagate it downstream.

Every promise must be awaited, returned, collected by an owned concurrency operation, or handed to explicit detached work. Detached work needs owner, lifetime, cancellation, rejection handling, and observability.

Independent async work should start concurrently. Use `Promise.allSettled` when partial failure is meaningful; reserve `Promise.all` for all-or-nothing groups. Unbounded collections need bounded concurrency selected from the real bottleneck and named accordingly.

Mutating commands/routes/jobs/handlers/workflow steps that can be retried need retry-safety: idempotency keys, client-provided IDs, natural unique constraints, replay records, guarded transitions, outbox/inbox records, durable workflows, or equivalent.

Do not hold database transactions open across network calls or long-running work. Save-then-call side effects need durable delivery when duplicate or lost side effects matter.

Deletion semantics must be explicit; if a delete result claims this request deleted an entity, derive that from the atomic delete result, not a stale pre-read.

## Verification

Tests should verify observable behavior through a module's public interface or intentional seam: returned values/errors, persisted state, emitted messages, rendered responses, sent fake-adapter records, or other owned outcomes.

The interface is the test surface. If tests need to reach past the interface to verify important behavior, deepen the module instead of exporting internals.

Avoid private helper tests, internal call-order assertions, module mocking, and spy-driven tests. Replace dependencies only through real production seams.

Match evidence to risk: focused behavior tests for domain behavior; property tests for general invariants; representative local DB tests for SQL/transaction/query behavior; representative runtime tests for platform semantics; e2e tests for critical user flows when representative environments exist.

Tests that make deterministic claims must control time, randomness, IDs, external dependencies, and cancellation when those inputs affect the outcome. A test must fail when the claimed behavior is absent.
