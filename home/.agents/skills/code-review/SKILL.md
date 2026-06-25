---
name: code-review
description: Review code against the local coding standards.
disable-model-invocation: true
---

# Code Review

Run a standards-backed code review. This is review-only: do not edit files, apply patches, or "fix as you go" unless the user explicitly asks after the review.

Treat `../coding-standards/` as the standards package. Load standards by topic; do not duplicate or reinvent them here.

## Review principles

- Review changed behavior, contracts, seams, tests, and runtime effects — not style vibes.
- Every finding needs proof: a concrete path, location, missing contract, reachable failure, leaked value, unparsed boundary, invalid state, or inadequate test seam.
- Preserve local conventions when compatible with the standards; do not use local convention to excuse correctness, safety, boundary, observability, or test-integrity violations.
- Prefer fewer, stronger findings over exhaustive commentary.
- Do not include praise or a "what's good" section.

## 1. Select the review target

Use the user's explicit target when provided: files, commit range, branch, PR, diff, or staged/unstaged scope.

When no target is provided, detect it:

1. If the working tree has staged or unstaged changes, review the working tree diff.
2. Otherwise, if the current branch has a merge base with `main`, `master`, or its upstream, review the branch diff.
3. Otherwise, ask one question to identify the review target.

State the selected target before reviewing.

Completion criterion: the review target is explicit and backed by inspected git state or the user's instruction.

## 2. Load standards and local context

Read:

- `../coding-standards/SKILL.md`
- `../coding-standards/VOCABULARY.md`

Then load topic files matching the changed responsibilities:

| Change touches... | Load... |
|---|---|
| domain values, invariants, states, transitions | `../coding-standards/DOMAIN_MODELING.md` |
| expected failures, custom errors, catch/classification | `../coding-standards/ERROR_HANDLING.md` |
| logs, traces, telemetry, redaction, secrets | `../coding-standards/OBSERVABILITY.md` |
| modules, interfaces, seams, adapters, dependencies | `../coding-standards/DESIGNING_MODULES.md` |
| parsing, DTOs, storage rows, config, projections, codecs | `../coding-standards/BOUNDARIES_AND_PARSING.md` |
| cancellation, promises, concurrency, retries, transactions, workflows | `../coding-standards/ASYNC_AND_WORKFLOWS.md` |
| tests, real seams, properties, persistence/runtime evidence | `../coding-standards/TESTING_AND_VERIFICATION.md` |
| casts, `any`, readonly contracts, collections, exports, JSDoc, toolchain | `../coding-standards/TYPESCRIPT_CONTRACTS.md` |
| Workers, Durable Objects, Agents, D1, KV/R2, Queues, Workflows | `../coding-standards/CLOUDFLARE_ARCHITECTURE.md` |
| Effect Services/Layers, typed channel, Schema, Redacted, Effect tests | `../coding-standards/EFFECT.md` |

Inspect local code/docs for conventions around errors, schemas, testing, dependency injection, observability, adapters, and module layout before reporting pattern deviations.

Completion criterion: every changed concern is matched to loaded standards and local precedent has been checked where relevant.

## 3. Review the change

Trace changed behavior through the code, not just the diff hunk. Follow values across:

- external input → parser → domain/application type;
- domain invariant → constructor/transition → persistence;
- function result → caller handling → protocol response;
- secret source → error/log/trace/snapshot sink;
- async work → cancellation, promise ownership, concurrency, retry/idempotency;
- interface → adapter → external dependency;
- test → public interface / real seam → observable behavior.

Look especially for standards agents commonly miss:

- validated-but-not-parsed data;
- `JSON.parse(...) as Type`, `Response.json() as Type`, row casts;
- expected failures hidden in throws/rejections;
- broad error unions where callers need semantic cases;
- secrets in messages, telemetry fields, snapshots, or arbitrary serialization;
- pass-through wrappers and accidental interfaces;
- dependency bags, hidden globals, raw platform bindings outside seams;
- dropped `AbortSignal`, floating promises, accidental sequential awaits;
- retryable mutations without idempotency or durable side-effect delivery;
- tests using module mocks/spies or implementation details;
- casts, `any`, non-null assertions, mutable exported contracts;
- Cloudflare runtime-hop context/serialization mistakes;
- Effect code bypassing established Effect mechanisms.

