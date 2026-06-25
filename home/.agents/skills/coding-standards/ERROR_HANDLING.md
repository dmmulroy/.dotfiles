# Error Handling

Expected failures are part of the contract. Defects are not. Keep that line sharp so callers can handle normal failures and defects remain loud.

## Core vocabulary

**Expected Failure** — A normal-operation failure: domain rejection, parse failure, authorization denial, dependency unavailability, I/O/persistence failure, workflow failure, or modeled cancellation outcome.

**Unrecoverable Defect** — An impossible branch, violated invariant, startup misconfiguration, catastrophic condition, or explicit temporary unimplemented path.

**External Adapter Module** — The module that catches exception-based dependencies or framework behavior at a boundary, classifies unknown thrown values, and translates them into local typed failures or protocol/framework responses.

**Custom Error** — A typed, tagged error value with a stable tag, useful message, structured safe fields, and optional `unknown` cause.

**Precise Error Union** — The local set of failures a caller can handle semantically.

## Non-negotiables

- Expected failures are visible in the local return type through a typed value channel.
- Promise rejection is equivalent to throwing; do not use it for ordinary expected failures in local code.
- Domain and functional-core code do not use `try/catch` as normal expected-failure control flow.
- External Adapter Modules may catch exception-based APIs, but they classify `unknown` before translating.
- Catch variables and rejection reasons are treated as `unknown` until classified.
- Cancellation/interruption is recognized before wrapping unknown failures as ordinary errors.
- Startup configuration failure is a defect, but its diagnostic still avoids secrets and unsafe raw values.
- Broad `AppError`-style unions stay near orchestration, rendering, logging, and entrypoints; module interfaces expose precise local failures.

## Strong defaults

Failure representation order:

1. In Effect-based responsibilities, use Effect's typed error channel and the established Effect tagged-error mechanism such as `Schema.TaggedErrorClass`.
2. Outside Effect, use `better-result` for typed results when it is already a dependency, explicitly accepted for the package, or adding it is in scope for new code with no established result convention.
3. If `better-result` is not already available and adding it is not in scope, use the repository's established result shape or a small local tagged union.
4. Outside Effect, prefer `TaggedError` from `better-result` for custom expected-failure classes when available, even if the codebase does not adopt `Result` as the return type.

A minimal fallback result shape is fine when it is the local project choice:

```ts
type Result<T, E extends Error> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };
```

## Expected failures as values

Prefer:

```ts
function findUser(id: UserId): Promise<Result<User, UserNotFound | UserStoreUnavailable>>;
```

Avoid:

```ts
async function findUser(id: UserId): Promise<User> {
  throw new Error("not found"); // ordinary lookup absence is hidden from the type
}
```

A framework may require throwing or rejected promises at its boundary. Keep the local module typed, then translate at the boundary:

```ts
const result = await users.findById(id);

if (result._tag === "err") {
  throw toFrameworkError(result.error);
}

return result.value;
```

Do not let the framework's exception style leak inward as the service/domain contract. When the external exception-style contract remains public, document or encode the expected variants through that framework's established mechanism so consumers can distinguish them.

## Defects may throw

Throwing is for invalid program states:

- impossible branches;
- violated internal invariants;
- startup misconfiguration;
- catastrophic runtime conditions;
- `notYetImplemented` during development.

Prefer shared helpers when they exist:

```ts
casesHandled(unexpectedCase: never): never;
shouldNeverHappen(message?: string): never;
notYetImplemented(message?: string): never;
```

Do not label ordinary domain, parse, authorization, I/O, persistence, or workflow failures as defects merely because throwing is convenient.

## Custom errors

A good expected-failure error is useful to callers and safe for telemetry:

```ts
export class UserStoreUnavailable extends TaggedError("UserStoreUnavailable")<{
  readonly operation: "findActiveByEmail";
  readonly provider: "postgres";
  readonly cause: unknown;
  readonly message: string;
}>() {}

const error = new UserStoreUnavailable({
  operation: "findActiveByEmail",
  provider: "postgres",
  cause,
  message: "User store unavailable during findActiveByEmail",
});
```

When not using `TaggedError`, a class with a stable `_tag` and structured fields is acceptable:

```ts
export class UserNotFound extends Error {
  readonly _tag = "UserNotFound" as const;

  constructor(readonly userId: UserId) {
    super("User not found");
  }
}
```

Avoid public contracts made of raw strings, context-free `Error`, or unstructured messages.

## Precise error unions

Prefer:

```ts
Result<User, UserNotFound | UserStoreUnavailable>
```

Avoid:

```ts
Result<User, AppError>
```

A broad error type hides caller decisions: retry, render not-found, ask for auth, stop workflow, compensate, or report dependency outage.

## Lookup absence

For required lookups, absence is a typed not-found failure:

```ts
findById(id: UserId): Promise<Result<User, UserNotFound | UserStoreUnavailable>>;
```

Use optional results only when optionality is intentional and obvious:

```ts
maybeFindById(id: UserId): Promise<Result<User | undefined, UserStoreUnavailable>>;
exists(id: UserId): Promise<Result<boolean, UserStoreUnavailable>>;
```

In Effect codebases, `Option` is fine for intentional optional lookup semantics.

## Boundary catch and classification

Prefer:

```ts
try {
  const response = await fetch(url, { signal });
  return ok(response);
} catch (cause: unknown) {
  if (isAbortCause(cause)) {
    return err(new RequestCancelled({ operation: "fetchUser", cause }));
  }

  return err(new HttpRequestFailed({ operation: "fetchUser", provider: "users-api", cause }));
}
```

Avoid:

```ts
catch (error) {
  logger.error(error.message); // assumes JavaScript threw an Error and may leak data
  throw error;
}
```

Only boundary/rendering/logging code should normalize unknown thrown values for display. External Adapter Modules preserve the original cause where useful.

## Rejected framings

- **"Recoverable exception."** If callers can recover, put it in the return type.
- **"The controller catches it anyway."** Boundary translation does not excuse hidden local failure contracts.
- **"Everything is AppError."** Broad unions erase semantic handling.
- **"Not found is undefined."** Required lookup absence is a failure unless the operation is explicitly optional.
- **"Cancellation is just another dependency error."** Cancellation is a control path and must be classified before wrapping.
- **"Use this error library because I like it."** Prefer established/local representations when they satisfy the typed semantic contract.

## Review checklist

Use this as the final scan after applying the rules above; the rule source of truth remains in the relevant sections.

- `async` functions rejecting for ordinary dependency failures.
- Catching `error` and using `.message` without classification.
- Returning `Result<T, Error>` with no stable tags.
- Throwing parse/authorization/domain failures from core logic.
- Forgetting `cause: unknown` when translating lower-level dependency failures.
- Treating startup config diagnostics as a place to print raw environment values.
