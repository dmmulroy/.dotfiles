# Testing

## Test through real interfaces

Every caller-visible feature has an end-to-end happy-path test through its real public entrypoint when the normal test environment can run it reliably.

Add end-to-end coverage for expected error paths that the public entrypoint can exercise reliably. Cover remaining important failures at the closest real interface. Report why end-to-end coverage is impractical when unreliable third parties or unreasonable setup, runtime, or cost prevent it.

Prefer tests by confidence:

1. end-to-end tests through real public entrypoints;
2. integration tests through real interfaces;
3. focused/property tests for pure Domain Modules;
4. unit tests for meaningful behavior rather than implementation details.

Module mocking with `vi.mock` or `jest.mock` is forbidden. Replace behavior through real services and implementations:

- constructor-injected interfaces/classes;
- Effect services/Layers;
- local database substitutes such as SQLite;
- faithful in-memory implementations;
- fake external implementations when needed.

Assert observable outcomes:

- returned values/errors;
- persisted state;
- emitted events/messages;
- rendered responses;
- sent email records in a recording/local implementation.

A spy assertion is appropriate only when the interaction is itself the observable behavior. Prefer a recording implementation and inspect its public records over spying on implementation methods.

## Property tests and arbitraries

Assess property-based testing for every changed invariant, transition, normalization, equivalence, ordering, idempotence, or roundtrip. Add property tests when generated inputs cover meaningful cases beyond a short example list. Apply this assessment especially to parsers, smart constructors, branded/refined types, state machines, serialization, and lawful combinators.

Use `fast-check` in normal TypeScript projects. In Effect projects, prefer Effect's FastCheck integration and derive arbitraries from owning Schemas when available.

Keep reusable arbitraries beside the domain module they support. Add a shared test-data entrypoint only when multiple consumers need one:

```txt
src/billing/
  invoice-number.ts
  invoice-number.test.ts
  invoice-number.arbitrary.ts
```

Generated test data passes through the same parsers, smart constructors, and invariants as production values.

## Test implementations

A dependency interface represents real ownership or variability, not a test-only desire to mock.

- Keep a narrow one-off fake local to its test.
- Export a reusable static or recording implementation when its complete behavior is useful across tests.
- Use an established conventional name when it communicates expected behavior, such as `TestClock`.
- Otherwise use the shortest truthful behavior/implementation qualifier, such as `InMemoryCache`, `RecordingEmailSender`, `NoopEmailSender`, or `FailingEmailSender`.
- Use SQLite or another real local substitute when queries, schema, serialization, transactions, or protocol behavior matter.
- Use and name an implementation as in-memory only when it faithfully preserves the complete observable contract under test.

Keep production branches, exports, flags, and behavior determined by production needs. Test through an existing public interface or a faithful inert harness when no real dependency interface exists.

## Compile-time behavior

When inference is public behavior, add compile-time tests using ordinary call sites without rescue annotations or casts. Assert inferred success and expected-failure types so widening regressions fail the test.

## Completion check

Every changed caller-visible behavior has an end-to-end happy path or a reported concrete blocker; each expected error path is covered at the highest reliable real interface or has a reported concrete blocker; every changed property named above has been assessed and applicable property tests are present; changed public inference has compile-time success and expected-failure tests; tests cross real interfaces without module mocks; generated data preserves production invariants; production surfaces remain determined by production needs; and every reusable test implementation truthfully matches its name and complete observable contract.