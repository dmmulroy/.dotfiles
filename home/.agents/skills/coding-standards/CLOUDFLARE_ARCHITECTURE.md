# Cloudflare Architecture

Cloudflare platform objects are infrastructure. Keep raw bindings at composition seams, cross runtime hops with explicit DTOs/context, and make stateful objects own coordination rather than accidental global compute.


## Vocabulary

**Cloudflare Composition Seam** — The outer Worker/DO/Agent/composition location where raw `Env`, execution context, and bindings become app-level dependencies.

**Cloudflare Binding Capability** — A service-facing capability backed by Cloudflare bindings whose interface uses service/domain types, not raw platform binding types.

**Runtime Hop** — A boundary such as DO RPC, Agent RPC, service binding, queue delivery, Workflow step, `RpcTarget`, or Worker-to-Worker call.

**Control Plane** — Stateful objects/capabilities that own resource metadata, lifecycle, shard maps, child creation, admin operations, listing, deletion, and routing metadata.

**Data Plane** — Stateful objects/capabilities that own high-volume operations for a specific resource, shard, user, tenant, room, document, queue shard, or coordination atom.

## Non-negotiables

- Raw `Env`, execution context, bindings, namespaces, stubs, D1/R2/KV/Queue objects, and Workflow bindings stay in composition seams or tightly local Cloudflare External Adapter Module implementations.
- Service Modules and Domain Modules do not import or accept Cloudflare binding types.
- Cloudflare-backed External Adapter Modules expose service-facing capabilities named in service/domain terms.
- Request-local env, context, users, sessions, and dependencies are not stored in mutable module-level globals.
- Runtime hops are context boundaries; required trace/actor/idempotency/locale/feature metadata crosses explicitly.
- Runtime payloads do not carry raw `Env`, request objects, execution contexts, database handles, secrets, or dependency bags.
- Stateful-object names are normalized through domain-owned canonicalization before lookup.
- New application state in Durable Objects/Agents uses SQLite-backed storage, not legacy KV-backed object storage.
- Application-owned Cloudflare SQL schemas, queries, and migrations use the project-standard Drizzle layer.

## Strong defaults

- New Worker projects use the Cloudflare Vite integration and root `cloudflare.config.ts` as the primary configuration source.
- Enable Node compatibility for Cloudflare Workers projects.
- Generate Worker environment declarations from deployment configuration; keep hand-written compatibility declarations tiny and removable.
- New non-Effect multi-route Cloudflare HTTP apps use Hono unless the repo has another established framework or the Worker is tiny/pass-through/static/direct Agent routing.
- New stateful-object modules use the Agents SDK `Agent` abstraction unless a documented lower-level/dependency/interoperability/performance reason justifies raw Durable Objects.
- Agent-backed classes are named for their domain role: `TenantWorkspace`, `DocumentSession`, `ChatRoom`, not `SomethingAgent` by habit.
- Workers use bindings, typed RPC, service bindings, or supported loopback for internal connectivity instead of public REST calls to Cloudflare services when an equivalent binding exists.
- R2/KV keys, queue names, and stateful-object lookup names are built in domain-specific key/identity modules or inside the owning adapter.

## Configuration and composition

Prefer:

```txt
fetch(request, env, ctx)
  -> createRequestScope(env, ctx)
  -> app.fetch(request, scope)
  -> Service Modules receive app-level capabilities
```

Avoid:

```ts
export class BillingService {
  constructor(private readonly env: Env) {}
}
```

Service-facing interfaces should look like:

```ts
type EmailJobs = {
  enqueueWelcomeEmail(input: WelcomeEmailJob): Promise<Result<void, EmailQueueUnavailable>>;
};
```

not:

```ts
type EmailJobs = {
  queue: Queue;
};
```

A concrete External Adapter Module may accept a binding in its constructor when that adapter is clearly infrastructure code created at the composition seam.

## Runtime hops and serialization

Do not assume `AsyncLocalStorage`, request context, dependencies, or framework locals propagate across DO/Agent RPC, service bindings, queues, or Workflow steps.

Pass safe context explicitly:

```ts
type RpcContextDto = {
  readonly traceId: string;
  readonly actorId: string;
  readonly idempotencyKey?: string;
};
```

Do not smuggle raw dependencies:

```ts
type BadRpcPayload = {
  readonly env: Env;
  readonly request: Request;
  readonly token: string;
};
```

Cloudflare runtime hops are also serialization boundaries. Use DTOs/codecs for class-backed results, custom errors, domain values, and non-trivial payloads; parse/reconstruct on the receiving side.

At every **Runtime Hop**, apply the context, serialization, parsing, and safe-observability rules together.

## RPC surfaces

Raw Durable Objects should expose typed RPC operations rather than fetch-shaped internal APIs. Use focused `RpcTarget` facades when callers need a narrower role-specific surface or explicit call metadata.

