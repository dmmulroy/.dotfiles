---
name: code-review
description: User-invoked workflow for reviewing code against my coding standards and preferences.
disable-model-invocation: true
---

# Code Review

Review changed code against the user's standards. Prefer precision over volume: author attention is expensive.

## Steps

1. Load the core review standards.
   - Read `../coding-standards/PRINCIPLES.md`.
   - Read `../coding-standards/REVIEW-LENS.md`.
   - Completion criterion: the review posture, finding bar, severity model, and adversarial check are known before inspecting for findings.

2. Establish the review target.
   - If the user names files, inspect those files and enough callers/tests/adapters to understand the behavior.
   - Otherwise inspect the current diff and touched files.
   - Check nearby local conventions before calling something nonconforming.
   - Completion criterion: every reviewed claim can be tied to changed code or a changed execution path.

3. Load relevant topic standards and map the change to review lenses.
   - Read `../coding-standards/MODULES.md` when the change touches module design, public interfaces, dependency seams, adapters, services, or abstraction seams.
   - Read `../coding-standards/VOCABULARY.md` when terminology or architectural judgment matters.
   - Read `../coding-standards/TYPESCRIPT.md`, `../coding-standards/CLOUDFLARE.md`, or `../coding-standards/EFFECT.md` when changed responsibilities touch those topics.
   - Consider, as applicable: domain integrity, failure/observability, modules/seams, seam integrity, async/workflows, verification, TypeScript contracts, Cloudflare architecture, and Effect mechanics.
   - Do not run a legalistic routing process. Use the lenses as a checklist for investigation.
   - Completion criterion: each material changed responsibility has been considered under its relevant lenses, and each relevant topic file is loaded before judging that responsibility.

4. Investigate before reporting.
   - Reopen source around each concern: callers, types, parsers, tests, adapters, persistence constraints, runtime seams, ADRs, and existing conventions.
   - Search for upstream parsers, smart constructors, existing mitigations, replay records, constraints, cancellation propagation, codecs, and tests before deciding a finding survives.
   - Completion criterion: every candidate finding has concrete evidence, not just a standards keyword match.

5. Challenge each candidate finding.
   - Try to disprove applicability, changed-code causality, consequence, and remediation scope.
   - Reject concerns that are speculative, pre-existing unrelated debt, equivalent-style preference, already mitigated, or require broad migration outside the change.
   - Downgrade or omit issues that lack a concrete author action.
   - Completion criterion: only findings that survive adversarial checking remain.

6. Write the review.
   - Group by root cause and ask for the smallest standards-compliant correction.
   - Allow alternate fixes that satisfy the same obligation.
   - Do not expose internal debate, raw confidence, or checklist noise.
   - Completion criterion: the final review is concise, actionable, and evidence-backed.

## Output shape

Use this shape unless the user requests another format; for tiny reviews, compress it to only the populated sections:

```md
## Findings

### Blockers
- **[lens] Short title** — `path:line`
  - Evidence: changed-code fact.
  - Consequence: concrete failure, leak, invalid state, caller burden, race, duplicate effect, or verification gap.
  - Direction: smallest compliant fix.

### Comments
- Same shape for actionable non-blocking issues.

### Nits
- Only include if genuinely useful and not formatting/style theater.

## Notes
- Relevant checks/tests observed or missing.
- Important lenses considered but not applicable, only when that context helps.
```

If no actionable findings survive, say so directly and mention any important checks you ran or could not run.
