---
name: coding-standards
description: Correct-by-construction TypeScript standards. Use for TypeScript engineering or when another skill needs the user's coding standards.
---
These standards describe how to design and write TypeScript code in this codebase. They are especially intended for agents: inspect existing code before adding patterns, libraries, Adapters, or abstractions, but apply these standards to all new and refactored behavior. Follow existing conventions only when they are compatible with these standards.

## Decision priority

When rules pull in different directions, use this order:

1. Preserve correctness, safety, and debuggability.
2. Apply these standards to all new code and to the full behavior being refactored.
3. Follow compatible project architecture and conventions.
4. Contain incompatible existing patterns at the nearest boundary rather than copying them into new code.
5. Avoid changing unrelated old code unless a broader migration is explicitly requested.
6. Document meaningful trade-offs with comments or ADRs.

## Core principles

- Prefer **errors as values** over `throw` / rejected promises for expected failures.
- **Parse don't validate**. Parse early and as close to composition or application roots as possible. Do not merely validate and throw away the information learned.
- Make **illegal states unrepresentable** where practical.
- Prefer **correct-by-construction** APIs over convention-based invariants.
- Use branded/refined/domain types when they prevent a realistic mistake, such as mixing identifiers or units, bypassing parsing, or constructing an invalid value.
- Prefer **composition over inheritance**.
- Prefer **imperative shell / functional core**.
- Design **deep, cohesive modules** with **low caller burden**.
- Test behavior through real seams; **avoid** module mocks and spy-driven tests.
- Keep code discoverable for humans and agents.

## Adapting to existing codebases

Before adding a new pattern or library, inspect the repo for existing choices around:

- error handling
- schema parsing
- dependency injection
- testing
- observability
- adapters/services
- module layout

Apply these standards to all new code and to the full behavior being refactored. Do not preserve weaker patterns merely for consistency. Keep unrelated old code unchanged and translate incompatible patterns at the nearest boundary.

For example, if existing code uses exception-style errors, do not rewrite the whole system for an unrelated change. Represent known failures as typed values in new or refactored code, then translate them at the boundary into the outcome required by the existing framework. Preserve existing logging, tracing, metrics, and error-reporting hooks.

## Errors and failures

### Expected failures are values

Every known failure mode should appear in the return type as a custom tagged error, even when the immediate caller cannot recover. A caller must handle the error or return it upward. At the outermost boundary, translate it into a valid outcome such as an HTTP response, CLI exit code, retry decision, dead letter, or startup error message.

Known failures include domain, parsing, authorization, integration, I/O, persistence, configuration, and workflow failures.

Preferred order:

1. Effect, when the codebase already uses Effect.
2. `better-result`, when available and appropriate.
3. A small local tagged union:

```ts
type Result<T, E extends Error> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };
```

Prefer:

```ts
Promise<Result<User, UserLookupError>>
```

not:

```ts
Promise<User> // rejects for ordinary lookup/storage failures
```

Promise rejection is equivalent to throwing. Catch unclassified third-party rejection inside the owning Adapter and translate it into a known tagged error before it crosses the Adapter boundary. Rejection may escape application code only for a defect.

### Defects may throw or panic

Throw or panic only when a defect makes correct execution impossible, not merely because the current caller has no recovery strategy. Defects include:

- violated internal invariants
- impossible branches
- temporary `notYetImplemented` paths
- catastrophic runtime conditions

Known configuration failures are values; the composition root reports them safely and terminates startup.

Use established shared defect helpers where available, or the panic helper from the project's result library:

```ts
export function casesHandled(unexpectedCase: never): never;
export function shouldNeverHappen(msg?: string): never;
export function notYetImplemented(msg?: string): never;
```

Use `casesHandled` for exhaustive union handling. Avoid names like `absurd` or one-off `assertNever` helpers when the project already has these helpers.

### Custom errors

Expected failures should use custom tagged errors, generally extending:

- `Error`
- `TaggedError` from `better-result`
- `Schema.TaggedErrorClass` in Effect codebases