Keep public DO/Agent/RPC methods DTO-shaped at the runtime boundary; convert to service/domain values inside the receiving composition seam.

## Stateful objects and identity

Normalize instance names before lookup:

```ts
const objectName = ChatRoomName.toObjectName(chatRoomName); // e.g. lowercased/canonicalized
const id = namespace.idFromName(objectName);
```

Avoid inline string construction across callers:

```ts
namespace.idFromName(`room:${name.toLowerCase()}`);
```

Use stable prefixes when they clarify identity and avoid collisions: `user:${userId}`, `tenant:${tenantId}`, `doc:${documentId}`.

A stateful object with meaningful durable identity stores an `_identity` row/table or equivalent local record with canonical ID/name, created-at, and relevant administrative metadata. Runtime names alone are not enough for alarms, migrations, repair, and debugging. Raw Durable Objects with meaningful durable identity should expose an explicit identity capability, such as `getIdentity()` / `setIdentity(...)`, backed by that record.

## Startup, heartbeat, and work role

Use the runtime startup gate:

- `ctx.blockConcurrencyWhile(...)` for raw Durable Objects;
- `onStart()` for Agents.

Do not mirror startup with `this.ready` and await it in every method.

Every Durable Object/Agent should expose and schedule a low-frequency `heartbeat()` maintenance method for cleanup, migrations, health metadata, repair hooks, and administrative checks. Keep heartbeat work small and local; enqueue/shard/orchestrate expensive work elsewhere.

Durable Objects and Agents own serialized coordination and local state transitions for one shard/entity. They should not become accidental global compute workers for CPU-heavy, high-fanout, bulk, or long-running work.

## Control plane and data plane

For multi-tenant, sharded, or partitioned systems, separate lifecycle/routing metadata from high-volume data operations.

```txt
Control plane: create tenant, list shards, route metadata, admin lifecycle
Data plane: tenant/document/room/shard operations on hot path
```

After a resource is created/resolved, hot request paths should route directly to the data-plane object rather than bouncing through a coordinator.

Skip the split only for truly tiny or non-sharded systems with no meaningful control-plane role.

## Storage

Use Drizzle for application-owned Cloudflare SQL storage:

- schema modules;
- inferred select/insert/update DTOs;
- Drizzle migrations;
- queries through Drizzle;
- parser/projection functions at the External Adapter Module seam.

Raw SQL is reserved for tiny bootstrapping glue, framework internals, generated migrations, or cases Drizzle cannot express cleanly. Keep exceptions localized and documented.

Stateful-object storage stays local to the object that owns the coordination responsibility. One object should not read/mutate another object's local SQLite state by bypassing its interface unless an explicit distributed-storage design assigns ownership elsewhere.

## Work distribution

Use Agent fibers for durable work owned by one Agent's lifecycle: resumable local work, checkpointed long-running operations tied to that Agent, accepted background work needing local idempotency and later inspection.

Use Durable Workflows for multi-step processes across services/objects/APIs/transaction boundaries that need retries, compensation, human approval, timers, resumability, or distributed orchestration.

Do not use Agent fibers as a substitute for cross-service orchestration with compensation or distributed state. Do not use Durable Workflows for work whose known startup-latency requirement the platform cannot meet.

## Cloudflare testing

Use `@cloudflare/vitest-pool-workers` for tests that touch Workers runtime APIs or bindings:

- generated `Env`;
- Durable Objects, Agents;
- D1, R2, KV, Queues, Workflows;
- service bindings, `ctx.exports`;
- WebSockets, alarms;
- workerd serialization/runtime behavior.

Pure domain/service behavior can stay in ordinary fast tests. SQL persistence tests use real migrations and the appropriate local database/runtime.

## Rejected framings

- **"Env is just config."** Raw Cloudflare bindings are infrastructure, not app contracts.
- **"RPC carries our request scope."** Runtime hops are context boundaries.
- **"Class instances should survive RPC."** Treat runtime hops as serialization boundaries unless the platform explicitly preserves semantics.
- **"Durable Objects are general workers."** They coordinate local state; expensive work is delegated.
- **"One coordinator is simpler."** A hot-path coordinator becomes a bottleneck in sharded/multi-tenant systems.
- **"Wrangler plus Vite config is fine."** Duplicate config is a second source of truth unless it is small compatibility glue.

## Review checklist

Use this as the final scan after applying the rules above; the rule source of truth remains in the relevant sections.

- Passing `Env`, `DurableObjectNamespace`, `D1Database`, `Queue`, or stubs into Service Modules.
- Hand-authoring broad global `Env` declarations when generated types exist.
- Assuming `AsyncLocalStorage` survives DO/Agent/service binding calls.
- Building object names inline in many files.
- Forgetting `_identity` storage for stateful objects.
- Creating raw Durable Objects by habit instead of using Agents.
- Scattering raw SQL or hand-written migration systems beside Drizzle.
- Testing workerd-dependent behavior only in Node.
