# Effect services

Apply [`modules-services-and-adapters.md`](modules-services-and-adapters.md) for ownership and Adapter decisions.

Treat a service as an **authority seam**: a cohesive capability whose requirements propagate through Effect context. The application capability module owns its interface, tag, and expected errors. Each concrete implementation owner keeps its construction and applicable production or reusable test Layers with that implementation.

## Service test

A real service owns at least one meaningful capability:

- authority over persistence, credentials, external I/O, runtime resources, configuration, time, randomness, or lifecycle;
- cohesive effect sequencing or policy reused across entrypoints;
- state or behavior with real production and test/runtime variation.

Prefer an existing Effect service such as `Clock`, `Crypto`, `Random`, `Config`, `HttpClient`, `FileSystem`, or `Path` before defining an application service.

Keep these as values or pure modules:

- parsed domain inputs and per-call request data;
- deterministic calculations, parsers, and constructors;
- options that select policy for one call;
- framework values confined to their Adapter;
- wrappers that only rename or forward another service.

A service seam represents real ownership or variability in production. When injection is the only need, keep the injected data as a value or local fixture. Record the production evidence for the service-or-value decision and the rejected alternative.

## Authority and requirements

The application module identified by [`modules-services-and-adapters.md`](modules-services-and-adapters.md) owns the capability's interface and tag. A technology Adapter owns its concrete `make` and Layer only after translation, mechanics, reuse, or real implementation variation earns that seam. The composition root selects top-level concrete Layers; a service module assembles only dependency implementations it truthfully owns. Reusable policy remains in its owning application service.

Yield stable runtime capabilities and implementation dependencies while building the Layer and close over them in service methods. Yield request-, fiber-, or operation-scoped context inside the method that uses it. Let requirements propagate until the module that truthfully chooses an implementation provides them.

Authorization evidence, scoped handles, and other operation-specific capability values remain explicit inputs when they are part of the request or domain contract. Passing an external library's constructor options remains correct after the owning Adapter has yielded the relevant runtime capability. React props, request values, domain inputs, and framework constructors remain explicit values rather than Effect dependencies.

## Module shape

Follow the project's established equivalent of this shape:

```ts
export interface Interface {
  readonly operation: (input: Input) => Effect.Effect<Output, OperationError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@app/Capability",
) {}

export const make: Effect.Effect<
  Service["Service"],
  never,
  Dependency.Service
> = Effect.gen(function* () {
  const dependency = yield* Dependency.Service

  const operation = Effect.fn("Capability.operation")(function* (input: Input) {
    return yield* dependency.operation(input)
  })

  return Service.of({ operation })
})

export const layerWithoutDependencies = Layer.effect(Service, make)

export const layer = layerWithoutDependencies.pipe(
  Layer.provide([Dependency.layer]),
)
```

`Interface`, `Service`, `make`, `layerWithoutDependencies`, and `layer` are canonical role names within an Effect capability module. The owning module namespace and service tag identify the capability. `layerWithoutDependencies` preserves requirements for composition. `layer` is the ready production assembly and provides the concrete dependency Layers chosen by this module.

Choose the Layer constructor that matches acquisition: `Layer.succeed` for an existing value, `Layer.sync` for lazy synchronous construction, and `Layer.effect` for effectful acquisition. Use `Layer.effectContext` when one acquisition intentionally supplies several tags, especially a production service and its test-control service. Use `Layer.unwrap` when configuration or runtime discovery builds the Layer. Use `Layer.fresh` or `Effect.provide(layer, { local: true })` only when an operation or test requires isolated acquisition. Reserve `Context.Reference` for ambient runtime values with a safe, truthful default.

Keep the interface cohesive and domain-shaped. Inject dependencies as yielded service objects rather than callback functions; a function capability fits only when higher-order behavior is itself the capability.

## Module surface

One valid module surface gives the ES module one canonical namespace while keeping file-local role names:

```ts
export interface Interface {
  readonly getUserById: (id: UserId) => Effect.Effect<User, NotFound | PersistenceError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@app/UserStore",
) {}

export * as UserStore from "./user-store.js"
```

Consumers import the owning leaf directly and yield `UserStore.Service`. A folder or package entrypoint may relay the leaf's established identity with `export { UserStore } from "./user-store.js"`. Use this self-export style only where the runtime and toolchain support it; otherwise use ordinary named exports or a separate public entrypoint. Keep schemas, row codecs, helpers, and implementation details private.

## Runtime wiring

- Use `Layer.provide` when the current module truthfully chooses and hides an implementation dependency.
- Use `Layer.provideMerge` only when downstream consumers should still receive that dependency.
- Use `Layer.mergeAll` for independent exposed Layers.
- Keep runtime Layer values flat, named, and topologically ordered.
- Provide dependencies at their owning boundaries so application authority and lifecycle requirements remain visible.

A Layer that owns a stream, listener, worker, subscription, or long-lived fiber forks it into the Layer scope so acquisition can complete. Read [`effect-streams.md`](effect-streams.md) for the lifecycle pattern.

## Named operation boundaries

Use `Effect.fn("Capability.operation")` for public and non-trivial internal service methods. Reserve `Effect.fnUntraced` for internal helpers whose stack-frame and span metadata are intentionally unnecessary. Keep the generator focused on the operation and use one or two whole-function transforms for concerns that need the complete effect and original arguments, such as error classification, logging annotations, spans, bounded retry, timeout, cleanup, or result mapping. Each transform receives `(effect, ...originalArgs)`:

```ts
const readAttachment = Effect.fn("Attachment.read")(
  function* (ref: AttachmentRef) {
    return yield* client.read(ref)
  },
  (effect, ref) =>
    effect.pipe(
      attachmentError("Attachment.read", { attachmentId: ref.id }),
    ),
)
```

For operation-labelled boundary errors, prefer a shared curried `mapError` helper over repeated wrappers:

```ts
const persistenceError = operationError(PersistenceError.make)

const row = yield* query.pipe(
  persistenceError("UserStore.findById"),
)
```

Name the helper for the error it creates. Pair structured error fields with `Effect.fn` boundaries and spans for observability.

## Test Layers

When tests or reusable test implementations change, read [`effect-testing.md`](effect-testing.md) for static implementations, test-control services, shared backing objects, and focused local mocks.

Tests cross the same service interface as production callers. Use `layerMemory` for a faithful in-memory implementation of the observable contract. Prefer a real local substitute when persistence, transactions, serialization, or protocol behavior matters. Keep a narrow one-off fake in its test when promoting it would create production surface solely for that test.

Name reusable implementations for their observable behavior, such as `InMemoryCache`, `RecordingEmailSender`, or `TestClock`.

## Completion check

Complete when:

- the service-or-value decision cites production ownership or variability and the rejected alternative;
- every applicable interface, tag, construction effect, expected error, method, production Layer, and reusable test implementation has exactly one owner;
- stable runtime capabilities and implementation dependencies are captured during Layer construction, operation-specific capability values remain explicit inputs, scoped context is yielded where used, and requirements remain visible until the module that selects an implementation provides them;
- each Layer constructor matches acquisition, each provided dependency is an implementation the provider truthfully owns, and long-lived work is scoped;
- public and non-trivial service operations have named boundaries, with whole-operation concerns applied at those boundaries;
- the module surface exposes only service API intended for callers and uses canonical role names consistently; and
- the test strategy exercises the production interface at the fidelity required by the observable contract.