Custom errors should include:

- stable tag using 'as const'
- useful message
- structured contextual fields
- safe telemetry fields
- optional `cause: unknown`

Example:

```ts
export class UserStoreUnavailable extends Error {
  readonly _tag = "UserStoreUnavailable" as const;

  constructor(
    readonly operation: "findActiveByEmail",
    readonly provider: "postgres",
    readonly cause: unknown,
  ) {
    super(`User store unavailable during ${operation}`);
  }
}
```

Keep error unions precise at module boundaries:

```ts
Result<User, UserNotFound | UserStoreUnavailable>
```

Avoid broad `AppError`-style types except near entrypoints, orchestration, logging, and rendering layers.

## Sensitive data, telemetry, and debugging

Prefer end-to-end structured tracing across requests, jobs, workflows, application modules, adapters, and external calls.

Tracing/logging should make failures diagnosable with safe fields:

- domain IDs
- operation names
- dependency/provider names
- state tags
- retry counts
- typed error tags
- safe summaries

Do not put secrets in errors, traces, logs, or snapshots.

Use a `Redacted<T>` wrapper for sensitive values such as tokens, API keys, passwords, raw credentials, and secrets. Prefer Effect's `Redacted.Redacted` in Effect codebases or a local shared `Redacted<T>` wrapper.

Wrap sensitive values at the boundary and unwrap only where the raw value is needed, usually inside an adapter making an external call.

## Parse, don't validate

Boundary code should turn unknown or less-structured input into application or domain types before it enters inner code.

Use a separate protocol projection only when its shape or meaning differs enough to be useful. `DTO` describes a boundary role in prose; never use `DTO` or `Dto` in a symbol name. Name the symbol after its actual protocol or persistence meaning, such as `CreateUserRequest`, `StripeCustomerResponse`, or `UserRecord`:

```ts
unknown -> CreateUserRequest -> CreateUserInput -> EmailAddress/UserId/etc.
```

Otherwise, parse directly into the application input:

```ts
unknown -> CreateUserInput
```

Do not pass a schema-inferred transport shape throughout the application:

```ts
unknown -> z.infer<typeof CreateUserSchema>
```

Use names that preserve meaning:

- `parseX(input): Result<X, ParseXError>` for untrusted or less-structured input
- `makeX(...)` / `createX(...)` for smart constructors from already-typed pieces
- `isX(value): value is X` for true predicates
- `assertX(...)` rarely, mostly at tests/framework boundaries

Avoid `validateX` when the function returns a refined value. It parsed something.

### Schemas

Use schema libraries as boundary parsers, not as ad-hoc validators sprinkled through core logic.

Preference:

- use the repo's established schema library if one exists
- use Effect Schema in Effect codebases
- prefer Standard Schema compatibility for generic helpers
- otherwise prefer Zod 4
- use hand-written smart constructors/parsers for small domain types when clearer

Schema parsing should produce refined/domain types and typed custom errors where practical.

## Branded types and correct construction

Use branded/refined types when they prevent realistic misuse or invalid construction, especially for:

- IDs: `UserId`, `OrgId`, `WorkflowId`
- parsed strings: `EmailAddress`, `NonEmptyString`, `Url`
- constrained numbers: `PositiveInt`, `Cents`, `Percentage`
- units: `Milliseconds`, `Bytes`, `UsdCents`

Construct branded values through parsers or smart constructors. Avoid passing raw strings/numbers where a domain type exists.

Avoid optional/null/undefined values in functions that require a value. Push optionality outward. Branch or parse before calling.

Avoid `Partial<T>` as an application/domain input unless partiality is the real domain concept. Prefer explicit input types for each operation.

## State machines and boolean blindness

When an entity has meaningful lifecycle states, model them with tagged unions or equivalent value classes.

Prefer:

