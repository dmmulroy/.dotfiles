# Modules, services, and Adapters

## Roles

**Domain Module**, **Application Service Module**, **Adapter Module**, and **composition root** name responsibilities, not required folders, suffixes, or TypeScript constructs.

Classify code by what would make it change:

- Business meaning, invariant, calculation, or legal state transition: **Domain Module**.
- Application policy, authorization, or effect sequence: **Application Service Module**.
- Protocol, framework, database, runtime, or third-party API: **Adapter Module**.
- Construction or wiring: **composition root**.

The normal flow is:

```txt
external input -> inbound Adapter -> Application Service -> Domain Module
                                           |
                                           +-> application-owned capability
                                           |     -> outbound Adapter -> external system
                                           |
                                           +-> private concrete client -> external system
```

Domain Modules form the functional core. Application Services and Adapters form the imperative shell. An inbound Adapter may call a Domain Module directly when the operation is pure and requires only parsed input.

For each changed operation:

1. Trace it from ingress to every effect and observable result.
2. Put intrinsic meanings, calculations, and transitions in Domain Modules.
3. Put application policy and effect ordering in an Application Service.
4. Choose private concrete clients or outbound Adapters by applying [Adapters and concrete clients](#adapters-and-concrete-clients).
5. Wire concrete clients and Adapters at the composition root.

Apply the deletion test before adding or preserving an abstraction.

## Domain Modules

A Domain Module is a pure, type-driven abstract data type centered on one domain type or tightly related family. Use one for a real domain distinction, invariant, calculation, decision, or lifecycle.

A Domain Module may own its:

- type and supporting types;
- parsers and smart constructors;
- combinators and predicates;
- legal transitions and calculations;
- formatting and domain representations;
- test generators.

It returns refined values, expresses expected failures as precise values, and remains independent of I/O, frameworks, persistence, ambient time, randomness, and mutable global state.

Its inputs and outputs are domain values rather than protocol or persistence records. Pure permission decisions over parsed values may live here; authentication and authorization responsibilities follow the allocation below.

Plain functions, immutable value classes, and static-style classes are all valid. A domain class constructs through parsers or smart constructors, keeps invalid instances unconstructable, exposes immutable state, and remains pure.

## Application Services

An Application Service owns one cohesive application operation or capability. Use one when behavior coordinates authorization, domain decisions, persistence, external calls, transactions, messages, time, IDs, telemetry, or multiple entrypoints.

Design a meaningful service from its explicit interface first. In plain TypeScript, use a service interface and implementation class. When an Effect service, tag, `make`, Layer, or dependency requirement changes, read and apply [`effect-services.md`](effect-services.md). Reserve service interfaces for helpers that own an application capability.

An Application Service:

- accepts and returns application/domain types with precise expected-error unions;
- depends on the smallest cohesive capability services that own the needed behavior;
- receives services, configuration, clocks, randomness, and similar capabilities explicitly;
- owns which effects occur, under what policy, and in what order;
- keeps its public contract independent of framework, ORM, vendor SDK, and runtime types.

Plain TypeScript dependency-bearing classes receive service objects through constructors. Effect code yields stable runtime capabilities and implementation dependencies through context. Authorization evidence, scoped handles, and other operation-specific capability values remain explicit inputs when they are part of the request or domain contract. A callback dependency is appropriate when higher-order behavior itself is the capability.

A service may expose multiple related methods when they share one owner and reason to change. `Service` is an honest name for a broad cohesive capability when a more specific noun would misstate its scope, as with `EmailService` or `UserService`.

Build broader services by composing smaller cohesive capability services. The broader service owns operation-specific policy; the smaller services own reusable mechanisms. For example, an `EmailService` may compose an earned `EmailSender` and expose `sendWelcomeEmail` and `sendPasswordResetEmail`. Start with a private concrete client when extracting the smaller capability would only add forwarding, as described below.

Application Services own policy and effect ordering while delegating substantial domain calculations and reusable mechanisms to their owning modules. Their operation bodies make sequence and decision points visible without accumulating unrelated implementations or introducing pass-through modules.

## Capability and operation names

Name an interface for what the capability is, using ordinary domain or operational vocabulary that stays stable across callers: `UserStore`, `EmailSender`, or an honestly broad `EmailService`. Put specific behavior in operation names such as `findActiveByEmail` or `sendPasswordResetEmail`.

Consumer-qualified capability names such as `UsersForPasswordReset` are prohibited: the consumer belongs at the call site, while the dependency keeps its stable name. Use architecture words such as `Repository`, `Gateway`, `Provider`, `Port`, or `Manager` only when that word is the capability's actual established meaning, not as a generic suffix used to manufacture a noun.

Name an operation so its purpose remains clear at ordinary call sites and definition-site search results. Include domain context that distinguishes the operation; omit words that add no meaning.

Start a meaningful service with its interface. When the interface and ordinary implementation naturally need the same name, use a compact `I` prefix:

```ts
export interface IEmailService {
  sendWelcomeEmail(...): Result<void, SendWelcomeEmailError>;
  sendPasswordResetEmail(...): Result<void, SendPasswordResetEmailError>;
}

export class EmailService implements IEmailService {
  // ...
}
```

Interfaces whose implementations already have natural distinguishing names need no prefix:

```ts
export interface UserStore {
  findActiveByEmail(email: EmailAddress): Promise<Result<ActiveUser, UserLookupError>>;
}

export class PostgresUserStore implements UserStore {
  // ...
}
```

Name a dependency variable for the object it holds. Keep `Service`, `Store`, or `Sender` when the bare domain noun could mean a value: `emailService` is clearer than `email`. A natural plural may already communicate a collection-like capability, so both `users` and `userStore` can be clear. Preserve either clear local name rather than creating naming-only churn. When changed behavior makes a name inaccurate or changes its audience, rename it as part of the same change.

Use the shortest qualifier that preserves an implementation's meaningful and searchable distinction, such as `PostgresUserStore`, `ResendEmailSender`, or `SystemClock`. Additional adjectives identify distinct observable behavior rather than construction trivia.

## Adapters and concrete clients

An inbound Adapter parses an external request, event, or command; invokes an Application Service or eligible pure Domain Module; and turns the result into the external protocol.

An outbound Adapter implements an application-owned capability using a concrete technology. It owns protocol/schema translation, framework lifecycle, external failure classification, safe diagnostics, and short-lived technical retries that preserve the capability's meaning.

One concrete external client may remain private inside the service that owns its use while a separate Adapter would only forward calls. The owner catches and translates client failures before they cross its public interface. Extract an Adapter when it hides meaningful translation or mechanics, is reused, or supports real implementation variation.

For example, an `EmailService` may initially use `ResendClient` directly. Introduce `EmailSender`, `ResendEmailSender`, and `MailgunEmailSender` when provider variation or meaningful provider mechanics appear.

Before creating an Adapter or service:

1. Check existing services, clients, and Adapters.
2. Use an existing concrete client directly when a new Adapter would only forward and the client remains private.
3. Reuse an existing cohesive Adapter through its capability contract.
4. Extend an Adapter when the new method fits its owner and reason to change.
5. Create an Adapter when it hides meaningful translation or mechanics, serves multiple owners, or supports real implementation variation.

Create an ADR for a lasting architectural boundary, shared pattern, provider strategy, or deliberate exception. For each new service or Adapter, record which existing owners were checked and why reuse or extension did not fit.

## Authentication and authorization

Allocate authentication and authorization responsibilities as follows:

- inbound Adapters verify boundary credentials and produce a parsed `Principal`, `Session`, or `CommandActor`;
- Domain Modules define pure permission decisions over parsed values;
- Application Services gather context and enforce those decisions while carrying out the operation;
- Adapters translate missing credentials and denied operations into protocol outcomes.

## Completion check

Complete when every changed operation has been traced and accounted for against every applicable rule in this reference:

- each concern has one owner, Domain Modules remain pure, and authentication and authorization follow the stated allocation;
- each meaningful service starts from an explicit interface, broader services compose smaller cohesive capabilities only after those seams earn their place, and orchestration keeps sequence and policy visible while delegating owned calculations and mechanisms;
- protocol, framework, persistence, runtime, and vendor details stop at their owning Adapter or private service implementation;
- each new abstraction passes the deletion test and existing-owner check, with required evidence or ADR recorded;
- capability names use ordinary vocabulary that stays stable across callers, operation names remain clear at call sites and definition-site searches, stale names change with their behavior or audience, and implementation qualifiers preserve only meaningful distinctions; and
- each entrypoint parses protocol input, invokes the owning application or pure domain operation, and renders the protocol result.