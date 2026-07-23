# Codebase audit branch

Use this branch for an entire codebase, package, feature slice, or diff.

## 1. Build the inventory

Enumerate source and test files, then find:

- every `Context.Service`, tag, `Layer`, `make`, `provide`, and `provideService`;
- service-shaped interfaces/classes with effectful methods;
- parameter, property, constructor, callback, options-bag, and Layer injection;
- direct access to time, randomness, cryptography, IDs, configuration, HTTP, persistence, registries, renderers, filesystem, runtime bindings, and mutable globals;
- test fakes, in-memory implementations, module mocks, and hand-built `Layer.succeed` values.

For each service record:

| Field | Question |
| --- | --- |
| Owner | Which module owns the capability's meaning? |
| Contract | Where are the interface and tag? |
| Constructor | Does `make` yield every dependency? |
| Production | Which module owns the concrete `layer`? |
| Tests | Is there an honest reusable test/local implementation? |
| Consumers | Are capabilities yielded or drilled? |
| Requirements | Do Effect requirements propagate to the composition root? |
| Verdict | Keep, deepen, relocate, merge, remove, or create? |

**Complete when:** every discovered service/tag and Layer appears exactly once in the inventory.

## 2. Trace requirements

For each service and service-shaped constructor:

1. Trace one public operation to every effect.
2. Mark where each dependency first appears.
3. Mark where it is yielded, passed as a value, captured from a property, or concretely provided.
4. Verify the module providing a Layer truthfully owns that implementation choice.
5. Check pinned source for framework/runtime services before recommending a wrapper.

Pay special attention to:

- a service yielded once and then passed through several functions;
- a `Layer` accepted as a function argument;
- dependency bags and constructors in Effect-native code;
- plain service values passed into handler builders;
- local `Effect.provide` calls that erase requirements below the composition root;
- global Clock, crypto, random, environment, fetch, database, registry, or binding access;
- a service contract, `make`, production Layer, and test Layer scattered across unrelated modules.

**Complete when:** every capability in the inventory has an unbroken path from use to the composition root or a documented value boundary.

## 3. Classify each candidate

Apply the service test from `SKILL.md`, then classify dependencies:

- **built-in Effect capability** — yield it directly;
- **application-owned authority** — define the narrow port beside the operation;
- **technology adapter** — implement the port in the adapter module;
- **request/domain value** — keep it explicit;
- **framework boundary** — isolate its required constructor/property API in the adapter or root;
- **pass-through abstraction** — remove or fold into its owner.

Use the deletion test. Confirm an existing module cannot own the behavior before proposing a new one. Prefer merging duplicated capabilities over introducing a generic registry or dependency bag.

**Complete when:** every candidate has one classification and concrete evidence; no finding rests only on stylistic preference.

## 4. Audit test implementations

For each service, inspect how tests replace or control it:

- static complete value → local or colocated `Layer.succeed`;
- reusable state/control → first-class test service and `layerTest`;
- faithful in-memory semantics → `layerMemory`;
- persistence/protocol semantics → real local adapter;
- narrow one-off behavior → fixture local to the test.

Compare the fake's advertised contract with its implementation. A partial fake can remain local, but it cannot be recommended as a general in-memory Layer.

**Complete when:** every production service has an intentional test strategy or an explicit reason no substitute is needed.

## 5. Report only actionable findings

Prioritize by correctness and requirement visibility:

- **P0** — hidden authority, direct unsafe runtime access, broken or duplicated capability, wrong Layer ownership;
- **P1** — repeated dependency drilling, missing dependency-preserving or production Layer, scattered service module;
- **P2** — naming or colocation cleanup that should ride with a nearby refactor.

For each finding include:

1. evidence with file/line or symbol references;
2. why the current shape hides requirements or creates caller burden;
3. the smallest target Effect service module shape, including `layerWithoutDependencies`, assembled `layer`, and any honest reusable test Layer;
4. the composition-root and test impact;
5. what should remain unchanged.

Include a final “keep” section covering explicit values, pure functions, framework boundaries, correctly separated ports/adapters, and request-scoped services.

**Complete when:** every inventory row has a disposition, every recommendation names its owner and target shape, and speculative abstractions have been removed from the report.