```ts
type Invoice =
  | { readonly _tag: "Draft"; readonly id: InvoiceId; readonly lines: NonEmptyArray<LineItem> }
  | { readonly _tag: "Sent"; readonly id: InvoiceId; readonly sentAt: Instant }
  | { readonly _tag: "Paid"; readonly id: InvoiceId; readonly paidAt: Instant };
```

Avoid:

```ts
type Invoice = {
  readonly isSent: boolean;
  readonly isPaid: boolean;
  readonly sentAt?: Date;
  readonly paidAt?: Date;
};
```

Avoid boolean parameters that control behavior:

```ts
createUser(input, true);
```

Prefer named options or domain types:

```ts
createUser(input, { emailVerification: "skip" });
```

Booleans are fine as clear predicate return values:

```ts
isExpired(token): boolean;
hasPermission(user, permission): boolean;
```

## Modules and abstractions

**Domain Module**, **Application Service Module**, and **Adapter Module** name responsibilities, not required folders, suffixes, or TypeScript constructs. A module may be a function, object, class, file, or package with a cohesive public interface. Use the roles at any scale; do not create three layers when the behavior does not need them.

The normal dependency and call flow for an operation with application policy or effects is:

```txt
external input -> inbound Adapter -> Application Service -> Domain Module
                                           |
                                           +-> application-owned port
                                                 -> outbound Adapter -> external system
```

An inbound Adapter may call a Domain Module directly only for a pure operation with no authorization, application policy, persistence, external calls, or effect sequencing:

```txt
external input -> inbound Adapter -> Domain Module
```

The composition root constructs concrete Adapters and supplies them to Application Services. Dependencies point inward: Domain Modules know neither services nor Adapters; Application Services know application-owned port contracts, not concrete technologies; Adapters depend on those contracts and translate at the edge.

### Choosing a role

Classify code by the responsibility that would make it change:

- A business meaning, invariant, calculation, or legal state transition changes: **Domain Module**.
- An application operation's policy, authorization, or effect sequence changes: **Application Service Module**.
- A protocol, framework, database, runtime, or third-party API changes: **Adapter Module**.
- Only construction, configuration, or resource wiring changes: **composition root**.

Split an abstraction when it owns more than one of these reasons to change. Do not split code merely to satisfy the taxonomy: a pure operation may need only a Domain Module, while a simple boundary may call an Application Service with no new domain type.

### Applying the roles in any codebase

For a new feature or a local refactor:

1. Trace one caller-visible operation from ingress to every effect.
2. Put intrinsic meanings, invariants, calculations, and transitions in Domain Modules.
3. Put application policy and effect ordering in an Application Service; define its dependencies as narrow ports.
4. Put each protocol or technology translation in an inbound or outbound Adapter.
5. Wire concrete Adapters to ports at the composition root.
6. Verify each role through its public seam: domain results, application outcomes, and boundary records/responses.

Apply these responsibilities inside the project's existing layout and framework vocabulary. Migrate mixed code only across the feature's required semantic surface; otherwise contain the old convention at an Adapter seam rather than forcing a broad rewrite.

For example, in password reset: `EmailAddress` and `ResetToken` are Domain Modules; `PasswordReset` is the Application Service; an HTTP route is an inbound Adapter; Postgres and email-provider implementations are outbound Adapters; bootstrap performs the wiring.

### Deep modules

A deep module hides substantial behavior, invariants, policy, sequencing, or translation behind a cohesive, low-burden interface. Low-burden does not necessarily mean few functions.

Avoid shallow abstractions that merely forward calls, mirror tables, rename another API, or expose implementation steps.

Use the deletion test:

- if deleting the module makes complexity disappear, it was probably pass-through waste
- if deleting it spreads complexity across callers, it was probably earning its keep

### Domain Modules

A **Domain Module** is a pure, type-centric abstract data type in the OCaml tradition. It centers one primary domain type or tightly related type family and owns what values mean and which operations are legal.

Use one when the code has a meaningful domain distinction, invariant, calculation, decision, or lifecycle. Keep a primitive or local pure function when introducing a domain abstraction would prevent no realistic misuse and centralize no meaningful rule.

