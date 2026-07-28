# HTTP Clients

Default to Effect HTTP client modules for outgoing HTTP in application and provider code:

- `effect/unstable/http/HttpClient`
- `effect/unstable/http/HttpClientRequest`
- `effect/unstable/http/HttpClientResponse`
- `effect/unstable/http/HttpClientError`

For a runtime or library boundary that cannot depend on unstable Effect HTTP modules, follow [Raw Fetch Exception](#raw-fetch-exception).

## Boundary Shape

Each HTTP boundary operation should be a named Effect that owns the complete protocol interaction:

- construct the request;
- attach authentication and headers;
- execute the request with interruption support;
- classify status before decoding a success body;
- decode the response into application or domain types;
- translate transport, status, and decode failures into typed application errors;
- apply the operation's retry and rate-limit policy.

Place these protocol mechanics in an outbound Adapter or a private concrete client. Application services call that boundary and own application policy. Keep database transaction scopes limited to database work. Read [`modules-services-and-adapters.md`](modules-services-and-adapters.md) when deciding whether a separate Adapter is earned, and [`workflows-transactions-and-idempotency.md`](workflows-transactions-and-idempotency.md) when an HTTP operation can repeat or interacts with a transaction.

## Effect HttpClient

Useful APIs:

- `HttpClient.get(...)`, `post(...)`, `put(...)`, `patch(...)`, `del(...)`, `execute(...)` for service accessors.
- `HttpClient.mapRequest(...)` / `mapRequestEffect(...)` for configured client transforms.
- `HttpClientRequest.prependUrl(...)` for base URLs.
- `HttpClientRequest.bearerToken(...)` for bearer auth.
- `HttpClientRequest.acceptJson` for JSON accept headers.
- `HttpClientRequest.bodyJson(...)` for effectful JSON body encoding.
- `HttpClientRequest.schemaBodyJson(...)` for schema-backed JSON body encoding.
- `HttpClient.filterStatusOk` / `HttpClientResponse.filterStatusOk` before decoding when non-2xx responses are failures.
- `HttpClientResponse.schemaBodyJson(...)` for body-only decoding, `schemaJson(...)` for status/headers/body decoding, and `schemaNoBody(...)` for status/headers decoding.

## Retry And Rate Limits

Retry an outgoing operation when its idempotency guarantee makes repetition safe. Choose the retry owner by failure semantics:

- Use `HttpClient.retryTransient(...)` for transport errors, timeouts, and HTTP `408`, `429`, `500`, `502`, `503`, and `504` responses.
- Use operation-level `Effect.retry(...)` when retry depends on domain-specific typed errors, provider payloads, or operation idempotency.

Use `HttpClient.withRateLimiter(...)` for proactive pacing that learns from rate-limit and `Retry-After` headers. It requires a `RateLimiter` plus initial window, limit, and key options, adds `RateLimiterError` to the error channel, and retries `429` responses by default.

Read [`effect-scheduling-and-retry.md`](effect-scheduling-and-retry.md) when operation-level retry needs a custom schedule or a typed provider error carries `retryAfterMs`.

## Raw Fetch Exception

Choose raw `fetch` for a platform transport or a runtime/library boundary that cannot take a dependency on unstable Effect HTTP modules. Keep that boundary focused on request construction, execution, interruption, status classification, response decoding, and typed failure translation. A boundary that can accept unstable Effect HTTP modules moves to Effect HttpClient when it needs shared client transforms, HTTP retry helpers, or rate limiting.

```ts
const request = Effect.fn("Provider.request")(function* (input: RequestInput) {
  const response = yield* Effect.tryPromise({
    try: (signal) => fetch(input.url, { signal, headers: input.headers }),
    catch: (cause) => new ProviderError({ operation: "Provider.request", cause }),
  })

  if (!response.ok) {
    return yield* Effect.fail(new ProviderRejected({
      operation: "Provider.request",
      status: response.status,
    }))
  }

  const json = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (cause) => new ProviderError({ operation: "Provider.decodeJson", cause }),
  })

  return yield* Schema.decodeUnknownEffect(ResponseSchema)(json).pipe(
    Effect.mapError((cause) =>
      new ProviderError({ operation: "Provider.decodeResponse", cause }),
    ),
  )
})
```

For raw-fetch boundaries:

- Pass the `AbortSignal` from `Effect.tryPromise` to `fetch`.
- Classify HTTP status before decoding a successful payload.
- Decode unknown response bodies with Schema at the boundary. Read [`parsing-and-schemas.md`](parsing-and-schemas.md) when defining the response representation or its application/domain translation.
- Retain provider evidence needed for diagnosis as safe structured fields. Read [`sensitive-data-and-observability.md`](sensitive-data-and-observability.md) when requests, responses, or diagnostics may contain secrets or personal data.

## Completion Check

Every outgoing HTTP operation uses Effect HttpClient or records a concrete runtime/library reason for raw `fetch`; request construction, authentication, interruption, status classification, schema decoding, typed failure translation, and safe diagnostics have clear owners; status is classified before a success body is decoded; database transaction scopes contain only database work; and every retry or rate-limit policy has explicit ownership and a proven idempotency guarantee.
