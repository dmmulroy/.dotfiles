# Boundaries and Parsing

Every external, serialized, persisted, or framework-shaped value is less structured than your domain model. Parse at the seam, pass refined values inward, and project explicitly on the way out.

## Vocabulary

**Unknown Boundary Input** — Data from HTTP, RPC, queues, env vars, storage rows, JSON, third-party APIs, runtime hops, or framework objects before a parser establishes a precise type.

**External Adapter Module** — The module that translates between external/framework representations and service/domain values. It includes inbound protocol handlers and outbound persistence, runtime, SDK, platform, and third-party adapters.

**Persistence Boundary Parser** — A parser that reconstructs domain values from storage DTOs or rows and rejects contradictory persisted state.

**Protocol Projection** — A conversion from domain/service value to HTTP/RPC/queue/public API shape, owned by the protocol External Adapter Module.

**Persistence Projection** — A conversion between domain/service values and storage rows/records, owned by the persistence External Adapter Module.

## Non-negotiables

- Unknown boundary input stays `unknown` or boundary DTO-shaped until parsed.
- External input is parsed in the External Adapter Module, handler, composition entrypoint, or receiving runtime-hop handler before service/core code sees it; correct-by-construction values are passed inward.
- Decoded JSON, response bodies, env values, queue messages, storage JSON, and similar data are not cast into domain/service types.
- A successful parse returns the refined value; do not validate and then keep passing the unrefined input.
- Core/service code does not repeatedly downcast, shape-check, or defensively revalidate values already parsed, unless they crossed a new boundary.
- Storage/ORM rows are boundary input and are parsed before service logic sees them.
- Runtime-hop payloads satisfy the transport serialization contract and are parsed/reconstructed on receipt.
- Protocol DTOs and persistence records are different projections; do not reuse one as the other by convenience.
- Environment/runtime config is parsed at startup or the earliest composition seam into typed config.

## Strong defaults

- Use the repository's established schema library when it satisfies the contract.
- In Effect codebases, use Effect Schema for refined values and codecs.
- Generic schema helpers should be Standard Schema compatible.
- If no schema convention exists outside Effect, prefer Zod 4.
- Mutating command/request object parsers reject unknown fields by default.
- Concrete parsers are named `parseX`.
- Smart constructors from already typed pieces are named `makeX` or `createX`.
- True predicates are named `isX`.
- Avoid `validateX` for functions that return refined values; they parse.

## Parse early

Parser failure shape follows the repository's error-handling convention. A parser may return a `Result`, throw inside a schema-library adapter that is immediately classified at the boundary, or use the established typed parse-failure channel; the successful path returns the refined value that flows inward to Service Modules and Domain Modules.

Prefer:

```ts
async function handle(body: unknown): Promise<Result<Response, CreateUserError>> {
  const input = CreateUserInput.parse(body);
  if (input._tag === "err") {
    return input;
  }

  return users.create(input.value);
}
```

Avoid:

```ts
async function handle(body: any) {
  return users.create(body); // untrusted data enters service logic
}
```

Avoid validation that discards knowledge:

```ts
CreateUserSchema.parse(body);
return users.create(body); // still the unrefined value
```

## No serialized trust casts

Avoid:

```ts
const input = JSON.parse(text) as CreateUserInput;
const user = await response.json() as User;
const row = record as Invoice;
```

Prefer:

```ts
const raw: unknown = JSON.parse(text);
const input = CreateUserInput.parse(raw);
```

A cast after parsing can be acceptable for branding internals when TypeScript cannot express the invariant, but it needs a local `SAFETY:` explanation and must not leak to callers.

## Concrete parsers, not shared shape guards

Do not export generic utilities like:

```ts
isRecord(value): value is Record<string, unknown>;
isObject(value): value is object;
isArray(value): value is unknown[];
```

They usually mean untrusted values are flowing too far inward. Use concrete parsers:

```ts
const input = CreateUserInput.parse(body);
```

Local `Array.isArray` or object checks are fine inside concrete parser/schema-adapter implementations.

## Strict command objects

Mutating command/request parsers should reject unknown fields so misspellings and obsolete fields fail loudly:

```ts
const CreateUserBody = z.strictObject({
  email: EmailAddressSchema,
  role: RoleSchema,
});
```

Use permissive shapes only for explicitly extensible sub-objects, such as third-party metadata.

## Persistence boundary parsing

Treat inferred storage DTOs as infrastructure facts, not domain proof:

```ts
type InvoiceRow = typeof invoices.$inferSelect;

function parseInvoiceRow(row: InvoiceRow): Result<Invoice, InvalidStoredInvoice> {
  // reject impossible combinations; reconstruct domain values
}
```

Reject contradictory persisted states. Do not silently normalize an impossible row such as `state = "open"` with a non-null `completedAt`.

Use schema-inferred row/insert/update DTOs where the storage library supports them, but parse rows before service logic sees them.

## Runtime and serialization boundaries

Values crossing process, runtime, RPC, queue, workflow, Worker/DO/Agent, or structured-clone boundaries must be serializable for that transport.

Do not send rich local objects unless the transport explicitly preserves them:

- class instances;
- custom errors;
- value classes;
- functions;
- database handles;
- request-local objects;
- prototypes/private state.

Use explicit DTOs/codecs and parse on the receiving side:

```txt
Domain value -> protocol DTO -> runtime hop -> parse DTO -> local domain value
```

This applies to result and error values too.

## Protocol and persistence projections

Own each projection at its boundary:

```ts
UserHttp.toPublicJson(user);
UserStorage.toRow(user);
UserQueue.encodeUserCreated(event);
```

Avoid Domain Modules exporting HTTP response policy or persistence column shapes. Domain Modules may expose neutral deconstruction/accessor helpers and domain formatting, but External Adapter Modules own their consumer-specific protocol and persistence shapes.

Do not reuse an HTTP JSON response as a database row merely because both are serializable.

## Config parsing

Parse environment/runtime config once at startup or composition:

```ts
type AppConfig = {
  readonly databaseUrl: Url;
  readonly apiToken: Redacted<string>;
};
```

Avoid reading `process.env` or platform env bindings throughout the app. Missing/invalid config is a startup defect with safe diagnostic context.

## Rejected framings

- **"TypeScript says the row is typed."** Storage types describe database shape, not domain validity.
- **"JSON.parse as T is fine inside a trusted system."** Serialized data loses runtime proof.
- **"We validated it already."** If the refined value is not what flows inward, the parse did not help.
- **"DTOs are domain models."** DTOs are boundary representations.
- **"Generic isRecord helpers are harmless."** They usually spread boundary uncertainty inward.

## Review checklist

Use this as the final scan after applying the rules above; the rule source of truth remains in the relevant sections.

- Typing request bodies as `any` for convenience.
- Casting `Response.json()` output to an app type.
- Passing Drizzle/ORM rows directly to Service Modules.
- Reusing public API JSON as persistence records.
- Accepting unknown fields in mutating commands by default.
- Parsing config in many modules instead of one composition seam.
- Sending custom error/class instances across runtime boundaries without codecs.