A Domain Module should:

- co-locate its type, supporting types, parsers, smart constructors, combinators, predicates, legal transitions, domain projections, formatting, and test generators as applicable
- return refined values from parsers and constructors so callers cannot create invalid instances
- express expected failures as precise values
- remain deterministic and independent of I/O, frameworks, persistence, ambient time, randomness, and mutable global state

It may define pure permission decisions over parsed domain values. It should not authenticate callers, gather authorization context, enforce permissions while carrying out an application operation, choose effect order, query storage, call a network, or expose transport/persistence DTOs. Callers use its operations instead of recreating its checks or branding values with casts.

Example:

```ts
// email-address.ts

/** A parsed, normalized email address. */
export type EmailAddress = Brand<string, "EmailAddress">;

/** Parse an email address from untrusted input. */
export function parse(input: string): Result<EmailAddress, InvalidEmailAddress>;

/** Render an email address as a string. */
export function toString(email: EmailAddress): string;

/** Compare two email addresses for equality. */
export function equals(left: EmailAddress, right: EmailAddress): boolean;
```

Domain Modules may use plain functions, immutable value classes, or static-style classes when cohesive. If using classes:

- construct through `parse` / `make` / smart constructors
- make invalid instances unconstructable
- keep fields readonly/immutable from callers
- keep methods cohesive over that value
- do not hide dependencies or I/O inside domain value classes
- avoid inheritance for domain behavior

### Application Service Modules

An **Application Service Module** owns one cohesive application operation or capability, such as `PasswordReset`, `Invitations`, or `SubscriptionLifecycle`. It applies application policy and sequences effects through narrow, application-owned ports while delegating intrinsic business rules to Domain Modules.

Use one when an operation must coordinate authorization, domain decisions, persistence, external calls, transactions, messages, time, IDs, or telemetry—or when the same operation must be callable from multiple entrypoints. A direct Domain Module call is enough when no application policy or effect orchestration exists.

An Application Service should:

- accept and return application/domain types with precise expected-error unions
- define the smallest meaningful ports required by the operation
- receive ports, configuration, clocks, randomness, and similar capabilities explicitly
- own which effects occur, under what policy, and in what order
- remain independent of HTTP, CLI, queue, ORM, vendor SDK, and runtime types

It should not parse protocol envelopes, render responses, execute SQL, translate vendor DTOs, or duplicate Domain Module invariants. Prefer constructor injection for dependency-bearing classes; in Effect codebases, use services/tags/layers. Avoid dependency bags passed into every call.

There is no arbitrary method limit. Split methods that represent unrelated capabilities, change for different reasons, or require unrelated dependencies. Avoid vague names such as `Manager`, `Processor`, `Helper`, or generic `UserService` unless established by the project.

### Adapter Modules

An **Adapter Module** owns one boundary's translation and technology mechanics. Use one whenever application code crosses a framework, protocol, serialization, process, persistence, runtime, or third-party boundary.

There are two directions:

- An **inbound Adapter** parses an external request/event/command, invokes an Application Service or a directly callable pure Domain Module as described above, and projects its result into the external protocol. Examples: HTTP route, GraphQL resolver, CLI command, queue consumer.
- An **outbound Adapter** implements an Application Service port using a concrete technology and translates raw records, SDK values, and external failures into application/domain types and typed errors. Examples: Postgres store, Stripe client, email sender, system clock.

An Adapter should own schema/DTO translation, framework lifecycle, external error classification, and safe diagnostics for its boundary. It may retry a short-lived technical failure only when the operation is safely repeatable and the retry does not change the port's meaning. It should not decide business eligibility, authorization policy, legal state transitions, or application-operation ordering. Keep raw external types inside the Adapter or composition root.

A port is not an Adapter. A port is the application-owned contract that states what an operation needs; an outbound Adapter is one replaceable implementation. Do not add an Adapter that only forwards the same shape to another internal module without hiding real translation or mechanics.

### Composition root

