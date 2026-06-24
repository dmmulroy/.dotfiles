# Vocabulary

Use these terms when designing, reviewing, and explaining code. They encode the user's preferred engineering idioms.

## Failure and observability

**Expected Failure** — normal-operation failure visible in the return type: domain, parsing, authorization, integration, I/O, persistence, workflow, etc. Avoid calling it a recoverable exception.

**Unrecoverable Defect** — programmer error or catastrophic condition where continuing is invalid: violated invariant, impossible branch, startup misconfiguration, or temporary unimplemented path.

**Custom Error** — typed/tagged Expected Failure with stable tag, useful message, structured context, safe telemetry fields, and optional `cause: unknown`.

**Precise Error Union** — explicit narrow set of Expected Failures callers can handle semantically. Broad app-level unions belong near entrypoints, orchestration, rendering, and logging.

**Not Found Failure** — typed Expected Failure for required get/find/read absence. Optional lookup semantics should be explicit in the operation name/contract.

**Unknown Catch Cause** — caught thrown value treated as `unknown`; JavaScript can throw anything.

**Cancellation Classifier** — seam logic that recognizes cancellation/interruption before converting unknown failures into ordinary Expected Failures.

**Redacted Value** — wrapper for secrets that prevents accidental logging/inspection/serialization. Wrap at the seam and unwrap only where raw value is needed.

**Safe Error Summary** — telemetry/panic summary built from stable tags, kinds, operation names, type names, or explicitly safe fields; not arbitrary `JSON.stringify`.

## Seams and data modeling

**Parse, Don't Validate** — convert unknown or less-structured input into a refined/domain value and use that value.

**Unknown Seam Input** — untrusted or less-structured input represented as `unknown` until a parser/smart constructor establishes a precise type.

**Serialized Data Trust Cast** — direct cast from decoded serialized data to an application/domain type, e.g. `JSON.parse(text) as CreateUserInput`; avoid it.

**Seam Parsing Evasion** — trusted code repeatedly accepting/downcasting/re-guarding `unknown` instead of parsing once at the outer seam.

**Schema Parser** — seam parser built with the project's established schema library to turn unknown input into refined/domain values and typed custom errors.

**Branded Type** — nominal type distinguishing a parsed domain value from its primitive representation, constructed only through parsers/smart constructors.

**Value Class** — immutable domain value class constructed only through parsers/smart constructors, with cohesive methods and no hidden I/O/dependencies.

**Correct by Construction** — APIs and types make invalid states impossible or difficult to construct rather than relying on caller memory.

**State Machine** — tagged-union or value-class lifecycle model where each state carries only legal fields and transitions.

**Boolean Blindness** — loss of meaning from raw booleans used for modes, policies, or lifecycle distinctions.

**Discriminated Union** — tagged union or string-literal union for finite variants and lifecycle states. Prefer over TypeScript `enum` for internal/domain modeling.

**Tag Field** — discriminant property for internal/domain tagged unions, preferably `_tag` unless another field is real domain vocabulary.

**Exhaustiveness Helper** — helper such as `casesHandled(unexpectedCase: never): never` for compile-time exhaustive handling and runtime impossible-branch defects.

**Protocol Projection** — named conversion from domain/application value to HTTP/RPC/queue/public DTO, owned by the protocol adapter.

**Persistence Projection** — conversion between domain/application values and storage records/rows, owned by the persistence adapter.

**Persistence Seam Parser** — parser at the storage seam that treats rows/DTOs as less-structured input and reconstructs domain/application values.

## Modules and architecture

**Adoption Rule** — prefer these standards for new code while respecting existing architecture, error handling, observability, and framework conventions; avoid broad migrations unless requested.

**Project Convention Audit** — inspection before adding libraries or patterns: errors, schemas, testing, dependency injection, observability, adapters, and module layout.

**Module** — anything with an interface and implementation: function, class, package, adapter, domain module, application capability, or tier-spanning slice.

**Interface** — everything a caller must know to use a module correctly: type signature, invariants, ordering constraints, error modes, configuration, performance, cancellation, idempotency, and observability effects.

**Implementation** — code behind a module's interface. Use adapter when the seam role is the point.

**Depth** — leverage at the interface: behavior a caller/test can exercise per unit of interface they must learn.

**Deep Module** — cohesive module whose low-burden interface hides meaningful behavior, invariants, ordering constraints, and implementation complexity.

**Shallow Abstraction** — wrapper/interface nearly as complex as what it hides; often pass-through service, repository-per-table, or interface-per-class habit.

**Seam** — place where a module's interface lives and behavior can vary without editing callers. Use seam for architecture, trust crossings, protocol crossings, serialization crossings, runtime hops, framework edges, persistence edges, and test substitutes.

