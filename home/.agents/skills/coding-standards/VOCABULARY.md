# Vocabulary

Use these exact terms in explanations, reviews, and code-facing design notes when the concept applies. Topic files may define only topic-local terms near their rules.

## Failure language

**Expected Failure** — A normal-operation failure that callers may need to handle: domain rejection, parse failure, authorization denial, dependency failure, I/O failure, persistence failure, workflow failure, or cancellation outcome. Expected failures are represented as typed values.

**Unrecoverable Defect** — A programmer error or catastrophic condition where continuing is invalid: impossible branch, violated internal invariant, startup misconfiguration, or temporary unimplemented path. Defects may throw, panic, or crash.

**Custom Error** — A typed, tagged error value for an Expected Failure. It has a stable tag, useful message, structured safe context, and may retain an `unknown` cause.

**Precise Error Union** — The explicit set of Expected Failures a function can return, kept narrow enough that callers can handle cases semantically.


## Boundary language

**Unknown Boundary Input** — Untrusted or less-structured input represented as `unknown` or a boundary DTO until a parser refines it: HTTP bodies, JSON, queue payloads, storage rows, env vars, RPC payloads, third-party responses.

**Schema Parser** — A boundary parser built with the repo's schema library that turns unknown input into refined/domain types and typed parse failures.

**Persistence Boundary Parser** — A parser at the storage seam that treats database rows and storage DTOs as less-structured input and reconstructs domain values before service logic sees them.

**Protocol Projection** — A named conversion from a domain/service value into an HTTP, RPC, queue, or public API DTO owned by that protocol External Adapter Module.

**Persistence Projection** — A named conversion between domain/service values and storage rows/records owned by the persistence External Adapter Module.

## Domain language

**Domain Module** — A TypeScript module centered on one primary domain type or tightly related type family. It exposes parsers, smart constructors, combinators, predicates, transitions, projections, arbitraries, and formatting helpers for that concept.

**Branded Type** — A nominal TypeScript type that distinguishes a parsed domain value from its primitive representation. It is created through a parser or smart constructor.

**Value Class** — A cohesive class representation of a domain value. Instances are immutable and created only through parsers or smart constructors.

**State Machine** — A tagged-union or value-class lifecycle model where each state carries only fields legal for that state and exposes legal transitions.

**Correct by Construction** — Design that makes invalid states impossible or difficult to construct rather than relying on caller discipline.

## Module language

**Module** — Anything with an interface and implementation: function, class, file, package, service slice, adapter, or stateful object.

**Interface** — Everything callers must know to use a module correctly: type signatures, invariants, ordering constraints, error modes, configuration, performance, and side effects.

**Implementation** — What sits behind the interface.

**Seam** — A place where behavior can vary without editing the caller at that point. The seam is where the interface lives.

**Service Module** — A dependency-bearing module in the **Imperative Shell** that coordinates a cohesive use case, workflow, or service capability. It composes **Domain Modules** and interfaces implemented by **External Adapter Modules** through explicit dependencies, sequences effects, owns use-case policy, classifies dependency failures, and returns typed outcomes. It receives parsed service/domain values, not raw framework, protocol, persistence, or third-party shapes. Pure domain behavior remains in Domain Modules even when other literature might call it a domain service.

**Adapter** — A concrete implementation that satisfies an interface at a seam, usually translating to a framework, platform, database, external service, or test substitute.

**External Adapter Module** — A specialized **Adapter** at an external boundary. It includes inbound adapters such as HTTP/RPC/queue handlers and outbound adapters such as persistence, SDK, platform, and third-party integrations. Service Modules depend on narrow behavior-shaped interfaces; External Adapter Modules implement those interfaces at composition seams.

**Deep Module** — A module with high leverage: a cohesive, low-burden interface hiding substantial behavior, invariants, and incidental steps.

**Accidental Interface** — A leaky or wide interface that forces callers to know unrelated methods, raw DTOs, nullable state bags, ordering constraints, hidden side effects, or implementation details.

**Functional Core** — The pure, entrypoint-agnostic center: domain logic, parsers, transitions, combinators, and decisions. It avoids I/O, hidden dependencies, ambient time/randomness, framework concerns, and thrown expected failures.

**Imperative Shell** — The outer layer that parses inputs, sequences effects, calls the functional core, classifies dependency failures, and handles I/O, persistence, HTTP, queues, telemetry, time, and randomness.

## Runtime and observability language

**Structured Tracing** — End-to-end correlated telemetry across requests, jobs, workflows, modules, External Adapter Modules, and external calls using safe fields such as domain IDs, operation names, dependency names, state tags, retry paths, and typed error tags.

**Safe Error Summary** — A telemetry or panic summary built from stable tags, kinds, operation names, type names, or explicitly safe fields. It does not serialize arbitrary values.

**Redacted Value** — A wrapper for sensitive values that prevents accidental logging, inspection, and JSON serialization. Use it for tokens, API keys, passwords, raw credentials, and secrets.

**Caller-Owned Cancellation Lifetime** — A cancellation design where lower-level modules accept and propagate the caller's `AbortSignal` instead of inventing hidden lifetimes.

**Detached Work** — Intentional async work that can outlive the current call path and is handed to a runtime/project mechanism that owns lifetime, cancellation, rejection handling, and observability.

## Adoption language

**Adoption Rule** — In established codebases, prefer these standards for new/changed paths while respecting compatible local architecture. Improve the local design without forcing broad migrations unless explicitly requested.

**Project Convention Audit** — The required inspection before adding libraries or patterns: errors, schemas, testing, dependency injection, observability, External Adapter Modules, Service Modules, and module layout.

**Compatibility Glue** — Small temporary adapter/config/integration code used only because current tooling or surrounding architecture cannot express the preferred pattern yet. Keep it isolated and removable.
