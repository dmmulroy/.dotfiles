# Effect and Alchemy composition

Use this reference when changing an Alchemy Worker, Durable Object, Workflow, binding-backed service, or other two-phase Effectful Constructor.

Also apply [`effect-services.md`](effect-services.md) for service and Layer ownership, [`configuration-and-resources.md`](configuration-and-resources.md) for lifetimes, and [`modules-services-and-adapters.md`](modules-services-and-adapters.md) for composition-root boundaries.

## Verify the pinned Alchemy model

Read the pinned Alchemy documentation and source before choosing a composition shape. In particular, verify the Effectful Constructor, init/runtime phases, Layers, bindings, and the relevant runtime class. Prefer the repository's vendored Alchemy checkout over remembered APIs.

## Compose through the outer Effect

Alchemy Effectful Constructors have two phases:

- the outer init Effect runs during planning and again at runtime cold start;
- the returned inner Effect or handlers run only in the deployed runtime.

Provide infrastructure-backed application Layers to the outer Effect, then yield their service tags during outer initialization. Close over those stable service values for the returned runtime handlers. Prefer this Layer composition:

```ts
Effect.gen(function* () {
  const dependency = yield* ApplicationDependency;

  return {
    fetch: requestHandler(dependency),
  };
}).pipe(Effect.provide(applicationDependencyLayer));
```

Do not bypass an existing Layer by yielding its exported `makeApplicationDependency` construction Effect directly from the composition root. The Layer is the implementation choice and preserves dependency wiring, acquisition semantics, memoization, and substitution.

When an inner runtime Layer needs an outer-initialized service, bridge the captured value with `Layer.succeed`:

```ts
const dependency = yield* ApplicationDependency;
const handlersLayer = handlersLayerWithoutDependencies.pipe(
  Layer.provide(Layer.succeed(ApplicationDependency, dependency)),
);
```

This value bridge is distinct from providing the infrastructure-backed Layer to the inner runtime Layer. Providing that Layer only inside the returned runtime Effect may incorrectly defer deploy-time binding registration or require init-only Alchemy services where they are unavailable.

## Durable Object state

Alchemy evaluates a Durable Object's outer Effect during planning with mock state. The outer Effect may resolve bindings, service Layers, and the Durable Object state reference, but it must not acquire or use state-backed runtime resources against the mock storage.

Describe state-backed Layers outside when useful, then acquire them only inside the returned runtime Effect. Database migrations, SQL clients, and storage-backed services complete before handlers become available at runtime.

## Completion check

Every changed Alchemy constructor follows the pinned two-phase model; infrastructure-backed application Layers are provided to the outer Effect; stable services are yielded by tag and closed over; no composition root bypasses an existing Layer through its `make` Effect; inner runtime Layers receive captured services through value Layers when necessary; deploy-time bindings remain discoverable during planning; and state-backed resources execute only in the runtime phase.