Completion criterion: each material changed behavior, boundary, failure path, module seam, async path, and test claim has either no issue or a concrete candidate finding.

## 4. Require proof for every finding

A finding survives only when you can show concrete evidence. Favor showing it with real artifacts over prose:

- Quote the actual problematic code from the changed files (with its path and line range), not a paraphrase.
- When behavior is the issue, show the concrete value flow: real inputs, the resulting outputs, and the call stack or call path that connects them.
- When you reproduce the issue, show the reproduction and its observed result rather than asserting it.
- Only fall back to prose-only proof when no code, value, or stack can express the issue.

Examples:

- Sensitive-data finding: trace the sensitive value from source to observable sink.
- Boundary finding: trace unparsed or less-structured data into trusted application/domain code.
- Parse-don't-validate finding: show validation occurs but the refined value is discarded or the value is repeatedly defensively revalidated.
- Domain finding: show how an invalid state can be constructed, persisted, or reached through a changed path.
- Failure finding: name the normal-operation failure and show it is absent from the typed contract or misclassified.
- Async finding: identify the retry, cancellation, redelivery, concurrency, or timeout path and the duplicated/lost/leaked work.
- Test finding: name the behavior or runtime seam that remains unproven, or the implementation detail the test relies on.

If proof is missing, downgrade to **Question** or drop it.

Completion criterion: every candidate finding has a precise location and behavioral proof shown with real code, values, or a reproduction where possible — not just a standards preference.

## 5. Self-challenge findings

Before final output, try to disprove each finding:

- Did local convention already solve this elsewhere?
- Is there a parser, smart constructor, adapter, layer, middleware, or test setup outside the diff that satisfies the standard?
- Is the value actually sensitive or safely redacted before the sink?
- Is the async work intentionally sequential or bounded by a documented contract?
- Is the apparent broad type narrowed by a surrounding interface?
- Is the runtime/platform behavior already covered by representative tests?
- Is this merely a preference with no behavioral consequence?

Drop or downgrade findings that do not survive.

Completion criterion: final findings have survived an explicit attempt to disprove them.

## Severity labels

- **Blocker** — likely correctness, safety, security, data-loss, runtime, idempotency, boundary, observability, or test-integrity issue in changed code; or a changed path violates a standards non-negotiable with behavioral consequence.
- **Should Fix** — meaningful design, contract, maintainability, diagnosability, or verification issue that should be addressed before merge but is not a blocker.
- **Simplification** — a clearer/deeper/smaller design that removes unnecessary complexity without changing semantics.
- **Nit** — small local issue with low behavioral risk, usually documentation/naming/mechanical cleanup.
- **Question** — unresolved ambiguity where the right call depends on product, domain, operational, or local-convention intent.

## Output format

Start with:

```md
Review target: <target>
Standards loaded: <topic files>
```

If there are no findings, say so briefly and include the standards areas checked. Do not add praise.

For each finding:

```md
### <Severity>: <short title>

- **Issue:** <concise explanation of the defect or problem>
- **Where:** `<file>:<line>` or precise symbol/path
- **Category:** <topic / principle>
- **Problematic code:**
  ```ts
  // real excerpt quoted from the changed file(s)
  ```
- **Proof:** <value flow, reachable state, reproduction with observed result, or missing evidence>
- **Why it matters:** <behavioral consequence>
- **Fix direction:** <specific correction shape, followed by a snippet or pseudo-code showing it>
  ```ts
  // snippet or pseudo-code of the fix; not a full patch unless asked
  ```
```

Include the **Problematic code** block whenever the issue lives in code you can quote; omit it only when the finding is about something absent (e.g. a missing contract or test), and say what is missing instead. Always include a fix-direction snippet or pseudo-code unless the fix is purely a deletion.

Group findings by severity in this order: Blocker, Should Fix, Simplification, Nit, Question.

Completion criterion: the final review is actionable without code edits, every finding includes proof, and no review-only step modified the workspace.
