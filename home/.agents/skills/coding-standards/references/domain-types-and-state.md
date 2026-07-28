# Domain types and state

## Branded and refined values

Brand every domain/entity identifier by default, such as `UserId`, `OrgId`, or `WorkflowId`.

Brand units whose raw values could be mixed, such as `Milliseconds`, `Bytes`, or `UsdCents`.

Use parsed domain types for strings and numbers with real rules or domain meaning, such as `EmailAddress`, `Url`, `Slug`, `PositiveInt`, or `Percentage`.

Keep ordinary display text, local counters, indexes, and implementation-only values as primitives until they gain an invariant or domain meaning.

Construct branded/refined values through parsers or smart constructors, then pass those values instead of raw strings or numbers.

## Operation inputs and optionality

Push optionality outward. Branch or parse before calling a function that requires a value.

Use `Partial<T>` only when partiality is the actual domain concept. Define explicit operation inputs otherwise.

For non-trivial calls, keep the one obvious primary domain input positional. Group related configuration or capability controls into a named options object when names prevent order mistakes or make policy visible.

## Lifecycle state

Use a tagged union or equivalent value class when lifecycle states allow different data, operations, or transitions. Use a simple status value when states only need identification. A status value plus a clear transition function is enough when it fully expresses the lifecycle rules.

```ts
type Invoice =
  | { readonly _tag: "Draft"; readonly id: InvoiceId; readonly lines: NonEmptyArray<LineItem> }
  | { readonly _tag: "Sent"; readonly id: InvoiceId; readonly sentAt: Instant }
  | { readonly _tag: "Paid"; readonly id: InvoiceId; readonly paidAt: Instant };
```

Handle every closed tagged union exhaustively. When a switch needs an impossible-case helper, use the repository's established helper as specified in [`errors.md`](errors.md).

At external protocol boundaries, model unknown variants with an explicit, tested fallback policy; keep internal closed unions exhaustive.

## Boolean blindness

Use independent booleans when their combinations are genuinely independent and valid.

Boolean parameters that control behavior become named options or domain values:

```ts
createUser(input, { emailVerification: "skip" });
```

Booleans remain appropriate predicate results:

```ts
isExpired(token): boolean;
hasPermission(user, permission): boolean;
```

## Completion check

Complete when every changed domain value, operation input, and state concern is accounted for:

- each identifier, mixable unit, and constrained scalar has a parser or smart constructor that establishes its invariant;
- each remaining primitive has no domain invariant or mix-up risk that warrants a domain type;
- optionality is resolved before required calls, and each `Partial<T>` represents actual domain partiality;
- each non-trivial call keeps its primary input obvious and names controls that expose policy or prevent order mistakes;
- each lifecycle representation permits exactly its valid data, operations, and transitions;
- each closed union is handled exhaustively, and each open external protocol has an explicit, tested unknown-variant policy; and
- each boolean represents either an independently valid combination or a predicate result, while behavior controls use named options or domain values.