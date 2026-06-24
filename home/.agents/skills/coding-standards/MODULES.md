# Module Design

Use this file when designing or reviewing domain modules, application/service modules, adapters, dependency seams, or abstraction seams.

The taste here is TypeScript with a typed-functional bias: OCaml-style modules around types, Rust-like explicitness around failure/safety, and pragmatic classes where they buy cohesive dependency ownership.

## Architecture vocabulary

Read `VOCABULARY.md` for canonical definitions of Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality, Deep Module, Shallow Abstraction, and Interface Is the Test Surface. Use those words consistently.

## Design idiom

Prefer code organized around domain concepts and capabilities, not framework shapes, database tables, or generic service layers.

Borrow these instincts:

- **OCaml** — type-centered modules: one primary type or type family, with constructors, parsers, predicates, combinators, interpreters, and formatting kept together.
- **Rust** — invalid states hard to construct; unsafe/type-erasing moves documented with `SAFETY:` comments; explicit result/failure contracts.
- **Typed FP** — parse/refine outward, keep decisions pure, model variants with tagged unions, handle closed sets exhaustively.
- **Pragmatic TypeScript** — classes for cohesive dependency ownership/value semantics; structural typing for narrow dependency interfaces.

## Domain modules

A domain module centers on one primary domain type or tightly related type family. It keeps invariants and operations local instead of scattering helpers.

A good domain module may expose the domain type/value class, parsers, smart constructors, predicates/refinements, combinators, state transitions, interpreters/decision functions, neutral domain projections, formatting helpers, and useful test arbitraries.

Domain modules may be plain exported functions, cohesive classes, or static-style classes. The standard is cohesion, invariant ownership, and caller leverage, not syntax.

Avoid domain modules that become protocol DTO owners. HTTP/RPC/queue/public JSON shapes belong to protocol adapters. Storage columns and row shapes belong to persistence adapters.

## Value classes

Use value classes when a class gives cohesive representation of a domain value. They should be created only through parsers/smart constructors, make invalid instances unconstructable where practical, expose immutable state, keep methods cohesive, avoid hidden dependencies/I/O, avoid inheritance for domain behavior, and use explicit projections when crossing seams.

## Application/service modules

Application modules own real capabilities. They coordinate domain modules, persistence, external calls, authorization, workflows, telemetry, time/randomness, and retries around a meaningful application responsibility.

Good names describe capability: `PasswordReset`, `Billing`, `Invitations`, `SubscriptionLifecycle`, `DocumentSessions`, `TenantWorkspaces`. Avoid vague `Manager`, `Processor`, `Helper`, or generic `UserService` unless established by the project.

Prefer classes with constructor injection when a module has dependencies, stateful resources, configuration, or multiple cohesive operations. Use plain functions for pure domain behavior or small dependency-free operations. In Effect codebases, use Services/Tags/Layers instead.

No arbitrary method limit exists. Split when methods are unrelated, change for different reasons, require unrelated dependencies, or create an accidental grab bag.

## Deep modules and abstraction depth

A deep module hides substantial behavior, invariants, ordering constraints, or implementation complexity behind a cohesive low-burden interface. Low-burden does not mean tiny.

Use the deletion test:

- If deleting the module makes complexity disappear, it was probably pass-through waste.
- If deleting it spreads complexity across callers, it was probably earning its seam.

Avoid shallow abstractions that merely forward calls, mirror tables, rename another interface, or expose implementation steps. A pass-through wrapper is justified only when it forms a real translation seam, protects an invariant, stabilizes a caller-facing contract, or isolates a seam.

The interface is the test surface: callers and tests should cross the same seam. If tests must reach past the interface to verify real behavior, the module shape is suspect.

Do not create seams for hypothetical future substitution. A seam is justified when behavior actually varies, a seam requires translation, tests use a legitimate substitute through the same interface, or caller burden drops materially.

For consequential interfaces, design it twice: sketch two or three materially different interface shapes, compare by depth, leverage, locality, seam placement, and test surface, then recommend one strongly. Use parallel agents when independent attempts would expose better alternatives.

## Dependency categories for deepening

1. **In-process** — pure computation or in-memory state. Always deepenable; merge behind one interface and test directly.
2. **Local-substitutable** — dependencies with faithful local stand-ins such as local databases, in-memory filesystems, or fake adapters. Keep the seam internal when possible and test with the stand-in.
3. **Remote but owned** — internal services or workers across a network/runtime seam. Define a narrow interface, keep logic in the deep module, and use production plus in-memory/test adapters.
4. **True external** — third-party services or platforms. Inject a narrow interface and test with a fake/mock adapter.

One adapter usually means a hypothetical seam. Two adapters usually means a real seam. Production plus a legitimate test adapter can justify the seam; a single pass-through adapter usually cannot.

## Dependency interfaces

Depend on the smallest meaningful behavior the module uses. Let concrete adapters be wider. Because TypeScript is structural, a concrete adapter with many methods can satisfy a narrow local dependency type.

Prefer local dependency types named for the consuming capability, e.g. `UsersForPasswordReset`.

Avoid depending on a whole repository when one operation is needed, one-method interface confetti by habit, ad hoc `deps` bags, hidden globals, and module-level mutable dependency state.

## Adapters and persistence

Adapters translate between application/domain contracts and external systems. They expose application-facing capabilities in domain terms, return parsed domain/application values, and classify expected failures into typed values.

Before creating a new adapter/service, do an adapter reuse audit:

1. Reuse an existing adapter through a narrow dependency type if it already provides the behavior.
2. Extend an existing adapter if the new method is cohesive and changes for the same reason.
3. Create a new adapter only when reuse/extension would create bad coupling or an accidental interface.

A meaningful new adapter/service after the audit should usually have an ADR recording what was checked and why a separate capability is justified. Tiny test adapters, obvious in-memory substitutes, and trivial framework glue do not need ADRs.

Avoid repository-per-table by default. Repository-like adapters are fine when they represent a cohesive domain persistence capability.

## Shared helpers and prelude

Domain- or application-specific behavior stays with the module that gives it meaning. Do not hide domain policy in `utils`, `helpers`, `common`, `misc`, or `prelude`.

Extract shared helpers only when small, stable, genuinely domain-independent, and reused. `prelude.ts` is for tiny ubiquitous generic helpers/types/capabilities such as `casesHandled`, `shouldNeverHappen`, `notYetImplemented`, `Redacted`, common `Result` helpers, `Clock`, `Random`, and `IdGenerator`.

## Review checks

- What concept, type, capability, or policy does this module own?
- Does the interface reduce caller burden, increase leverage, and improve locality?
- Are invariants owned by constructors/transitions/parsers, or scattered across callers?
- Are domain operations colocated with the domain type/family they explain?
- Is an application/service module named for a real capability?
- Are dependencies explicit, narrow, role-shaped, and classified by the seam they cross?
- Did the change search for existing adapters/services before adding another?
- Are protocol and persistence DTOs kept at their adapters?
- Is the interface the natural test surface?
- Would deleting the abstraction remove complexity or spread it to callers?
