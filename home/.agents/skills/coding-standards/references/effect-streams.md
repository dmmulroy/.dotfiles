# Streams

Use this when working with `Stream`, event sources, async iterables, queue/pubsub-backed streams, pagination, backpressure, throttling, debouncing, or long-lived stream consumers.

## Mental Model

`Stream<A, E, R>` is an effectful source that can emit many `A` values over time, fail with `E`, and require services `R`. Streams are pull-based and backpressured; consumption controls demand.

Use streams for sources that are naturally many-valued and time-ordered:

- gateway events
- provider callbacks adapted through queues
- subscription/event logs
- paginated APIs
- file/stdin/platform streams
- scheduled ticks when values matter
- pipelines with filtering, mapping, buffering, throttling, or bounded concurrent processing

Use `Effect.repeat(...)` with `Schedule` for one repeated effect with no emitted values; read [`effect-scheduling-and-retry.md`](effect-scheduling-and-retry.md). Reserve streams for work that emits values.

## Source Chooser

- In-memory values: `Stream.make(...)` or `Stream.fromIterable(...)`.
- Queue-backed callback boundary: `Queue` plus `Stream.fromQueue(...)`.
- Broadcast events: `PubSub` plus `Stream.fromPubSub(...)`.
- Latest-value state plus updates: `SubscriptionRef`.
- Schedule-generated ticks/values: `Stream.fromSchedule(...)`.
- Paginated pull APIs: `Stream.paginate(...)`; its effectful step returns `Effect<[chunk, Option<nextState>]>`.
- Async iterable/platform source: prefer a native Effect source; otherwise use `Stream.fromAsyncIterable(...)`.
- Effect that produces a stream after reading services/config: `Stream.unwrap(...)`.

## Transformation Chooser

- Pure transformation: `Stream.map(...)`.
- Effectful transformation: `Stream.mapEffect(...)`.
- Bounded concurrent effectful transformation: `Stream.mapEffect(fn, { concurrency })`.
- Drop ordering when order is irrelevant and latency matters: `Stream.mapEffect(fn, { concurrency, unordered: true })`.
- One input to zero/many outputs: `Stream.flatMap(...)`.
- Multiple inner streams concurrently: `Stream.flatMap(fn, { concurrency })`.
- Keep only matching values: `Stream.filter(...)` / `Stream.filterEffect(...)`.
- Stateful transformation: `Stream.mapAccum(...)` / `Stream.mapAccumEffect(...)`.

## Consumption Chooser

- Side-effecting consumer: `Stream.runForEach(...)`.
- Ignore elements but run the stream: `Stream.runDrain`.
- Materialize a finite stream: `Stream.runCollect`.
- Fold into a value: `Stream.runFold(...)`.
- Long-lived consumer: use the scoped layer pattern below.

Use `Stream.runCollect` only when the stream is known to terminate.

## Long-Lived Consumers

Own long-lived stream consumers in layers and fork them into the layer scope.

```ts
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const gateway = yield* Gateway.Service

    yield* gateway.events.pipe(
      Stream.filter(isMessageEvent),
      Stream.runForEach(handleEvent),
      Effect.forkScoped,
    )
  }),
)
```

If service methods must fork work into the layer lifetime, capture `Scope.Scope` during layer acquisition, use `Effect.forkIn(scope)` internally, and keep the scope private. Let stream failures reach the owning boundary unless it has a truthful recovery policy.

## Queues, PubSub, And SubscriptionRef

- Use `Queue` when each event/item should be consumed by one consumer or worker.
- Use `PubSub` when every subscriber should see every event.
- Use `SubscriptionRef` when consumers need the current value and a stream of changes.
- Expose a `Stream` from service interfaces for caller-consumed events.
- Keep producer queues and mutable refs inside the implementation or test service.

Good service shape:

```ts
export interface Interface {
  readonly events: Stream.Stream<ProviderEvent, ProviderError>
  readonly status: Stream.Stream<ProviderStatus>
}
```

Implementation can use private `Queue` / `SubscriptionRef`; consumers see streams.

## Backpressure And Buffers

Prefer natural stream backpressure first.

Use `Stream.buffer(...)` only when producer and consumer should decouple.

- `strategy: "suspend"`: apply backpressure when full.
- `strategy: "dropping"`: drop new values when full.
- `strategy: "sliding"`: keep the latest values by dropping old ones.
- `capacity: "unbounded"`: rare; use only when growth is bounded elsewhere.

Use `Stream.debounce(...)` for quiet-period behavior and `Stream.throttle(...)` / `Stream.throttleEffect(...)` for rate-shaped streams.

## Error Handling

- Translate typed errors at boundaries with `Stream.mapError(...)`.
- Recover typed errors with `Stream.catchIf(...)`, `Stream.catchTag(...)`, or `Stream.catchFilter(...)`.
- Reserve `Stream.catchCause(...)` for explicit supervision boundaries.

## Keyed Concurrency

For keyed work, preserve ordering within each key while allowing different keys to run concurrently. Prefer an existing named keyed-run helper; otherwise keep the required fiber bookkeeping in one named helper rather than scattering it through consumers. Choose queueing, replacement, or coalescing semantics from the owning operation's policy.

## Tests

- Use `Stream.fromIterable(...)` for finite fixtures; compose it with `Stream.concat(Stream.never)` when the fixture represents an open subscription.
- Use `Stream.empty` for no events.
- Use `Stream.fromQueue(...)` with a test-owned `Queue` when the test needs to drive events interactively.
- Bound open streams with `Stream.take(n)` before `Stream.runCollect`.

For stream tests involving time or concurrency, read and apply [`effect-testing.md`](effect-testing.md) completely.

## Completion Check

The source matches the producer's delivery semantics; ordering and concurrency are explicit; every collected stream is finite; buffers have a bounded-growth policy; long-lived consumers have a scoped owner; queue, `PubSub`, and `SubscriptionRef` internals stay behind stream-facing service interfaces; and typed failures, defects, and interruption reach a boundary with an explicit policy.