The composition root parses environment and configuration, acquires resources, constructs concrete Adapters, and injects them into Application Services. Keep framework bindings and concrete wiring here; do not turn the composition root into a place for domain rules, application policy, or reusable boundary translation.

## Application-owned ports and Adapter reuse

Define ports beside the Application Service that needs them and in the application's language, not the provider's language. Depend on the smallest meaningful capability the operation uses; let a cohesive concrete Adapter be wider. Port inputs, outputs, and errors must be application/domain types rather than raw rows, SDK objects, or framework values.

Because TypeScript is structurally typed, this works well:

```ts
type UsersForPasswordReset = {
  findActiveByEmail(email: EmailAddress): Promise<Result<ActiveUser, UserLookupError>>;
};

export class PasswordReset {
  constructor(private readonly users: UsersForPasswordReset) {}
}
```

A wider adapter can satisfy it:

```ts
export class PostgresUsers {
  findActiveByEmail(...) { ... }
  findById(...) { ... }
  updateProfile(...) { ... }
}
```

This avoids both mega-repositories and one-method adapter sprawl.

### Adapter reuse audit

Before creating a new adapter or service, agents must audit existing adapters/services.

Prefer, in order:

1. Reuse an existing adapter as-is through a narrow dependency type.
2. Extend an existing adapter if the new method fits its existing cohesive capability and changes for the same reason.
3. Create a new adapter only when reuse/extension would create bad coupling or an accidental interface.

Do not require an ADR for a routine feature-level Adapter or Application Service. Create an ADR when the new module introduces a lasting architectural boundary, shared pattern, provider strategy, or deliberate exception to these standards. The ADR should explain:

- what existing Adapters or Application Services were checked
- why reuse or extension did not fit
- why the new boundary or pattern is a separate cohesive capability

### Repositories and persistence

Avoid repository-per-table by default.

Repository-like adapters are acceptable when they represent a cohesive domain persistence capability. They should expose meaningful domain operations and return parsed domain types / typed errors, not raw rows and ORM errors.

Treat raw database rows and ORM models as infrastructure DTOs. Parse them before application/core logic. Keep SQL/ORM details inside infrastructure adapters or persistence modules.

## Functional core, imperative shell, and entrypoints

Domain Modules form the functional core. Application Service Modules and Adapter Modules form the imperative shell, but only Adapters contain technology-specific concerns. This keeps the same application operation reusable across REST, CLI, GraphQL, workers, and other entrypoints.

The functional core contains domain parsers, invariants, state transitions, calculations, combinators, and decision functions. It avoids I/O, hidden dependencies, ambient time/randomness, thrown expected failures, and framework-specific concerns.

The imperative shell has two distinct responsibilities:

- Application Services apply application policy and sequence effects through explicit ports.
- Adapters parse or project boundary values, classify external failures, and perform concrete I/O.

Entrypoint Adapters should be thin protocol translation layers. They parse protocol-specific input, call Domain Module parsers to obtain refined values, invoke an Application Service when application policy or effects are involved, and render protocol-specific output. A pure operation may call a Domain Module directly as described above. Do not duplicate business rules in controllers, resolvers, commands, or handlers.

Within authentication and authorization, inbound Adapters verify boundary credentials and produce a parsed identity such as `Principal`, `Session`, or `CommandActor`. Domain Modules may define pure permission decisions over parsed domain values. Application Services gather the required context and enforce those decisions while carrying out an application operation. Adapters project missing or invalid credentials and denied operations into protocol-specific outcomes; they do not define permission policy.

## Workflows, transactions, and idempotency

Use ordinary function calls or database transactions for simple single-boundary operations.

Use a saga or durable workflow when progress must survive process loss or redelivery, or when the operation requires long delays, compensation, resumability, timers, human approval, cross-service coordination, or multiple transaction boundaries. A short-lived retry by itself does not require durable workflow machinery.

Adapters own safe, short-lived technical retries. Application Services decide whether an application operation should be attempted again. Durable workflows own retries that must survive crashes, delays, or redelivery.

