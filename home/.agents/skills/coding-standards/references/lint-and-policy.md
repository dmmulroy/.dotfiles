# Lint policy and prevention

Use this reference when changing lint policy, writing a custom rule, or evaluating cleanup tooling. [Parsing](parsing-and-schemas.md), [type safety](typescript-safety.md), and [cohesion](modules-services-and-adapters.md#cohesive-complexity-reduction) own engineering behavior; this reference owns how to enforce it honestly.

## Establish actual enforcement

Read the active root configuration, command/task graph, installed plugin entrypoints, and pinned plugin API. Identify what runs, which paths it checks, which source copies are deliberately ignored, and which rules are only proposals. Keep rule catalogs and numeric thresholds in configuration rather than maintaining a second document cache.

Distinguish native type-aware diagnostics from JavaScript custom rules. An AST/scope API with empty `parserServices` cannot query TypeScript inference merely because root typechecking is enabled. Such a rule can prove only its supported syntactic/local-binding cases; imported results, encoded schema types, and interprocedural provenance need stronger tooling or review.

**Complete when:** every enforcement claim names its actual configuration/implementation owner, and every proposed rule states the evidence its API can and cannot observe.

## Choose the prevention mechanism

| Problem | Appropriate evidence |
| --- | --- |
| Known type widened through an explicit annotation or local assertion chain | Conservative AST/binding rule with clear limits; native type-aware checks for semantic cases. |
| Impossible guard on an established value | Native unnecessary-condition diagnostics, reviewed against runtime trust and intentional constant loops. |
| Generated decoder exposes incidental parse options | A narrow exported-decoder-factory candidate, resolving import/export aliases and distinguishing deliberate low-level codecs from application parsers. |
| Duplicate validation, extra reads, or fail-open legacy parsing | Producer/invariant review and observable regression tests; syntax-equivalent calls may own different checks. |
| Unused exported parser/helper | Consumer-aware workspace audit, including public/dynamic/type-only entrypoints. |
| Excessive cyclomatic complexity | Actual repository ceiling plus cohesive refactoring review; the count does not establish correct ownership or simpler caller reasoning. |

These are mechanism choices, not instructions to enable new rules automatically. A native unnecessary-condition pilot must preserve legitimate runtime validation and intentional loops; use the pinned rule's supported constant-loop option when appropriate. An exported-decoder rule needs a policy for genuine low-level unknown codecs before broad activation. Avoid autofixes that require provenance or public-API decisions the rule cannot establish.

## Verify policy changes

Use the lint tool's real rule-test harness and exercise the actual root configuration, not a duplicated approximation of it. Include import/export aliases, accepted domain code, unrelated same-name APIs, and false-positive boundaries. For a numeric ceiling, test an accepted boundary and a rejected value immediately above it.

If maintained plugin sources or installer assets are excluded from ordinary application lint/format, verify those owned copies explicitly. Keep distribution identity checks separate from project-only tooling tests.

For semantic cleanup, follow [regression tests](testing.md#parsing-and-recovery-regressions) and [public inference](testing.md#compile-time-behavior). Record whether work was removed, parsing was merely retyped, or an API surface was narrowed. A clean lint run, a lower count, and a passing fixture establish different evidence.

**Complete when:** rules have positive/negative fixtures and actual-root enforcement evidence; all owned source copies are accounted for; remaining semantic limitations and diagnostics are reported; and documentation distinguishes installed policy from candidates without weakening safety or public contracts.
