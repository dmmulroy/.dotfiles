# Observability

Observability should make failures diagnosable without leaking secrets or coupling domain decisions to logging. The imperative shell observes typed outcomes; the core stays pure.

## Core vocabulary

**Structured Tracing** — Correlated telemetry across requests, jobs, workflows, modules, adapters, and external calls.

**Safe Error Summary** — A diagnostic built from stable tags, operation names, dependency names, type names, or explicitly safe fields rather than arbitrary object serialization.

**Redacted Value** — A wrapper for secrets that prevents accidental logging, inspection, and JSON serialization.

**Safe Fields** — Telemetry fields that are intentionally non-secret: domain IDs, operation names, dependency names, state tags, retry counts, error tags, route names, and safe summaries.

## Non-negotiables

- Secrets never enter errors, logs, traces, metrics, snapshots, panic summaries, test snapshots, or serialized diagnostics.
- Sensitive values are wrapped in a redacted value at the boundary and unwrapped only where the raw value is needed.
- Unknown thrown values and arbitrary payloads are not `JSON.stringify`'d for diagnostics.
- New External Adapter Modules and error translations preserve established tracing, logging, metrics, and error-reporting behavior.
- Domain decisions do not depend on a logger or telemetry mechanism.

## Apply this file

An observability pass is complete when every touched External Adapter Module, error translator, framework handler, workflow step, or background task has been checked for:

- secret redaction at the boundary;
- safe error summaries and safe telemetry fields;
- preservation of existing logs, traces, metrics, error reporting, and correlation hooks;
- no new telemetry dependency inside domain decisions.

If the existing repo has no reporting/correlation mechanism for the touched path, say so instead of inventing one incidentally.

## Strong defaults

- Use Effect's `Redacted.Redacted` in Effect codebases.
- Outside Effect, use a small local `Redacted<T>` wrapper, usually in `prelude.ts`, when the project lacks one.
- Prefer structured fields over prose-only logs.

## Redaction

Wrap secrets as soon as they cross the boundary:

```ts
type ApiConfig = {
  readonly endpoint: Url;
  readonly token: Redacted<string>;
};
```

Unwrap only at the adapter that needs the raw value:

```ts
await fetch(endpoint, {
  headers: { authorization: `Bearer ${Redacted.value(token)}` },
  signal,
});
```

Avoid carrying raw secret strings through Service Modules:

```ts
type ApiConfig = {
  readonly token: string; // easy to log, snapshot, or include in error context
};
```

## Safe error summaries

Prefer stable summaries:

```ts
logger.error("User lookup failed", {
  operation: "findActiveByEmail",
  provider: "postgres",
  errorTag: error._tag,
  userId: UserId.toTelemetryField(userId),
});
```

Avoid serializing arbitrary thrown values:

```ts
logger.error(`Unexpected failure: ${JSON.stringify(cause)}`);
```

If a panic helper needs context, pass an explicit safe summary:

```ts
shouldNeverHappen("Unhandled payment state", { stateTag: payment._tag });
```

Do not dump the whole domain object, request body, environment, or dependency response.

## Structured tracing

Good traces answer:

- What operation was running?
- Which dependency or adapter was involved?
- Which safe domain/resource IDs identify the work?
- Which state or transition was attempted?
- Which typed error tag occurred?
- Was this a retry, compensation, cancellation, or normal path?

Example fields:

```ts
{
  operation: "sendWelcomeEmail",
  dependency: "resend",
  userId,
  attempt,
  errorTag: result.error._tag,
}
```

Avoid uncorrelated logs that are only useful by reading source code:

```ts
logger.error("failed");
```

## Preserve existing observability

Before adding an External Adapter Module, error translator, framework handler, workflow step, or background task, inspect how the repo currently reports:

- logs;
- traces/spans;
- metrics;
- error reporting;
- request/job correlation;
- cancellation/interruption.

Do not bypass established hooks. If the existing system is exception-based, typed local failures can still be translated at the boundary while preserving the same reporting path.

This check is complete when the changed path uses the same reporting/correlation path as comparable code, or when absence of an established mechanism is explicitly noted.

## Keep the core independent

Prefer:

```ts
const decision = Invoice.decideReminder(invoice, now);
logger.info("Reminder decision", InvoiceReminder.toTelemetryFields(decision));
```

Avoid:

```ts
function decideReminder(invoice: Invoice, logger: Logger) {
  logger.info("checking invoice");
  // domain behavior now depends on telemetry plumbing
}
```

Domain Modules may expose explicit telemetry projections for safe fields when useful, but they should not perform logging.

## Rejected framings

- **"It's just logs."** Logs and traces are production outputs and can leak secrets.
- **"More context is always better."** More raw context is often worse. Use safe summaries.
- **"The error message should include the payload."** Include stable tags and safe IDs, not payload dumps.
- **"Instrumentation belongs in domain logic."** Domain logic returns decisions; Service Modules and External Adapter Modules observe them.

## Review checklist

Use this as the final scan after applying the rules above; the rule source of truth remains in the relevant sections.

- Including API keys, tokens, raw credentials, env values, or request bodies in thrown messages.
- Adding a new External Adapter Module that returns typed errors but skips existing error reporting.
- Logging `cause` directly without a safe summary/classifier.
- Forgetting retry count, operation name, dependency name, or typed error tag in failure telemetry.
- Using redaction only at log call sites instead of wrapping secrets at the boundary.
