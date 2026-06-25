# TypeScript Contracts

TypeScript should preserve proof obligations instead of erasing them. Keep contracts precise, immutable by default, documented at exports, and enforced by boring toolchain checks.

## Non-negotiables

- Do not use `any`, non-`as const` assertions, or non-null assertions to erase unproven obligations; permitted escape hatches follow the local proof rule below.
- Permitted type escape hatches are local, hidden behind precise interfaces, and justified with `SAFETY:`.
- Rare `any` also gets a targeted lint suppression whose reason includes the safety justification.
- Catch variables and rejection reasons are treated as `unknown` until classified.
- Ordinary domain values, builders, interfaces, and classes do not expose callable `then` unless intentionally promise-like and documented.
- Static checks and established compiler, lint, formatter, and test-runner contracts preserve strictness, exhaustive finite-variant handling, and existing safety checks; do not weaken them to admit changed code.
- Caller-owned inputs are not mutated unless the function contract explicitly says it mutates a caller-provided builder/accumulator.
- Direct exports and public methods on exported classes have standard JSDoc explaining their contract.

## Strong defaults

- Expose ordinary domain/service object fields and collections as `readonly` unless caller mutation is part of the contract.
- Use local mutable builders/accumulators inside implementations when useful; hide mutation behind precise interfaces.
- Use `Map`/`Set` for runtime-discovered or frequently mutated keyed collections.
- Use nullish semantics (`??`) for defaults that mean "absent".
- Use direct optional assignment when the receiving type allows `undefined`.
- Use guard clauses for invalid/precondition/failure/non-applicable paths to keep the main path flat.
- Import directly from the file that owns the abstraction; avoid new barrels unless an external package interface requires one.
- Use `import type` / `export type` for type-only imports/exports.
- Use precise file names; avoid `utils`, `helpers`, `common`, and `misc` dumping grounds.
- Avoid TypeScript `namespace` unless interop requires it. Namespace imports are fine when they preserve a module shape.

## Type escape hatches

Avoid:

```ts
const input = body as CreateUserInput;
const user = users[index]!;
function call(fn: any) {}
```

Permitted casts live where the invariant is established:

```ts
// SAFETY: isCanonicalUserId established the UserId invariant. Callers cannot construct UserId except through parseUserId.
return input as UserId;
```

Permitted `any` is rare, targeted, and justified:

```ts
// oxlint-disable-next-line no-explicit-any -- SAFETY: This helper preserves arbitrary function parameters; TypeScript cannot express the variadic constraint without any.
type Fn = (...args: any[]) => unknown;
```

Do not use non-null assertions. Branch, parse, refine, or change the type.

## Unknown catch values

Prefer:

```ts
catch (cause: unknown) {
  return err(HttpRequestFailed.fromCause(cause));
}
```

Avoid:

```ts
catch (error) {
  return err(new Failure(error.message));
}
```

JavaScript can throw anything. Classification and telemetry rules live in [`ERROR_HANDLING.md`](ERROR_HANDLING.md) and [`OBSERVABILITY.md`](OBSERVABILITY.md).

## Thenable trap

Avoid callable `then` on ordinary objects:

```ts
type QueryBuilder = {
  then(onSuccess: (rows: ReadonlyArray<Row>) => void): void;
};
```

Prefer explicit execution:

```ts
type QueryBuilder = {
  execute(): Promise<ReadonlyArray<Row>>;
};
```

`await` and `Promise.resolve` assimilate thenables and may invoke `then` unexpectedly.

## Immutability and mutation ownership

Prefer readonly contracts:

```ts
type CreateUserInput = {
  readonly email: EmailAddress;
  readonly roles: ReadonlyArray<Role>;
};
```

Local mutation is fine:

```ts
const users: Array<User> = [];
for (const row of rows) {
  users.push(parseUser(row));
}
return users;
```

Avoid hidden parameter mutation:

```ts
function activate(user: User) {
  user.status = "active";
}
```

Parameter mutation is acceptable only when the function name/type makes builder/accumulator ownership explicit.

## Collections and accumulation

Array combinators are fine for ordinary transformations. Use explicit loops in measured or evident hot paths when avoiding intermediate allocation or callback overhead matters.

Avoid copy-on-every-iteration accumulation:

```ts
const usersById = users.reduce<Record<UserId, User>>(
  (acc, user) => ({ ...acc, [user.id]: user }),
  {},
);
```

Prefer mutating the local accumulator:

```ts
function indexUserById(acc: Record<UserId, User>, user: User): Record<UserId, User> {
  acc[user.id] = user;
  return acc;
}

const usersById = users.reduce(indexUserById, {});
```

If immutable accumulation is required, use a persistent data structure or named helper that makes the cost explicit.

Do not use `map` only for side effects:

```ts
items.map(sendMetric); // misleading discarded array
```

Use `for...of` for sync side effects. For async work, `map` is fine when promises are immediately collected by `Promise.allSettled`, `Promise.all`, or bounded concurrency.

Prefer `Map`/`Set` for dynamic keyed collections:

