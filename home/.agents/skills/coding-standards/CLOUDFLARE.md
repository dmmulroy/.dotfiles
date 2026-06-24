# Cloudflare Standards

Use this file only when changed behavior depends on Cloudflare configuration, bindings, Workers, service bindings, RPC, Durable Objects, Agents, D1, SQLite, R2, KV, Queues, Workflows, alarms, fibers, or workerd semantics.

## Configuration and composition

For new non-Effect Cloudflare Worker projects, prefer the Cloudflare Vite integration and root `cloudflare.config.ts` as the primary Worker configuration source of truth. Do not introduce Wrangler config for ordinary bindings/routes/vars/service bindings/triggers/runtime configuration when `cloudflare.config.ts` can express them.

Always enable Cloudflare Node compatibility mode for Worker projects.

Prefer generated Worker environment declarations from deployment config. Avoid hand-authored broad `env.d.ts` or manual global `Env` overrides when generation can express bindings.

Raw `Env`, execution context, binding objects, namespaces, stubs, D1/R2/KV/Queue objects, Workflow bindings, and other Cloudflare infrastructure types belong only in composition seams or tightly local adapter implementations. Application/domain modules depend on app-facing capabilities in domain/application terms.

A Worker entrypoint should create request scope from `env` and `ctx`, then call the app through that scope. If using Hono, prefer Hono middleware/context. If not using Hono and Node compatibility is enabled, `AsyncLocalStorage` may be used. Do not store request-scoped data in mutable module globals.

Use Cloudflare bindings rather than public REST APIs from inside Workers when an equivalent binding exists. Prefer service bindings, typed WorkerEntrypoint RPC, or `ctx.exports` loopback for Worker-to-Worker communication.

For non-Effect multi-route HTTP Workers, Hono is the default recommendation unless another framework is established.

## Runtime hops and serialization

Cloudflare runtime hops are context seams and serialization seams: DO RPC, Agent RPC, service bindings, `RpcTarget`, Queue consumers, Workflow steps, Worker-to-Worker calls, and equivalent workerd seams.

Do not assume request-local `AsyncLocalStorage` or ambient context propagates across a runtime hop. Pass trace IDs, actor/principal IDs, idempotency keys, locale, feature flags, and safe non-secret metadata explicitly.

Do not carry raw `Env`, request objects, execution contexts, database handles, secrets, or dependency bags across runtime payloads.

Values crossing these seams must satisfy structured-clone/JSON contracts. Do not pass class instances, functions, prototypes, database handles, request-local objects, rich domain values, custom error instances, or result classes directly unless the platform explicitly preserves semantics.

Use explicit seam DTOs and codecs. Serialize/project before crossing; parse/reconstruct immediately on receipt before application logic. Results and errors need codecs too.

Raw Durable Objects should usually expose typed RPC operations rather than fetch-shaped internal APIs. Use focused `RpcTarget` facades when callers need narrower role-specific surfaces.

## Stateful objects and Agents

Default to Agents SDK `Agent` for new Durable Object-like stateful units, even when not AI-related. Use raw `DurableObject` only for clear reasons: ultra-minimal object, dependency constraints, lower-level WebSocket hibernation/control, platform examples, or measured performance/bundle-size reasons.

Name Agent-backed classes for their domain role, not `Agent` flavor. Cloudflare object lookup is an adapter detail; application modules depend on capabilities such as `ChatRooms` or `DocumentSessions`, not namespaces/stubs.

Normalize stateful-object instance names according to domain-owned canonicalization before lookup. Prefer parsed/branded domain identifiers and keep normalization, stable prefixing, location hints, jurisdiction, props, RPC codecs, and lookup together inside the adapter.

A stateful object with meaningful durable identity must persist canonical identity and administrative metadata locally, usually in an `_identity` table.

Every Durable Object or Agent must expose and schedule a low-frequency `heartbeat()` maintenance method. For Agents, schedule it in `onStart()` with idempotency. For raw Durable Objects, use alarms and route alarm execution to `heartbeat()`.

Use runtime startup gates: `ctx.blockConcurrencyWhile(...)` for raw Durable Objects or `onStart()` for Agents. Do not mirror with a separate `this.ready` promise per method.

A Durable Object/Agent owns serialized coordination and local state transitions for an appropriate shard/entity. It must not become an accidental global compute worker for CPU-heavy, high-fanout, bulk, or long-running work.

For multi-tenant, sharded, or partitioned stateful systems, separate control-plane and data-plane roles by default. Do not require this complexity for tiny unsharded systems without meaningful control-plane role.

## SQL and storage

Use SQLite-backed storage for new Durable Objects and Agents. Do not create new legacy KV-backed DO classes for application state.

Keep DO/Agent storage local to the object that owns coordination unless explicit distributed-storage design assigns ownership elsewhere.

Use Drizzle for application-owned Cloudflare SQL storage: D1 and SQLite-backed DOs/Agents. Use Drizzle schemas, inferred DTOs, typed queries, and migrations. Avoid hand-written application migration systems and scattered raw SQL.

Storage adapters must parse inferred rows into domain/application values before application logic sees them.

R2/KV object keys, queue names, and stateful-object lookup names should be constructed in domain-specific key/identity modules or owning Cloudflare adapters.

Queue messages, Workflow params, KV values, D1 JSON columns, service binding payloads, and DO/Agent RPC payloads need explicit DTOs and codecs.

## Work distribution

Use Agent fibers for durable work that belongs inside one Agent lifecycle. Use Durable Workflows for multi-step processes across services, objects, APIs, or transaction seams needing retries, compensation, human approval, timers, resumability, or distributed orchestration.

Do not use Agent fibers as substitute for cross-service orchestration involving compensation, distributed state, or multi-resource transaction seams.

## Testing

Pure domain/application modules use ordinary fast tests outside Workers runtime when they do not touch Cloudflare APIs.

Use `@cloudflare/vitest-pool-workers` for tests that touch Workers runtime APIs or bindings: generated `Env`, DOs, Agents, D1, R2, KV, Queues, Workflows, service bindings, `ctx.exports`, WebSockets, alarms, and workerd serialization/runtime behavior.

SQL persistence tests should initialize real migrations or Drizzle schema and exercise production adapters through app-facing interfaces. Node-only tests are not proof of workerd-specific behavior.

## Effect and Alchemy on Cloudflare

If a Cloudflare project uses Effect and is selecting resource/configuration/deployment model, use Alchemy V2. Do not mix ad hoc Wrangler config, one-off scripts, or parallel infrastructure modeling unless a documented tooling gap requires compatibility glue.
