# Parsing and schemas

## Parse boundary data

Boundary code turns unknown or less-structured input into application or domain types before it enters inner code.

## Boundary representations

Use a separate protocol or persistence representation when its fields, encoding, naming, optionality, or semantics differ from the application input and the separation keeps those boundary concerns out of inner code. `DTO` describes this boundary role in prose; symbols use their actual meaning, such as `CreateUserRequest`, `StripeCustomerResponse`, or `UserRecord`:

```txt
unknown -> CreateUserRequest -> CreateUserInput -> EmailAddress/UserId/etc.
```

When the boundary and application shapes have the same meaning and invariants, parse directly into the application input:

```txt
unknown -> CreateUserInput
```

A boundary schema owns its protocol or persistence representation. Derive that representation's type from the schema, keep it inside the owning boundary, and translate it into an application or domain type before calling inner code. When an Effect Schema directly produces the final branded domain type, derive that type from the Schema without an intermediate representation.

## Parser names

Use names that preserve meaning:

- `parseX(input): Result<X, ParseXError>` for untrusted or less-structured input;
- `makeX(...)` / `createX(...)` for smart constructors from already-typed pieces;
- `isX(value): value is X` for true predicates;
- `assertX(...)` at tests or framework boundaries whose API requires throwing.

Functions that refine untrusted or less-structured input are parsers named `parseX`. `validateX` and `normalizeX` are prohibited aliases for parsers.

## Schema choices

Use schema libraries as boundary parsers. Choose, in order:

1. the repository's established schema library;
2. Effect Schema in Effect codebases;
3. Standard Schema compatibility for generic helpers;
4. Zod 4 otherwise;
5. a hand-written smart constructor/parser when it is clearer for a small domain type.

Represent parsing failures with typed custom errors.

Parse every path where less-trusted data re-enters typed code, including database reads, cache hits, RPC responses, event consumption, workflow replay, and serialized-state rehydration—even when the same process wrote the data. A write-time parser does not prove stored or replayed bytes remain valid.

On a measured performance-critical path, a documented trust invariant may replace read-time parsing. Keep the unchecked representation inside its owning boundary.

## Completion check

Every external or serialized input path in the changed behavior has an owning schema or parser; every value passed into inner application code is an application or domain type; every parsing failure is typed; boundary representations remain inside their owning boundaries; and every path that relies on a trust invariant instead of read-time parsing has measured evidence, documentation, and containment.