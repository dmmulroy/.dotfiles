---
name: effect-service-design
description: Design Effect services. Use when designing a new Effect service module or auditing an existing codebase for service, Layer, and composition improvements.
---

# Effect Service Design

Treat a service as an **authority seam**: a cohesive capability whose requirements should propagate through Effect context. An **Effect service module** owns the service contract, construction, production Layer, and any honest reusable test implementation that belong to the same capability.

## 1. Establish the local rules

Read the nearest `AGENTS.md`, architecture docs, coding standards, project Effect guidance, pinned Effect version/source, and relevant vendored examples. Prefer current project-compatible patterns over remembered APIs.

**Complete when:** the governing files and pinned source examples have been read and recorded for use in later decisions.

## 2. Select the branch

- **Design branch:** for a new service or a focused redesign, bound the capability, trace one caller-visible operation to every effect, then continue below.
- **Audit branch:** for a codebase, package, feature slice, or diff, read and follow [`references/AUDIT.md`](references/AUDIT.md), applying the rules below to every candidate it finds.

**Complete when:** one branch is selected, its scope is bounded, and the caller-visible operations in scope are named.

## 3. Apply the service test

A real service owns at least one meaningful capability:

- authority over persistence, credentials, external I/O, runtime resources, configuration, time, randomness, or lifecycle;
- cohesive effect sequencing or policy reused across entrypoints;
- state or behavior with real production and test/runtime variation;
- enough implementation complexity that deleting the module would spread complexity into callers.

Prefer an existing Effect service such as `Clock`, `Crypto`, `Random`, `Config`, `HttpClient`, `FileSystem`, or `Path` before defining an application service.

Keep these as values or pure modules:

- parsed domain inputs and per-call request data;
- deterministic calculations, projections, parsers, and constructors;
- options that select policy for one call;
- framework values confined to their adapter;
- wrappers that only rename or forward another service.

A test-only desire to inject a value is not enough. The seam must represent real ownership or variability in production.

**Complete when:** the deletion test and the existing-service/adapter audit both support either “service” or “value,” and the rejected alternative is stated plainly.

## 4. Place the authority seam

- Domain modules stay pure.
- Application services own operation policy and application-owned ports.
- A port's tag and interface live beside the application operation that needs them.
- A concrete adapter owns its technology-specific `make` and `layer`; it need not share a file with the application-owned port.
- Composition roots select and provide concrete Layers. They do not become reusable policy modules.
- Runtime bindings are yielded in the composition root or owning adapter, then hidden behind application/domain types.

Yield stable dependencies while building the Layer and close over them in service methods. Yield request-, fiber-, or operation-scoped context inside the method that uses it. Let requirements propagate until the module that truthfully chooses an implementation provides them.

Passing an external library's constructor options remains correct after the owning adapter has yielded the relevant runtime capability. React props, request values, domain inputs, and framework constructors are not Effect dependency injection.

**Complete when:** dependencies point inward, raw technology types stop at adapters, and no inner caller chooses a concrete implementation it does not own.

## 5. Shape the Effect service module

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

export const layerTest = Layer.succeed(
  Service,
  Service.of({
    operation: (_input) => Effect.succeed(testOutput),
  }),
)
```

`layerWithoutDependencies` preserves the service's requirements for composition. `layer` is the ready production assembly and provides the concrete dependency Layers. `layerTest` illustrates a complete static substitute; export it only when that behavior is reusable and honest. Use `layerMemory` instead when an in-memory implementation faithfully preserves the observable contract.

Use `Layer.succeed` for an already-built value, `Layer.sync` for lazy synchronous construction, and `Layer.effect` for effectful acquisition. Preserve an established compatible naming convention when renaming would add churn without clarity.

Keep interfaces narrow and domain-shaped. Use named `Effect.fn` methods, typed expected errors, and yielded dependencies. Add options, methods, services, and combinators only when each hides enough complexity to earn its place.

**Complete when:** the tag, interface, `make`, dependency-preserving Layer, production `layer`, errors, methods, and test strategy have one clear owner, and every exported symbol is required by a caller.

## 6. Choose test Layers honestly

- Use `Layer.succeed` for a complete static implementation.
- Add `layerTest` plus a test-control service when reusable state, failure injection, or observation is part of a real seam.
- Name a Layer `layerMemory` only when it faithfully implements the service's observable contract in memory.
- Prefer a real local substitute when persistence, transactions, serialization, or protocol behavior matters.
- Keep a tiny one-off fake in its test when promoting it would create production surface solely for that test.

Tests cross the same service interface as production callers. When a reusable control service exists, back its production tag and test-control tag with the same object. Partial objects with “unused” methods that die are focused test fixtures, not reusable in-memory adapters.

**Complete when:** each test implementation is complete for its advertised name, tests observe outcomes through the public interface, and no new seam exists only to support mocking.

## 7. Finish the selected branch

- **Design branch:** record the service-or-value decision and its evidence. When implementation is requested, create or refactor the module, update composition roots and tests, and run the repository's required checks.
- **Audit branch:** produce prioritized findings with file/line or symbol evidence, target module shapes, composition and test impact, and explicit “keep” decisions.

**Complete when:** the designed capability has an explicit disposition and validated implementation when requested, or every audit inventory row has a disposition; validation passes or every failure is reported.
