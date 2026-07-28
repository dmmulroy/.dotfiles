# Effect

These defaults target Effect v4.

## Source rule

Inspect the project's pinned `effect` package version and source before selecting APIs. Prefer vendored or pinned examples over remembered APIs. Consult current upstream source only when the pinned package does not answer the question.

## Branch chooser

Read every branch that matches the changed behavior:

- Data models, schemas, brands, variants, optional keys, or decoders: [`effect-schema-and-data.md`](effect-schema-and-data.md).
- Services, module surfaces, Layers, runtime wiring, `Effect.fn`, or test services: [`effect-services.md`](effect-services.md).
- Runtime config, environment variables, `ConfigProvider`, or `layerConfig`: [`effect-configuration.md`](effect-configuration.md).
- Retry, repeat, polling, backoff, jitter, rate limits, timeouts, or pass loops: [`effect-scheduling-and-retry.md`](effect-scheduling-and-retry.md).
- Memoization, TTL caches, concurrent lookup deduplication, or request batching: [`effect-caching.md`](effect-caching.md).
- Streams, event sources, async iterables, queues, pubsubs, pagination, backpressure, or stream consumers: [`effect-streams.md`](effect-streams.md).
- Outgoing HTTP, Effect `HttpClient`, status handling, or HTTP rate limiting: [`effect-http-clients.md`](effect-http-clients.md).
- Effect tests, time, sleeps, concurrency synchronization, fakes, or test Layers: [`effect-testing.md`](effect-testing.md).

## Cross-cutting defaults

- Compose workflows with `Effect.gen(function* () { ... })` and the project's established `Effect.fn` patterns.
- Recover from the typed error channel at the narrowest boundary with a truthful response; preserve defects and interruption.
- Use native Effect workflows. Isolate unavoidable Promise or platform APIs in their owning Adapter.

## Completion check

Every matching branch has been read, every chosen Effect API has been verified in the pinned package source, and every cross-cutting default has been checked against each changed Effect path. Report any exception with concrete evidence.