Do not hold database transactions open across network calls or long-running operations.

Any externally observable mutation or state transition that may be retried needs an explicit idempotency strategy:

- idempotency key
- natural unique constraint
- deduplication record
- state-machine transition guard
- transactional outbox/inbox

Retrying should not rely on “probably safe” side effects.

## Testing

Add an end-to-end test whenever the behavior can be exercised through its real public entrypoint in the normal test environment without unreliable third parties or unreasonable setup, runtime, or cost. Add lower-level tests when they provide extra coverage for important cases.

Prefer confidence-oriented tests:

1. end-to-end tests through real public entrypoints whenever possible
2. integration tests through real seams
3. focused/property tests for pure Domain Modules
4. unit tests when they test meaningful behavior, not implementation details

Never use `vi.mock` or `jest.mock` for module mocking. Use real seams:

- constructor-injected interfaces/classes
- Effect services/layers
- local database substitutes such as SQLite
- in-memory adapters when behavior is simple
- fake external adapters when needed

Prefer tests that assert observable input/output behavior:

- returned value/error
- persisted state
- emitted event/message
- rendered response
- sent email record in a fake/local adapter

Avoid spy-driven tests like `expect(sendEmail).toHaveBeenCalledWith(...)` unless the interaction itself is the only observable behavior.

For persistence behavior, prefer SQLite/local DB-backed tests over hand-rolled in-memory fakes when SQL/schema/transaction behavior matters.

### Property tests and arbitraries

Use `fast-check` where properties are clearer than examples, especially for:

- parsers/smart constructors
- branded/refined types
- state machines
- serialization roundtrips
- normalization/idempotence
- lawful combinators

Use arbitraries for mock/test data generation. Prefer exporting arbitraries near the domain module they support:

```txt
src/billing/
  invoice-number.ts
  invoice-number.test.ts
  invoice-number.arbitrary.ts
```

Tests should not bypass parsers, smart constructors, or invariants.

## TypeScript style and safety

Use strict TypeScript settings where practical:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`

Prefer immutable values:

```ts
type CreateUserInput = {
  readonly email: EmailAddress;
  readonly roles: ReadonlyArray<Role>;
};
```

Mutation is acceptable inside localized imperative shell code, performance-sensitive internals, builders, or adapters when hidden behind a precise interface.

### Casts, `any`, and non-null assertions

Avoid:

- `any`
- non-null assertions (`!`)
- casts with `as Type`

`as const` is fine.

Rare exceptions are allowed for highly generic helpers, branding internals, interop boundaries, or combinators where TypeScript cannot express the invariant.

Any non-`as const` cast requires a Rust-like safety comment:

```ts
// SAFETY: TypeScript cannot express the brand. parseEmailAddress checked the normalized string before branding. Callers cannot construct EmailAddress except through this parser.
return normalized as EmailAddress;
```

Rare `any` also requires a targeted oxlint ignore and justification:

```ts
// oxlint-disable-next-line no-explicit-any -- SAFETY: This helper preserves arbitrary function parameters; TypeScript cannot express this variadic constraint without any.
type Fn = (...args: any[]) => unknown;
```

Do not use `!`. Branch, parse, or refine instead.

## Imports, exports, and files

Prefer direct imports from the file that owns the abstraction. Avoid barrel files / `index.ts` re-export layers by default.

For domain modules, namespace imports often preserve the module shape:

```ts
import * as EmailAddress from "./email-address";

