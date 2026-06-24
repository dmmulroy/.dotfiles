# Review Lens

Apply standards in review without a legalistic harness. Goal: precise author-facing feedback, not maximum findings.

## Review posture

- Review changed behavior, contracts, and execution paths.
- Preserve local conventions unless they conflict with correctness, safety, debuggability, or an explicit standard.
- Prefer concrete evidence over standards vocabulary.
- Do not report equivalent syntax, formatting, personal taste, or speculative future-proofing.
- Do not require broad migration for a local change unless unavoidable for safety.

## Finding bar

A finding needs all of:

1. **Location or path** — precise changed code or changed execution path.
2. **Applicability** — the standard applies to this responsibility.
3. **Causality** — the change introduces, worsens, or materially raises risk.
4. **Consequence** — concrete invalid state, failure, leak, race, duplicate effect, caller burden, runtime loss, or verification gap.
5. **Evidence** — source, types, tests, constraints, adapters, or runtime behavior support the claim.
6. **Smallest direction** — a local compliant correction or narrowed action.

Reject speculative, already mitigated, unchanged-debt, or unrelated-migration findings.

## Severity

- **Blocker** — material correctness, safety, security, data integrity, runtime, or debuggability consequence that should be fixed before trust/merge.
- **Comment** — actionable standards issue with real consequence but not enough severity to block.
- **Nit** — optional improvement; never formatting owned by tools.

Severity comes from consequence, changed-code causality, and remediation scope.

## Adversarial check

For every candidate, try to disprove applicability, changed-code causality, consequence, and remediation scope. Check upstream parsing, unconstructable invalid states, expected vs unrecoverable failures, retry/concurrency/cancellation/redelivery reachability, database constraints, replay records, codecs, downstream checks, local conventions, accepted trade-offs, and fix proportionality.

If uncertain, say what evidence is missing rather than issuing a confident finding.

## Lenses

### Domain integrity

Look for constructible illegal states, raw primitives where semantic distinction matters, required values accepted as optional/null/undefined, `Partial<T>` as lazy operation input, lifecycle modeled as independent booleans/nullables, boolean blindness, non-exhaustive closed variants, caller-reimplemented invariants, and persisted invariants protected only by read-time parsing.

Report only with realistic misuse, transferred caller burden, or concrete invalid state/path.

### Failure and observability

Look for Expected Failures escaping as throws/rejections, imprecise error unions, context-free generic errors, ambiguous lookup absence, catch blocks assuming `Error`, cancellation wrapped as ordinary failure, core logic using try/catch for Expected Failure control flow, secrets in telemetry, missing redaction at seams, unsafe error summaries, and adapters bypassing observability.

Trace sensitive-data findings from source to sink.

### Modules and seams

Look for shallow wrappers, low-locality modules, wide/leaky interfaces, unrelated responsibilities, domain behavior hidden in generic helpers, hidden globals/dependency bags, mega-interfaces, one-method interface confetti, new adapters without reuse audit, duplicated business policy, authorization trapped in controllers, ambient time/random/ID generation, and import-time I/O.

Use the deletion test and ask whether the interface is the natural test surface. Do not enforce arbitrary file size, method count, constructor dependency count, or export count.

### Seam integrity

Look for serialized/seam data typed as trusted, JSON/response/env/queue/storage data cast to domain types, seam input reaching core before parsing, repeated defensive downcasts after parsing, exported generic shape guards, unnecessary schema-library divergence, mutating parsers accepting unknown fields, storage rows treated as domain values, contradictory persisted state normalized silently, DTOs leaking through app-facing interfaces, rich values crossing runtime hops without codecs, protocol DTOs owned by domain modules, and object spread as implicit projection for values with behavior.

Identify the specific trust source, seam, or runtime hop.

### Async and workflows

Look for missing cancellation propagation, positional/boolean cancellation params, dropped signals, floating promises, detached work without owner/lifetime/rejection/cancellation/observability, accidental sequential awaits, fail-fast `Promise.all` where partial failure matters, unbounded fan-out, magic concurrency limits, ad hoc pools, retryable mutations without idempotency/replay, read-then-write race transitions, save-then-call crash windows, transactions across network calls, unclear delete replay semantics, and durable workflows relying on in-memory stack state.

For retry/race/cancellation findings, identify the execution path and event.

### Verification

Look for changed behavior not verified through the owning interface/seam, tests coupled to private helpers/call order/implementation structure, module mocks/spies replacing real seams, production adapters tested by bypassing app-facing interface, parsers without accepted/rejected cases, codecs without shape/round-trip evidence, runtime-specific behavior tested only in Node, uncontrolled time/random/IDs, and tests without meaningful assertions.

Map each material changed invariant, failure path, runtime seam, or behavior to evidence. Do not demand tests merely because lines changed.

### TypeScript contracts

Look for `any`, non-`as const` assertions, non-null assertions, unisolated escape hatches, missing `SAFETY:` comments, broad suppressions, caught values treated as `Error`, thenable traps, mutable collections/domain objects exposed across interfaces, mutation of caller-owned inputs, quadratic accumulator copying, casual objects for dynamic keyed collections, side-effect-only `map`, `filter(Boolean)`, truthy defaults, optional chaining hiding missing refinement, deep destructuring from weak data, object spread stripping semantics, dynamic `delete` for ordinary projection, `else` after terminal control flow, exported internals only for tests, missing JSDoc on exported contracts, new barrels, dumping-ground file names, and weakened strict checks.

### Cloudflare architecture

Apply only when changed behavior depends on Cloudflare config, bindings, Workers, service bindings, RPC, Durable Objects, Agents, D1, SQLite, R2, KV, Queues, Workflows, alarms, fibers, or workerd semantics. Require a specific Cloudflare seam/binding in each finding.

### Effect mechanics

Apply only to changed responsibilities using Effect semantics. Do not require Effect adoption. Look for Effect architecture bypassed with parallel constructor injection, ad hoc dependency bags, non-Layer resource ownership, Expected Failures escaping typed error channel, non-established tagged errors, non-Effect schemas in Effect Schema areas, secrets not using Effect Redacted, missing Effect Schema codecs where Effect owns a seam, inconsistent established Effect RPC, and unsupported version-specific testing assumptions.
