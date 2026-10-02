---
name: cloudflare-composition-root
description: Composition roots for Hono and Cloudflare. Use when adding a binding-backed service or refactoring raw runtime dependencies out of inner code.
disable-model-invocation: true
---

# Cloudflare Composition Root

Use a **composition root**: each runtime entrypoint turns raw Cloudflare capabilities into application-owned dependencies, assembles services, and invokes them. Inner code receives ports, never `Env`, raw bindings, framework service locators, or binding names.

```text
Cloudflare entrypoint
  → tracer + parsed configuration
  → binding adapters
  → exact service dependencies
  → application service
  → protocol projection
```

Apply `../coding-standards/SKILL.md` for TypeScript contracts, parsing, errors, side effects, and tests. When implementation shape is unclear, consult [EXAMPLES.md](EXAMPLES.md) for Hono, WorkerEntrypoint, adapter, and refactor templates.

## Ownership

- **Entrypoint adapter:** parses the external request/event, establishes invocation context, constructs dependencies, invokes a service, and projects its result.
- **Binding adapter:** implements an application-owned port using KV, R2, D1, Durable Objects, Queues, service bindings, Workflows, or another external capability.
- **Application service:** owns one use case's sequencing, fallback, retry, and best-effort policy.
- **Domain module:** owns pure values and invariants.
- **Port:** names exactly the capability a consumer needs; it does not mirror a Cloudflare API.

Raw platform values may exist only in composition roots and binding adapters. A binding adapter accepts the smallest platform capability, not all of `Env`.

## 1. Map the boundary

Inspect repository instructions and the affected:

- Hono app factories, middleware order, route registration, and context types;
- Worker, WorkerEntrypoint, Durable Object, Workflow, queue, and scheduled entrypoints;
- `Env` declarations and every use of the relevant binding;
- tracer creation, correlation, error reporting, and detached-work ownership;
- existing services, adapters, ports, tests, and architecture checks.

Trace each affected behavior from entrypoint to side effect and caller-visible result. For refactors, record current error, retry, fallback, serialization, and tracing behavior before moving it.

**Completion criterion:** Every affected entrypoint, binding consumer, behavior, lifecycle, side effect, failure policy, and existing test seam is accounted for.

## 2. Design application-owned dependencies

Define contracts from consumer needs:

```ts
/** Persistence capability required by document application services. */
export interface DocumentStore {
  /** Find one document by its domain ID. */
  find(id: DocumentId): Promise<Document | null>;
  /** Persist one valid document. */
  save(document: Document): Promise<void>;
}

/** Exact dependencies of the publish-document use case. */
export type PublishDocumentDependencies = Readonly<{
  documents: DocumentStore;
  clock: Clock;
  tracer: Tracer;
}>;
```

Rules:

- Use domain inputs and parsed outputs, not raw keys, strings, request objects, or binding options.
- Expose only operations required by real callers.
- Keep each service's dependency object exact; never create a shared mega-bag or rename `Env` to `Dependencies`.
- Put platform serialization, keyspaces, pagination tokens, TTLs, metadata, and output parsing in the binding adapter.
- Let the application service own policy. The adapter translates failures precisely enough for the service to distinguish recoverable conditions from corruption and defects.
- Inject `Tracer` into services and adapters that create spans; do not add it to every method signature.
- Add an application-owned factory only when scope is genuinely dynamic after composition, such as account-bound construction after authentication. The factory must not expose `Env` or raw bindings.

Choose lifetimes explicitly:

- Reuse immutable adapters and services when their bindings and tracer are safe across concurrent invocations.
- Construct per invocation when they retain request-scoped runtime objects or mutable invocation state.
- Hand detached work to an explicit owner such as a narrow background-task port; do not leak `ExecutionContext` inward.

**Completion criterion:** Every inner signature uses application/domain types; each operation and factory has a current caller; and dependency, tracer, and side-effect lifetimes have explicit owners.

## 3. Build or refactor

### New service branch

1. Implement the application service against its ports without importing Hono or Cloudflare runtime types.
2. Implement one binding adapter per external role. Give technology-specific implementations explicit names, such as `WorkersKvDocumentStore`.
3. Keep protocol concerns in the HTTP, RPC, queue, Workflow, or scheduled adapter.
4. Compose the service at every entrypoint that serves the use case.

### Existing code branch

1. Preserve caller-visible behavior with tests at the current public seam where evidence is missing.
2. Define the port at the direct consumer from the operations it already uses.
3. Put the existing raw binding behind an adapter before changing policy.
4. Replace the direct consumer's raw dependency with the port.
5. Move adapter construction outward one layer at a time. Intermediate layers may pass the typed port, never both the port and raw binding as a permanent design.
6. Split mixed modules: policy moves to the application service; platform mechanics move to the adapter; protocol mapping stays at the entrypoint.
7. Remove obsolete `Env` parameters, factories, generic wrappers, duplicated parsers/key builders, and compatibility overloads after their final callers move.

Do not broaden the refactor to unrelated bindings merely for symmetry.

**Completion criterion:** New code is fully composed on every serving surface, or every migrated raw binding reaches only its adapter; behavior and policy changes are either absent or explicitly requested and tested.

## 4. Compose every runtime surface

At each composition root, in order:

1. Parse configuration and entrypoint props.
2. Create or obtain the tracer.
3. Establish correlation before invoking traced work.
4. Wrap raw bindings in adapters, injecting the tracer where needed.
5. Assemble exact service dependencies.
6. Invoke the service through a thin protocol adapter.
7. Map results and safe errors to the external contract.

For Hono:

- Prefer `createApp(dependencies)` and route/middleware factories that close over exact dependencies.
- Inject the tracer used by root tracing middleware instead of creating unrelated tracers deeper in the app.
- If dependencies are invocation-scoped, have the entrypoint supply a narrow request-composition function that closes over raw bindings; invoke it from the earliest owning middleware after correlation is established.
- Store only exact typed capabilities in Hono variables. Neither composition middleware nor route modules reach through `context.env` for raw bindings.

For WorkerEntrypoint, Durable Objects, Workflows, queues, and scheduled handlers, treat each runtime constructor or handler as its own composition root. Do not assume one surface's dependency graph or lifecycle fits another.

**Completion criterion:** Every serving surface establishes tracing and constructs the complete dependency graph; no inner module acquires runtime resources or reads a binding name.

## 5. Verify the seam

Verify through production seams:

- application-service behavior with small recording fakes implementing real ports;
- binding-adapter serialization, parsing, and failures against the representative local Cloudflare runtime;
- entrypoint composition and external result/error projection;
- span names, correlation, safe attributes, and detached-work ownership;
- type checking, focused tests, architecture checks, and repository-required validation.

Search for leakage using the project's binding names and runtime types, for example:

```bash
rg 'Env|KVNamespace|R2Bucket|D1Database|DurableObjectNamespace|ExecutionContext' src
```

Classify every match: composition root, binding adapter, unavoidable framework declaration, or violation. Also search for direct `context.env` and binding-name access in route, service, domain, and capability modules.

**Completion criterion:** Every raw platform reference is classified and permitted; every changed port, adapter, service, entrypoint, failure path, and lifecycle has evidence; and no application module imports or receives Cloudflare runtime types.
