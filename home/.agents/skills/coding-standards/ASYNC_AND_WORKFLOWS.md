# Async and Workflows

Async code needs clear ownership: cancellation lifetime, promise lifetime, concurrency, retries, transactions, and durable progress. Hidden waterfalls and fire-and-forget work are correctness bugs, not style issues.

## Vocabulary

**Caller-Owned Cancellation Lifetime** — Lower-level modules accept and propagate the caller's `AbortSignal` instead of inventing hidden operation lifetimes.

**Cancellable Options** — A final options object such as `{ readonly signal?: AbortSignal }`, leaving room for timeout, retry, trace, and idempotency options.

**Floating Promise** — A promise created without being awaited, returned, collected by a concurrency primitive, or handed to explicit detached-work machinery.

**Detached Work** — Intentional background/post-response work owned by a runtime or project helper with lifetime, cancellation, rejection handling, and observability.

**Retry-Safe Command** — A mutating operation whose repeated execution after retry/redelivery/crash does not duplicate or contradict side effects.

**Atomic Transition Guard** — A persistence-level guarded update/transaction that applies a lifecycle transition only from legal prior states.

## Non-negotiables

- A received cancellation signal reaches every downstream cancellable operation.
- Lower-level modules do not replace the caller's cancellation lifetime with a hidden `AbortController` or timeout.
- New cancellable interfaces accept cancellation in a final options object, not positional signals or boolean flags.
- Every promise is awaited, returned, collected, or handed to explicit detached-work machinery.
- Detached work identifies owner, lifetime, cancellation behavior, rejection handling, and observability.
- Independent async work starts concurrently unless ordering/backpressure/rate limit/transaction/workflow/external contract requires serialization.
- User-sized, database-sized, file-sized, queue-sized, or otherwise unbounded collections use bounded concurrency.
- Retried mutating commands define how repeated execution avoids duplicate resources, transitions, messages, and external side effects.
- Retried create operations do not allocate a fresh logical identity.
- Do not hold database transactions open across network calls or long-running work.

## Cancellation

Async work that waits on I/O, timers, retries, queues, subprocesses, workflows, resource acquisition, or long computation should accept caller-owned cancellation when the runtime supports it.

Use **Cancellable Options**: a final options object that can grow without changing positional parameters.

```ts
type FindUserOptions = {
  readonly signal?: AbortSignal;
};

await users.findActiveByEmail(email, { signal });
```

Avoid positional or boolean cancellation:

```ts
findUser(email, signal);
findUser(email, true); // not cancellation
```

Propagate the signal:

```ts
await fetch(url, { signal });
await retry(operation, { signal });
await sleep(delay, { signal });
```

If a dependency cannot accept `AbortSignal`, check before and after the call and document the limitation:

```ts
signal?.throwIfAborted();
const result = dependency.call();
signal?.throwIfAborted();
```

Classify cancellation before wrapping unknown failures as ordinary dependency errors.

## Promise ownership

Prefer collecting created promises immediately. For small known-size collections:

```ts
await Promise.allSettled(items.map(processItem));
```

For user-sized, database-sized, file-sized, queue-sized, or otherwise unbounded collections, collect work through the shared bounded-concurrency primitive.

Avoid:

```ts
items.map(processItem); // floating promises
void sendEmail(user);   // unowned detached work
```

Detached work goes through the runtime/project mechanism:

```ts
ctx.waitUntil(sendWelcomeEmail(user));
runDetached(sendWelcomeEmail(user), { signal, logger });
```

The mechanism must own rejection handling and observability.

## Concurrency

Avoid accidental sequential awaits:

```ts
for (const user of users) {
  await sendWelcomeEmail(user); // hidden waterfall unless serialization is required
}
```

Prefer starting independent work together:

```ts
const results = await Promise.allSettled(
  users.map((user) => sendWelcomeEmail(user, { signal })),
);
```

Use `Promise.all` only when the operations are one all-or-nothing dependency group and one rejection should reject the aggregate. `Promise.all` does not cancel peer work; pass cancellation through `AbortSignal` or a cancellable primitive when peers should stop.

Use `Promise.allSettled` when successes remain useful, failures need per-item reporting/classification, or peers should continue after one failure.

## Bounded concurrency

Small known-size collections can use `Promise.allSettled`. Unbounded or user/data-sized collections need an explicit limit chosen from the bottleneck:

- external API rate limit;
- database pool size;
- CPU cost;
- memory pressure;
- runtime/platform limits.

Prefer one shared primitive:

```ts
await mapConcurrentBounded(users, { concurrency: emailProviderConcurrency }, sendEmail);
```

Avoid magic limits:

```ts
await mapConcurrentBounded(users, { concurrency: 10 }, sendEmail);
```

Sequential execution is not the safety fallback; bounded concurrency is.

## Retry-safe commands

Treat mutating HTTP commands, especially `POST` creates, as retryable by default. Clients, proxies, Workers, queues, and humans retry after timeouts or lost responses.

A create operation must not allocate a fresh identity on retry and create a duplicate logical resource. Use one of:

- client/request idempotency key;
- client-provided natural ID plus unique constraint;
- persisted replay record;
- deduplication/inbox record;
- state-machine transition guard;
- transactional outbox/inbox.

Prefer:

```txt
receive CreatePayment(idempotencyKey)
  -> transaction: create/replay payment + outbox record
  -> deliver outbox after commit
```

Avoid:

```txt
insert payment
call payment provider
```

A crash between save and external call creates an ambiguous side-effect window unless durable delivery closes it.

## Atomic transition guards

For retry/concurrency-exposed lifecycle transitions, use guarded persistence operations:

```sql
UPDATE invoices
SET state = 'paid', paid_at = ?
WHERE id = ? AND state = 'sent'
```

Avoid stale read then unconditional write as the only guard:

```txt
row = SELECT invoice
if row.state == sent
  UPDATE invoice SET state = paid
```

Retries should not overwrite original transition metadata like `completedAt` or `paidAt`.

Deletion semantics should be explicit: if delete is idempotent, name/document that. If the result claims whether this request deleted the entity, derive it from the atomic delete result, not a stale pre-read.

## Workflow selection

Use ordinary function calls or local database transactions for simple single-boundary operations.

Use a durable workflow, saga, or equivalent explicit orchestration record when a process needs:

- retries;
- compensation;
- idempotency;
- resumability;
- timers;
- human approval;
- cross-service coordination;
- multiple transaction boundaries.

Durable multi-step work externalizes progress, retry, and compensation state. It does not rely on an in-memory call stack surviving.

Do not introduce a workflow just for layering when ordinary calls/transactions are enough.

## Rejected framings

- **"Fire and forget."** Detached work still needs ownership.
- **"Sequential is safer."** Sequential loops hide latency and do not solve overload; use bounded concurrency.
- **"POST probably won't retry."** Retrying create commands is normal.
- **"We saved before calling the API."** Save-then-call still has a crash window.
- **"Timeouts belong everywhere."** Lower-level modules compose dependency-specific timeouts with caller cancellation; they do not replace it.

## Review checklist

Use this as the final scan after applying the rules above; the rule source of truth remains in the relevant sections.

- Accepting `signal` at the top and dropping it before `fetch`, retry, sleep, or adapter calls.
- Using `Promise.all` for partial-failure batches.
- Awaiting inside loops over users/rows/files without documenting ordering or backpressure.
- Creating ad hoc pools/semaphores instead of the shared concurrency primitive.
- Retrying create operations with fresh server IDs.
- Holding transactions open while calling external services.
- Starting multi-step work with no persisted progress or compensation state.
