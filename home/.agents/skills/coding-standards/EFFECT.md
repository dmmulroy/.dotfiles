# Effect

Status: **Work in progress**.

This file captures the currently settled Effect standards. Do not invent additional Effect style rules beyond this file and the repository's local conventions.

Load this file when changed behavior is already organized around Effect or uses Effect-specific semantics: Services, Tags, Layers, typed error channels, Schema, Redacted values, Effect-aware tests, Schema-derived generation, scoped resources, or established Effect RPC.

## Non-negotiables

- A responsibility already organized around Effect continues using the established Effect mechanisms for dependency provision, schemas, and Effect-aware testing.
- Do not introduce parallel constructor-injection, schema, or testing architecture inside an Effect responsibility without a concrete interoperability need or explicit architectural rationale.
- Dependency-bearing modules in Effect architecture use Effect Services/Tags/Layers rather than ad hoc dependency bags.
- Expected failures in Effect-based modules use Effect's typed error channel.
- Effect custom errors use the repository's established Effect tagged-error mechanism, such as `Schema.TaggedErrorClass`.
- When Effect is the established schema model, use Effect Schema for refined values and schema-derived domain construction.
- Sensitive values use Effect's Redacted value type in Effect codebases.
- Layers that construct cleanup-requiring resources own acquisition and cleanup.
- Effect-specific version assumptions are checked against installed versions before applying version-specific examples.

## Adoption boundary

Do not require Effect adoption for code that is not already organized around Effect. General standards still apply: typed expected failures, boundary parsing, deep modules, real-seam tests, cancellation, observability, and TypeScript contracts.

When a local responsibility is Effect-based, preserve the local Effect style unless it violates a settled standard here.

## Services and Layers

Use Services/Tags/Layers for dependency-bearing modules. Layers or the application composition root own construction, configuration, and resource wiring.

Domain operations should not construct production Layers as part of ordinary business behavior.

Prefer:

```txt
Service layer composition
  -> provide UserStore, EmailProvider, Clock, Config
  -> run service effects
```

Avoid:

```txt
Domain operation
  -> reads env
  -> constructs live database layer
  -> performs business decision
```

Raw config parsing remains a boundary/composition concern. General module cohesion and seam design still apply.

## Typed errors

Expected failures belong in Effect's typed error channel. Do not convert ordinary domain, parse, authorization, dependency, persistence, or workflow failures into unchecked defects merely because an Effect can die.

Use the local established tagged-error mechanism:

```ts
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()("UserNotFound", {
  userId: UserIdSchema,
}) {}
```

Keep error unions precise at module boundaries. Broad app-level failures belong near orchestration, rendering, logging, and entrypoints.


## Schema and parsing

When Effect Schema is established, use it for:

- boundary parsing;
- refined/branded domain values;
- codecs for runtime boundaries;
- schema-derived generated values in tests.

A successful schema parse should produce the refined value that flows inward. Do not parse and then keep using the unrefined input.

When a runtime boundary requires a codec/projection and Effect owns both sides or the local adapter, use Effect Schema codecs.

General boundary rules still apply: serialized input is untrusted, storage rows are parsed at the External Adapter Module seam, and receiving sides parse/reconstruct payloads before invoking service logic.

## Redacted values

Use Effect's Redacted value type for tokens, credentials, API keys, passwords, and secrets.

Wrap secrets at the boundary and unwrap only inside the adapter that needs the raw value. Observability rules still own no-leak behavior and safe summaries.

## Resource lifecycle

Layers that acquire resources also release them. Keep resource acquisition/cleanup in Layers or composition roots, not scattered through domain operations.

Shared/scoped Layers in tests must preserve managed teardown and must not leak mutable fixture state between tests.

## Effect RPC

If a codebase already uses Effect RPC, use its schema and transport model consistently for applicable typed RPC seams.

This work-in-progress standard does not require adopting Effect RPC where another established RPC model exists.

## Testing

Effect 4 guidance was audited against:

- `effect@4.0.0-beta.85`
- `@effect/vitest@4.0.0-beta.85`

For Effect 4 codebases using `@effect/vitest`, keep `effect` and `@effect/vitest` on the same version. Re-audit testing, schema-generation, and property-test assumptions when either package is upgraded.

Use `@effect/vitest` rather than `@fast-check/vitest` in Effect 4 codebases. Effect depends on Fast-Check, re-exports it from `effect/testing`, and `@effect/vitest` owns the integration.

In Vite+ projects, still run tests through `vp test`. If the package manager requires an explicit `vitest` peer for `@effect/vitest`, pin it to the exact Vitest version bundled by the installed Vite+ version.

Prefer Effect-aware tests and test services:

- `it.effect` for effects under Effect test services;
- `it.live` only when the test intentionally verifies live runtime behavior;
- `layer(...)` / nested `it.layer(...)` for service tests with managed teardown;
- `it.prop` for synchronous properties over Fast-Check arbitraries;
- `it.effect.prop` for properties whose predicate returns an Effect, especially with Effect Schema or test services.

Property callbacks must assert or return a failing Effect when false. Merely succeeding with boolean `false` does not fail the test.

## Schema-derived generation

Effect Schema is the default source of valid generated domain values.

Prefer passing schemas directly to `it.effect.prop` or deriving with:

```ts
const arbitrary = Schema.toArbitrary(schema);
```

Built-in schema constraints should guide generation before rejection filtering. Use `Schema.toArbitrary(schema, { report: true })` while developing custom schemas to detect opaque-filter warnings.

Do not manually duplicate a schema's arbitrary in a separate factory unless the schema cannot derive an efficient or meaningful generator. Export custom arbitraries only when they add deliberate generation semantics or are reused independently.

For the audited Effect 4 beta versions:

- use tuple form when passing schemas to `it.effect.prop`;
- record form is safe for Fast-Check arbitraries;
- plain `it.prop` accepts Fast-Check arbitraries only;
- schema generation laws can use `TestSchema.Asserts`:
  - `.arbitrary().verifyGeneration()`;
  - `verifyLosslessTransformation({ params })`;
  - `decoding()` and `encoding()` focused assertions.

Re-check these compatibility notes after upgrading Effect or `@effect/vitest`.

## Cloudflare + Effect

For a new Cloudflare project selecting Effect, or an Effect project selecting a new Cloudflare resource/config/deployment model, use Alchemy V2 for that modeling.

Do not duplicate Alchemy-owned declarations in ad hoc Wrangler configuration, one-off scripts, or parallel infrastructure models unless a documented tooling gap requires small compatibility glue.

Cloudflare platform placement itself lives in `CLOUDFLARE_ARCHITECTURE.md`.

## Rejected framings

- **"Effect is present somewhere, so all new code must use Effect."** Only use this file for responsibilities that depend on Effect-specific semantics or established Effect architecture.
- **"Effect lets failures die."** Expected failures stay in the typed error channel.
- **"Any Layer shape is fine."** Follow local conventions and keep resource ownership explicit.
- **"Fast-Check integration is the same in Effect."** Use `@effect/vitest` and Effect's testing exports in Effect 4 projects.
- **"Version-specific examples are universal."** Check installed versions before applying beta-version guidance.

## Known gaps for future grilling

This file intentionally does not settle:

- canonical Service and Tag declaration forms;
- Layer granularity and composition conventions;
- expression composition and pipeline style;
- runtime ownership outside entrypoints;
- native fiber interruption conventions, beyond general cancellation propagation and cancellation classification;
- schedules, retries, timeout composition, and batching idioms beyond general async standards;
- stream architecture;
- transaction integration;
- Effect RPC adoption criteria;
- observability integration details.
