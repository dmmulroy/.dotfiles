# Errors

## Expected failures are values

Every known failure mode appears in the return type as a custom tagged error, even when the immediate caller cannot recover. A caller handles the error or returns it upward. The outermost boundary translates it into a valid outcome such as an HTTP response, CLI exit code, retry decision, dead letter, or startup error message.

Known failures include domain, parsing, authorization, integration, I/O, persistence, configuration, and workflow failures.

Use, in order:

1. Effect in an Effect codebase.
2. `better-result` when available.
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

rather than a `Promise<User>` that rejects for ordinary lookup or storage failures.

Promise rejection is equivalent to throwing. The module that directly owns a third-party client—an Adapter or a localized service implementation—catches unclassified rejection and translates it into a known tagged error before it crosses that module's public interface. Rejection may escape application code only for a defect.

## Defects

Throw or panic only when a defect makes correct execution impossible, rather than because the current caller lacks a recovery strategy. Defects include:

- violated internal invariants;
- impossible branches;
- temporary `notYetImplemented` paths;
- catastrophic runtime conditions.

Known configuration failures are values; the composition root reports them safely and terminates startup.

Use the repository's established defect mechanism; otherwise use the runtime's native throw or panic. Reuse shared defect helpers when they carry stable semantics or serve multiple callers:

```ts
export function casesHandled(unexpectedCase: never): never;
export function shouldNeverHappen(msg?: string): never;
export function notYetImplemented(msg?: string): never;
```

Use `casesHandled` for exhaustive union handling. Keep a defect helper local until stable semantics or reuse earns shared ownership.

## Custom errors

Expected failures use custom tagged errors, generally extending:

- `Error`;
- `TaggedError` from `better-result`;
- `Schema.TaggedErrorClass` in Effect codebases.

A custom error includes:

- a stable tag using `as const`;
- a useful message explaining what failed, why when known, and how to recover when actionable;
- structured contextual fields with the relevant operation and safe domain/provider data;
- safe telemetry fields;
- an optional `cause: unknown`.

Keep distinct failure modes as granular error types and union them at the operation boundary. Combine failures only when callers handle them the same way, they need the same observability, and structured fields preserve the useful context.

The error that owns a failure constructs its stable message. Begin the message with a stable literal phrase that leads a plain-text search back to the owning error definition, then append dynamic context. Callers may add safe context or translate the error at an outer boundary. Error classification uses tags and fields rather than matching message text.

Model absence according to the operation's meaning. Return an optional value when missing data is an ordinary result for the caller to interpret. Return a typed not-found error when the operation requires the value or absence violates its local invariant or precondition.

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

Broad `AppError`-style types belong near entrypoints, orchestration, logging, and rendering layers.

## Completion check

Every applicable rule above has been checked: each known failure is represented by a granular typed error or explicitly classified as a defect; throws and rejections are reserved for defects; absence has the intended optional or typed not-found meaning; error types own stable, searchable literal message prefixes and safe structured context; operation error unions remain precise; third-party rejections are translated by their owner; outer boundaries translate expected failures into valid outcomes; and failure classification uses tags and fields.