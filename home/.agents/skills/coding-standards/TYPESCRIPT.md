# TypeScript Standards

Use this file for TypeScript language, tests, and lightweight tooling details.

## Type safety

Avoid `any`, non-`as const` assertions, and non-null assertions. Rare escape hatches are allowed only for highly generic helpers, branding internals, interop seams, or combinators where TypeScript cannot express a runtime-established invariant.

A permitted non-`as const` assertion must be local, hidden behind a precise interface, and justified with a Rust-like `SAFETY:` comment. A permitted `any` also needs a targeted lint suppression with the safety reason.

Treat caught values and rejection reasons as `unknown` until classified. Do not expose callable `then` members on ordinary values/classes/interfaces unless intentionally implementing PromiseLike interop. Keep strict TypeScript and exhaustive finite-variant checks enabled.

## Immutability and mutation ownership

Expose domain/application fields and collections as readonly unless caller mutation is explicit. Mutable arrays/maps/sets are fine inside local builders, adapters, caches, and performance-sensitive internals.

Do not mutate caller-owned inputs. Mutation is allowed for locally owned accumulators/builders or explicitly mutating APIs.

When `reduce` builds an aggregate, mutate and return the locally owned accumulator. Do not spread/concat the growing accumulator each iteration. Use a named reducer when accumulation has meaningful domain behavior.

Use `Map`/`Set` for runtime-discovered keys, non-string keys, frequent insert/delete, membership checks, or non-JSON semantics. Use plain records for finite known string keys or serializable config-like shapes.

Do not use `map` only for synchronous side effects. Avoid `filter(Boolean)`; use `flatMap` or a named predicate.

Array combinators are good for ordinary transformations. Use explicit loops in evident/measured hot paths.

## Optionality and object shape

Use `??` when default means absent-only. Use `||` only when every falsy value should intentionally fall back.

With `exactOptionalPropertyTypes`, distinguish present-but-undefined from absent. Use direct optional assignment when `undefined` is part of the receiving type; conditional omission is for semantic absence, serialization, patch/update semantics, or external API requirements.

Use optional chaining only when absence is expected. Destructure only after shape is parsed/refined/precise.

Construct intended plain-object shapes directly. Do not spread class instances, value objects, errors, dates, maps, sets, branded wrappers, or domain values with behavior/invariants.

Prefer explicit projections named for the consumer: `toPublicJson`, `toTelemetryFields`, `toPersistedRecord`, `serializeForQueue`. Avoid `delete` for ordinary projections.

Use guard clauses when they keep the main path flat. Avoid `else` after `return`, `throw`, or `continue`.

## Imports, exports, and files

Prefer direct imports from the file that owns an abstraction. Avoid new barrels unless an external package interface requires one.

Namespace imports can preserve domain-module shape. Use named imports for classes/prelude helpers/focused helpers. Use `import type` and `export type` for type-only traffic.

Export only the intended caller interface. Do not export internals solely for tests. Avoid authored TypeScript `namespace` declarations unless interop requires them.

Use precise file/module names. Avoid `utils.ts`, `helpers.ts`, `common.ts`, and `misc.ts`. `prelude.ts` is for tiny ubiquitous generic helpers/types/capabilities, not domain policy.

No arbitrary file-size limits. Split when a file has unrelated reasons to change or callers must understand unrelated concepts.

## Comments and JSDoc

Comments explain invariants, trade-offs, non-obvious domain rules, and safety justifications. Avoid narrating obvious code.

Every directly exported function, class, constant, and type must have standard JSDoc. Public methods of exported classes must have JSDoc. Generic exports must document type parameters with `@template`. Expected Failures represented as typed values must not be documented with `@throws`; reserve `@throws` for defects, framework-required behavior, or temporary unimplemented paths.

## Testing conventions

Use the repository's established runner. In Vite+ projects, use bundled Vitest through `vp test`, import ordinary test APIs from `vite-plus/test`, keep test config in `vite.config.ts`, and do not add standalone Vitest dependency/config without concrete tooling need.

Colocate tests with owning modules using `.test.ts`/`.test.tsx` unless local convention says otherwise.

Outside Effect codebases, use `fast-check` with the project-standard runner integration when property tests are appropriate.

Never use module mocks or method spies where configured rules prohibit them. Test through real seams and observable outcomes.

For persistence behavior, prefer representative local DB tests. In Drizzle projects whose claim does not depend on Cloudflare runtime, use in-memory `better-sqlite3` and real Drizzle migrations.

## Tooling preferences

For new TypeScript projects, prefer Vite+ as unified formatter, linter, type checker, test runner, and task interface. Preserve established toolchains unless migration is explicitly in scope.

Tooling should enforce correctness, safety, and maintainability rather than aesthetic preference theater.

Prefer strict TypeScript, one canonical local/CI check command, zero-warning checks when practical, formatter defaults, type-aware diagnostics for unsafe values/floating promises/non-null assertions/casts/invalid throws/unhandled finite variants/module mocks, and targeted suppressions with real reasons.

Avoid weakening checks to admit changed code, lint rules solely for equivalent syntax preferences, quote/semicolon/line-width/import-sort taste policy, enabling whole lint categories without concrete correctness reason, duplicating tool config, or treating formatter output as semantic review feedback.
