# Effect Standards

This file is intentionally limited. Apply only the Effect-specific mechanics listed here; do not invent style rules about pipelines, tag declaration syntax, layer granularity, naming, or expression style.

## Applicability

Use this file only when the changed responsibility depends on Effect-specific semantics: Services/Tags/Layers, typed error channel, Effect Schema, Redacted values, Layer-owned resource lifecycle, Effect-aware tests, property generation, or established Effect RPC.

Do not require Effect adoption for code not already organized around Effect.

## Adoption and module structure

A responsibility already composed with Effect should continue using established Effect mechanisms for dependency provision, schemas, errors, and tests. Do not introduce parallel constructor injection, schema, or testing architecture without concrete interop need or inspectable architectural rationale.

Dependency-bearing modules in an Effect architecture should use Effect Services/Tags/Layers rather than ad hoc dependency bags.

Resource construction, configuration, and dependency wiring should be owned by Layers or application composition root. Domain operations should not construct production Layers as ordinary business behavior.

If a Layer constructs a resource requiring cleanup, the Layer owns acquisition and cleanup lifecycle.

## Failures, schemas, and sensitive data

Expected Failures in Effect-based modules belong in Effect's typed error channel. Unrecoverable defects may throw/die; cancellation must be classified correctly; precise contracts matter.

Effect custom errors should use the repository's established Effect tagged-error mechanism, such as `Schema.TaggedErrorClass`.

When Effect is the established schema model, use Effect Schema for refined values and schema-derived domain construction. Effect Schema parsing failures are Expected Failures unless context is startup config or another true defect.

Sensitive values governed by redaction rules should use Effect's `Redacted` value type in Effect codebases.

Required lookup absence follows the Not Found Failure rule. Intentional optional lookup may use `Option`.

When a seam requires a codec/projection and Effect owns both sides or the local adapter, use Effect Schema codecs.

A codebase already using Effect RPC should use its schema and transport model consistently for applicable typed RPC seams.

## Testing and generation

The extracted guidance was audited against `effect@4.0.0-beta.85` and `@effect/vitest@4.0.0-beta.85`. If either package is upgraded, re-audit testing, schema-generation, and property-test assumptions before applying version-specific advice.

Effect 4 codebases should use `@effect/vitest` rather than `@fast-check/vitest`. Keep `effect` and `@effect/vitest` on the same version. In Vite+ projects, continue running tests through `vp test`; if explicit `vitest` peer is required, pin it to the exact Vitest version bundled by installed Vite+.

Use `it.effect` for effects under test services, virtual time, and scoped cleanup; `it.live` only for intentionally live runtime behavior; `layer(...)`/nested `it.layer(...)` for shared acquired layers; `it.prop` for synchronous properties; `it.effect.prop` for Effect-returning properties.

Property callbacks must assert or return a failing Effect when false. Merely succeeding with boolean `false` does not fail.

For exactly the audited beta versions, schema inputs to `it.effect.prop` should use tuple form. Record-form inputs should contain only Fast-Check arbitraries, and plain `it.prop` should receive only Fast-Check arbitraries.

Effect Schema should be the default source of valid generated domain values. Prefer schema-derived arbitraries and schema-law checks (`TestSchema.Asserts`) for generation validity and encode/decode round trips.

Do not manually duplicate a schema's arbitrary unless the schema cannot derive an efficient or meaningful generator. Keep realistic-data libraries behind Fast-Check arbitraries.

## Known gaps

Do not infer standards yet for canonical Service/Tag declaration forms, Layer granularity, Effect expression style, runtime ownership outside entrypoints, finalizer conventions beyond Layer cleanup, Effect-specific concurrency/retry/timeout/schedule/stream/interruption idioms, transactions, RPC adoption criteria beyond established-use consistency, or observability integration details.