**Adapter** — concrete code that sits at a seam and satisfies an interface.

**Leverage** — what callers get from depth: more capability per unit of interface they learn.

**Locality** — what maintainers get from depth: change, bugs, knowledge, and verification concentrate behind one interface.

**Interface Is the Test Surface** — callers and tests should cross the same seam; if tests must reach past the interface, the module shape is suspect.

**Domain Module** — OCaml-style module centered on a primary domain type or related type family, exposing parsers, constructors, combinators, predicates, interpreters, arbitraries, and formatting helpers.

**Functional Core** — pure entrypoint-agnostic center containing domain logic, parsers, state transitions, combinators, and decisions.

**Imperative Shell** — outer layer that parses input, sequences effects, calls the core, classifies external failures, and handles I/O/persistence/HTTP/queues/telemetry/time/randomness.

**Constructor Injection** — preferred non-Effect dependency style: dependencies accepted by a class constructor through narrow interfaces.

**Effect Service** — preferred Effect dependency style: Services/Tags/Layers rather than constructor injection or dependency bags.

**Narrow Dependency Interface** — dependency type stating only the behavior a module uses, while wider concrete adapters satisfy it structurally.

**Adapter Reuse Audit** — search before creating a new adapter/service: reuse as-is, extend if cohesive, or create new only when reuse/extension would be bad coupling.

## Async and workflows

**Cancellation Propagation** — accepting caller-owned cancellation and passing it through downstream I/O/timer/retry/subprocess/workflow/resource/long-running operations.

**Cancellable Options** — final options object for async APIs needing cancellation, usually `{ readonly signal?: AbortSignal }`.

**Floating Promise** — promise not awaited, returned, collected into concurrency primitive, or handed to explicit detached-work abstraction.

**Detached Work** — intentional async work that may outlive the immediate call path and has owner, lifetime, cancellation, rejection handling, and observability.

**Bounded Concurrency** — concurrent execution with explicit limit chosen from a real bottleneck.

**Retry-Safe Command** — mutating command/route/job/handler/step whose repeated execution after retry/redelivery/crash avoids duplicate or contradictory side effects.

**Durable Workflow** — reliable multi-step process model for retry, compensation, idempotency, resumability, timers, human approval, cross-service coordination, or multiple transaction seams.

## Testing

**Behavior Test** — asserts observable input/output behavior through a module's interface rather than implementation details.

**Real Seam Test** — replaces behavior only through an intentional seam: constructor-injected interface, Effect service/layer, local DB, in-memory adapter, fake external adapter.

**Property Test** — verifies a general property across generated inputs, useful for parsers, smart constructors, state machines, serialization roundtrips, normalization, and lawful combinators.

## TypeScript language idioms

**Type Escape Hatch** — isolated `any` or cast where TypeScript cannot express the invariant; requires precise interface, local scope, and `SAFETY:` comment.

**Safety Comment** — Rust-like comment beside non-`as const` casts or rare `any`, explaining why the operation is sound.

**Exported Symbol JSDoc** — standard JSDoc on directly exported functions/classes/constants/types and public methods of exported classes.

**Nullish Default** — default using `??` so only `null`/`undefined` are absent.

**Falsy Filter** — `filter(Boolean)` style filtering that accidentally removes all falsy values; avoid.

**Parsed Destructuring** — destructuring only after shape is parsed/refined/precise.

**Explicit Shape Construction** — build desired object shapes directly or through named projections instead of subtracting with `delete`.

**Thenable Trap** — callable `then` on a normal object/interface/class causing accidental PromiseLike behavior.

## Cloudflare vocabulary

**Cloudflare Composition Seam** — outer Cloudflare-owned location translating raw `Env`/ctx/bindings into app-level dependencies.

**Cloudflare RPC Context Seam** — runtime hop where request-local ambient scope must not be assumed to propagate; pass typed metadata explicitly.

**Cloudflare Serialization Seam** — workerd seam requiring structured-clone/JSON-serializable values or explicit codecs/projections.

**Agent-backed Durable Object** — stateful Cloudflare unit implemented with Agents SDK `Agent`, default for new DO-like units unless a lower-level reason exists.

**Canonical Stateful Object Name** — normalized domain-specific instance name used to address a DO/Agent.

**Stateful Object Heartbeat** — low-frequency scheduled maintenance method for cleanup, migrations, repairs, health metadata, and operational checks.

**Cloudflare Control Plane** — metadata/lifecycle/routing plane for sharded/multi-tenant systems, kept off high-volume data paths when possible.

**Cloudflare Data Plane** — sharded stateful resource-operation plane reached directly on hot paths after routing metadata is known.
