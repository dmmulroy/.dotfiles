# Parsing and schemas

## Parse boundary data

Boundary code turns external representations into application or domain types. Select parsing from provenance, not a function's name or a decoder-count target.

## Provenance

| Evidence supplied by the producer | Handling |
| --- | --- |
| Raw body, SQL row, native storage, or untyped callback | Parse at the owning boundary into the strongest meaningful type. |
| Known encoded representation, such as a string or schema-derived record | Preserve that input type while validating contents with a compatible typed decoder. |
| Already-parsed domain/application value | Pass it through with its established type. |
| Newly computed constrained value or patched state | Establish remaining range, cross-field, or transition invariants with the owning constructor/refinement. |

A SQL generic or library declaration describes a representation; it does not prove runtime integrity. A typed decoder is appropriate only when the actual input is assignable to its encoded type. When it is not, retain an honest boundary parser rather than casting or widening to force a decoder choice. Field types and `satisfies` provide compile-time evidence, not runtime proof of relationships among fields.

For each parsing change, identify the producer, established invariants, remaining invariants, and validation removed, retained, or moved. Replacing an unknown decoder with a typed decoder preserves validation work; eliminating a redundant parse is a separate semantic change. Encoding an established domain value merely to decode it again adds a representation round trip rather than preserving provenance.

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

Name parsers `parseX`; reserve predicates and transformations for their actual roles rather than using `validateX` or `normalizeX` as parser aliases.

## Parser APIs

Keep reusable codecs private beside their owning schema/boundary. Export an application parser only for an intended consumer, with its actual representation-specific input and the smallest useful signature: normally unary, with additional domain inputs only when callers need them. Library parse options belong to the codec owner unless they are deliberately part of the public low-level contract.

For Effect decoder selection and private-codec/unary-wrapper examples, read [`effect-schema-and-data.md#decoder-selection-and-public-parsers`](effect-schema-and-data.md#decoder-selection-and-public-parsers). A genuinely unknown schema-owned boundary remains legitimate; the goal is to preserve provenance, not disguise unknown input to satisfy syntax-only lint.

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

Every changed input has documented provenance and remaining invariants; every external or serialized path has an owning parser and typed failure; established domain values retain their types; computed and translated values receive any additional refinement they require; each exported parser has a real consumer and an intentional input/options surface; boundary representations remain private; and every trust-based exception to read-time parsing has measured evidence, documentation, and containment.