```ts
const usersById = new Map<UserId, User>();
```

Use plain records for finite known keys, serializable config-like shapes, or named domain/service records.

## Falsy filters and defaults

Avoid:

```ts
const emails = users.map((user) => user.email).filter(Boolean);
const limit = input.limit || defaultLimit;
```

Prefer:

```ts
const emails = users.flatMap((user) =>
  user.email === undefined ? [] : [user.email],
);

const limit = input.limit ?? defaultLimit;
```

Use `||` only when every falsy value should intentionally select the fallback.

## Optionality and object shape

With `exactOptionalPropertyTypes`, distinguish:

```ts
type PresentButMaybeUndefined = {
  readonly displayName: string | undefined;
};

type MaybeAbsent = {
  readonly displayName?: string;
};
```

Prefer direct assignment when `undefined` is allowed:

```ts
const record = { displayName };
```

Avoid conditional omission unless absence has semantic, serialization, patch/update, or external API meaning:

```ts
const record = {
  ...(displayName !== undefined ? { displayName } : {}),
};
```

## Optional chaining and destructuring

Optional chaining is for meaningful optionality:

```ts
const city = user.shippingAddress?.city;
```

Do not hide missing required refinement:

```ts
const userId = session?.user?.id; // in code that requires authentication
```

Parse/refine once, then pass non-optional types inward.

Avoid deep destructuring from untrusted, optional, or weakly typed objects:

```ts
const { user: { id } = {} } = body;
```

Parse first:

```ts
const input = parseRequestBody(body);
const { userId } = input;
```

## Object spread, projection, and delete

Object spread is fine for plain data records when copying enumerable own properties is intended.

Do not spread class instances, value objects, errors, dates, maps, sets, branded wrappers, or domain values with behavior/invariants:

```ts
const responseBody = { ...user }; // may strip methods/prototype/private state
```

Prefer explicit projection:

```ts
const responseBody = UserHttp.toPublicJson(user);
const telemetry = User.toTelemetryFields(user);
```

Avoid `delete` for ordinary projection:

```ts
const publicUser = { ...user };
delete publicUser.passwordHash;
```

Prefer constructing the intended shape:

```ts
const publicUser = {
  id: user.id,
  email: user.email,
};
```

`delete` is acceptable for genuine dynamic collections or unavoidable localized interop with a comment.

## Guard clauses

Prefer flat failure handling:

```ts
if (result._tag === "err") {
  return result;
}

return doWork(result.value);
```

Avoid `else` after `return`, `throw`, or `continue`:

```ts
if (result._tag === "err") {
  return result;
} else {
  return doWork(result.value);
}
```

Use ordinary `if/else` when branches are true peers in a domain decision.

## Exports, imports, comments

Export only intended caller interfaces. Do not export internals just for tests.

JSDoc every directly exported function, class, constant, type, and public method on exported classes. Document generics with `@template`. Document typed expected failures as return values, not `@throws`. Use `@throws` only for defects, framework-required behavior, or temporary unimplemented paths.

Comments explain invariants, trade-offs, safety, and non-obvious domain rules. Avoid comments that narrate obvious syntax.

## Toolchain

This section is loaded with TypeScript contracts for now; split it into a disclosed toolchain reference only if Vite+/toolchain detail grows beyond what ordinary TypeScript-contract work needs.

For new TypeScript projects, prefer Vite+ as formatter/linter/type checker/test runner/task interface.

In Vite+ projects:

- `vp check` is the canonical static check;
- `vp test` is the normal local/CI test command;
- Oxfmt owns formatting with defaults;
- Oxlint owns correctness/safety/performance/maintainability rules;
- warnings and unused suppressions are not tolerated;
- keep default correctness plugins and semantic checks for assertions, async loops, parameter mutation, caught-error preservation, JSDoc structure, accumulating spread, barrels, unsafe type operations, floating promises, invalid thrown values, nullish defaults, switch exhaustiveness, unknown catch callbacks, module mocks, and method spies;
- test configuration lives in `vite.config.ts`, not standalone Vitest config;
- ordinary tests import from `vite-plus/test`.

Keep tool defaults unless a correctness requirement or demonstrated false positive justifies an override. Do not enable whole lint categories merely to enforce aesthetic preferences.

Use strict compiler settings including exact optional-property behavior, unchecked-index protection, implicit-return checks, fallthrough protection, explicit override checks, and full strictness. Preserve established toolchains unless migration is explicitly in scope.

## Review checklist

Use this as the final scan after applying the rules above; the rule source of truth remains in the relevant sections.

- `as Type` on decoded JSON or database rows.
- `!` after indexing or optional fields instead of refining.
- `filter(Boolean)` accidentally removing `0`, `false`, or `""`.
- Spread-in-reduce quadratic accumulation.
- Conditional object spreads used only to avoid `undefined`.
- Exported functions/classes/types without JSDoc.
- Adding barrels or dumping helpers into `utils.ts`.
- Weakening lint/type config to make changed code pass.