EmailAddress.parse(input);
```

Use named imports for classes and focused shared helpers:

```ts
import { PasswordReset } from "./password-reset";
```

Use `import type` / `export type` for type-only imports and exports.

Export only what callers should use. Keep internal helpers unexported unless intentionally shared. Do not export internals just for tests.

Avoid TypeScript `namespace` unless there is a compelling interop reason.

Avoid vague files:

```txt
utils.ts
helpers.ts
common.ts
misc.ts
```

Use precise names:

```txt
email-address.ts
billing-period.ts
string-case.ts
array.ts
```

Tiny ubiquitous generic helpers/types may share one explicit module when no more precise owner exists. Appropriate contents include:

- `casesHandled`
- `shouldNeverHappen`
- `notYetImplemented`
- `Redacted`
- `Tags`, `ExtractTag`, and `ExcludeTag`
- common `Result` helpers when the project uses neither Effect nor `better-result`
- broad type utilities

Keep only helpers justified by the target project. Keep domain and application policy with their owning modules.

No arbitrary file-size limits. Prefer cohesion and discoverability over small files for their own sake. Split when a file has multiple unrelated reasons to change or callers must understand unrelated concepts.

## Comments and JSDoc

Comments should explain invariants, trade-offs, non-obvious domain rules, and safety justifications. Avoid comments that narrate obvious code.

Every exported symbol from a JavaScript or TypeScript module requires JSDoc. Public methods and properties of an exported class also require JSDoc. Private and otherwise internal code requires documentation only when its complexity warrants it. Put documentation on the original declaration; re-exports do not need duplicate documentation.

Do not use `@inheritDoc`, `@inherit`, or similar inheritance tags. Write the required documentation explicitly on each symbol or member.

Use standard JSDoc syntax:

```ts
/**
 * Parse an email address from untrusted input.
 *
 * @param input - The untrusted string to parse.
 * @returns A parsed email address, or `InvalidEmailAddress` when the input is invalid.
 */
export function parse(input: string): Result<EmailAddress, InvalidEmailAddress>;
```

For generics:

```ts
/**
 * Map the success value of a result.
 *
 * @template T - The original success type.
 * @template U - The mapped success type.
 * @template E - The error type.
 * @param result - The result to map.
 * @param fn - The function applied to the success value.
 * @returns A result with the mapped success value, or the original error.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
```

Use `@throws` only for unrecoverable defects, framework-required behavior, or temporary `notYetImplemented` paths. Do not document expected typed errors as throws.

For complex exported object types, document fields when helpful:

```ts
/** Input required to create a user. */
export type CreateUserInput = {
  /** The actor creating the user. */
  readonly actor: AdminUser;

  /** The parsed email address for the new user. */
  readonly email: EmailAddress;
};
```

## Configuration and resources

Parse environment/config at startup or the earliest boundary into typed config with branded/redacted values where appropriate. Return known configuration failures as tagged error values. The composition root should report a safe startup message and terminate rather than treating invalid configuration as an internal defect.

Do not read `process.env` throughout the app. Missing or invalid config is a startup failure with useful, safe context.

Avoid top-level side effects except in true entrypoint/bootstrap files. Modules should not start servers, open connections, read env, register handlers, or perform I/O at import time.

Resource creation and cleanup should be explicit and owned by bootstrap/imperative shell code or Effect layers when using Effect.

Avoid mutable singletons/global state. Constants and pure lookup tables are fine. If a singleton is required by a framework/runtime, isolate it at the boundary.

Inject `Clock` / `Random` services into dependency-bearing modules. Pure domain functions may accept explicit `now` / random values.

## Quick agent checklist

Before coding:

- Read existing conventions for errors, schemas, tests, adapters, telemetry, and module layout.
- Classify each changed concern as Domain Module, Application Service Module, Adapter Module, or composition-root wiring.
- Reuse existing Domain Modules, Application Services, and Adapters before creating new ones.
- Define effect dependencies as narrow, application-owned ports; keep raw external types in Adapters or the composition root.
- Parse inputs at the edge and use domain types internally.
- Avoid raw DTOs, raw IDs, nullable bags, and `Partial<T>` in core/application logic.
- Prefer typed errors as values for new expected failures.
- Preserve existing observability/error mechanics.
- Test through public interfaces and real seams.
- Use `fast-check` arbitraries for generated test data when practical.
- Add JSDoc for exported symbols.
- Add an ADR only for a lasting architectural boundary, shared pattern, provider strategy, or deliberate exception discovered through the Adapter/Application Service reuse audit.
