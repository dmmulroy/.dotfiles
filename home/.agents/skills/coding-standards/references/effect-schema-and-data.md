# Schema And Data Modeling

Use this when touching data models, DTOs, row schemas, wire contracts, brands, variants, optional fields, or decoders.

## Records

Default to `Schema.Struct(...)` plus a same-name `interface`.

```ts
export const User = Schema.Struct({
  id: UserId,
  name: Schema.NonEmptyString,
  email: Schema.optionalKey(Schema.String),
})

export interface User extends Schema.Schema.Type<typeof User> {}
```

Guidance:

- Add `.annotate({ identifier: "User" })` only when tooling consumes it: HTTP API, RPC, OpenAPI/JSON Schema, docs, diagnostics, or codegen.
- Use the owning constructor to establish new constraints; prefer `schema.makeEffect(...)` when failure belongs in the Effect channel and `schema.make(...)` only where its throwing behavior is appropriate.
- Apply [`parsing-and-schemas.md#provenance`](parsing-and-schemas.md#provenance) to decide whether validation is needed, then choose the API below. An established domain value needs neither another decoder nor a ceremonial constructor.

## Decoder Selection And Public Parsers

Select the decoder whose encoded input and failure channel match the boundary:

- `Schema.decodeUnknownEffect(codec)` accepts genuinely unknown external input.
- `Schema.decodeEffect(codec)` retains the codec's encoded type while still validating its contents. A known `string` does not satisfy an encoded literal union; use this API only when the existing representation actually fits.
- `Schema.fromJsonString(codec)` represents a JSON string boundary. Use `Schema.toCodecJson(schema)` when JSON is the actual encoded representation, not to manufacture a round trip for an already-parsed value.
- Sync decoders fit scripts, tests, or startup paths where throwing is acceptable. Option decoders intentionally discard mismatch details; Result decoders retain explicit pure success/failure. Choose the typed or unknown variant by the same provenance rule.

Keep an unknown decoder private at its actual adapter, rather than exporting its generated function as a general application-parser template:

```ts
const decodeCreateUserRequest = Schema.decodeUnknownEffect(CreateUserInput)

// Inside the owning HTTP adapter after reading the body:
const input = yield* decodeCreateUserRequest(requestBody)
return yield* users.create(input)
```

For known encoded input, expose a narrow application contract:

```ts
import { Effect, Schema } from "effect"

const DeploymentStage = Schema.String.check(
  Schema.isPattern(/^(local|preview|production)$/),
).pipe(Schema.brand("DeploymentStage"))

type DeploymentStage = typeof DeploymentStage.Type
const decodeDeploymentStage = Schema.decodeEffect(DeploymentStage)

/** Parses a deployment stage string without exposing library parse options. */
export const parseDeploymentStage = (
  input: string,
): Effect.Effect<DeploymentStage, Schema.SchemaError> => decodeDeploymentStage(input)
```

Directly exporting either decoder factory result also exposes its library parse options. Keep that surface only when a deliberate public low-level codec contract needs it; ordinary application callers use the wrapper. Respect existing public API compatibility when narrowing an established export. Verify constructor/decoder names against the pinned Effect release before adapting these v4 examples.

A translated persisted row may have valid individual fields while violating an application-owned cross-field filter. Retain that refinement, using a compatible typed decoder or constructor after translation. `satisfies` cannot replace this runtime check; a computed value may likewise introduce an invariant its input types did not establish.

## Field And Contract Reuse

Reuse fields directly when contracts are semantically related.

```ts
export const CreateUserInput = Schema.Struct({
  name: User.fields.name,
  email: User.fields.email,
})

export const StoredUser = User.pipe(
  Schema.fieldsAssign({
    createdAt: Schema.DateTimeUtcFromString,
  }),
)
```

Guidance:

- Use `.fields`, `Schema.fieldsAssign(...)`, and `.mapFields(...)` to build small contracts with a genuine semantic relationship.
- Use `Schema.encodeKeys(...)` when decoded TypeScript names differ from encoded wire/storage keys and naming is the only difference.
- Keep explicit mapping when behavior, joins, validation, or domain translation is involved.
- Use `Schema.extendTo(...)` sparingly for decoded-only derived fields.

## Optionality And Defaults

Apply [`domain-types-and-state.md`](domain-types-and-state.md) to decide domain optionality. Represent the encoded contract precisely:

- Use `Schema.optionalKey(...)` for absent JSON/storage keys.
- Use `Schema.optional(...)` only when explicit `undefined` is part of the contract.
- Use `Schema.NullOr`, `Schema.UndefinedOr`, or `Schema.NullishOr` only when nullish values are part of the encoded contract.
- Keep normalized defaulted values as required fields and apply defaults in constructors/decoding.

## Nominal Values

Apply [`domain-types-and-state.md`](domain-types-and-state.md) to decide which values require brands or refinements.

- Implement scalar IDs and value objects as constrained branded schemas.
- Apply normal schema constraints before `Schema.brand(...)` for most code.
- Use `Schema.fromBrand(...)` when the project already models brands with `Brand` constructors or needs the check packaged with the brand constructor.

## Variants

```ts
type Step = Data.TaggedEnum<{
  Continue: { readonly cursor: number }
  Finished: { readonly count: number }
}>

export const Step = Data.taggedEnum<Step>()

const next = Step.Continue({ cursor: 10 })
const label = Step.$match(next, {
  Continue: ({ cursor }) => `continue at ${cursor}`,
  Finished: ({ count }) => `finished ${count}`,
})
```

```ts
export const Event = Schema.TaggedUnion({
  Started: { runId: RunId },
  Finished: { runId: RunId, result: Schema.Json },
})

export type Event = typeof Event.Type

const event = Event.cases.Started.make({ runId })
const label = Event.match(event, {
  Started: ({ runId }) => `started ${runId}`,
  Finished: ({ runId }) => `finished ${runId}`,
})
```

Guidance:

- Use `Data.TaggedEnum` for internal control-flow algebras; it provides constructors, `$is`, and exhaustive `$match`.
- Use `Schema.TaggedStruct` for the ordinary Effect-owned `_tag` variant.
- Use `Schema.TaggedUnion` when the union needs decoding, encoding, persistence, wire validation, JSON Schema derivation, or schema composition.
- Use `Schema.tag(...)` when an external contract has a custom discriminator field such as `type` or `kind`; combine those structs with `Schema.toTaggedUnion("type")` when union helpers are needed.
- If the encoded contract omits the discriminant, use `Schema.tagDefaultOmit(...)` deliberately.
- Use structural schemas—`Schema.Struct`, `Schema.TaggedStruct`, or `Schema.TaggedUnion`—for new data models.

## Errors

Apply [`errors.md`](errors.md) to error meaning, context, translation, and recovery. Schema tagged errors are the class exception for typed Effect failures. The example uses `Schema.TaggedError`; older v4 prereleases expose `Schema.TaggedErrorClass` instead. Use the constructor exported by the pinned package.

```ts
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "UserRepo.PersistenceError",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}
```

Guidance:

- Use schema unions for public API or transport error surfaces.
- `Schema.Defect()` represents defect-like payloads; it does not redact them. Keep raw causes internal and apply [sensitive-data policy](sensitive-data-and-observability.md) before reporting or serialization.

## Completion Check

Every changed Effect data model uses the selected record or variant representation; every reused field preserves the same meaning; every encoded optional or nullish state is intentional; every default produces a required normalized value; every decoder matches the actual encoded input and failure policy; each public parser exposes only intentional inputs/options; additional cross-field and computed invariants retain runtime evidence; and every serialized error surface follows [`errors.md`](errors.md).
