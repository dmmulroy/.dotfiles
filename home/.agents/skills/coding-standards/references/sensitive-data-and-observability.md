# Sensitive data and observability

Use the repository's established tracing, logging, metrics, and error-reporting hooks. Where structured tracing exists, preserve active trace context across changed requests, jobs, workflows, application modules, Adapters, and external calls.

Annotate diagnostics with structured fields such as:

- opaque domain IDs approved for diagnostic use;
- operation names;
- dependency/provider names;
- state tags;
- retry counts;
- typed error tags;
- bounded summaries derived from allowlisted fields.

Treat personal data as private by default. Record only the minimum fields explicitly allowed by repository policy or established convention, after applying any required minimization or sanitization.

Represent tokens, API keys, passwords, raw credentials, and other secrets with a `Redacted<T>` wrapper. Use Effect's `Redacted.Redacted` in Effect codebases or a local shared `Redacted<T>` wrapper elsewhere. Wrap these values at the boundary, preserve the wrapper through application code, and unwrap only in the module performing the final I/O operation that requires the raw value.

Errors, traces, logs, metrics, reports, and snapshots contain only redacted representations of secrets and approved representations of personal data.

Inspect automatic instrumentation as well as application logs: framework HTTP spans/reporters may capture full URLs, headers, redirect locations, bodies, or causes before inner middleware runs. Apply allowlisting or redaction at the outer owner that actually creates/reports the event, while preserving safe correlation, failure classification, and interruption. Test the emitted span/report interface with representative sensitive input; wrapping one application field does not establish safety of a framework-generated cause.

## Completion check

Every changed credential and secret is wrapped from its input boundary through the final-I/O owner. Every added or changed diagnostic field has been verified as approved for diagnostics, an approved minimal representation of personal data, or a redacted representation of a secret. Each changed failure records all applicable diagnostic context: operation, safe identifiers, provider, typed error tag, and retry state. Existing observability hooks remain connected, structured trace context crosses every changed boundary where tracing is established, and automatic instrumentation has been checked at its real capture/reporting owner.