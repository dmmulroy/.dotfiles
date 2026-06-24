---
name: improve-codebase-architecture
description: User-invoked workflow for scanning a codebase for deepening opportunities and choosing one to explore.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose deepening opportunities: refactors that turn shallow modules into deep modules with smaller interfaces, clearer seams, better leverage, and stronger locality.

## Steps

1. Load architecture language and domain context.
   - Read `../coding-standards/PRINCIPLES.md`, `../coding-standards/MODULES.md`, and `../coding-standards/VOCABULARY.md`.
   - If present, read `CONTEXT-MAP.md` or `CONTEXT.md` for project domain language.
   - Read ADRs near the area being scanned when they may constrain architecture.
   - Completion criterion: the scan will use module/interface/depth/seam/adapter/leverage/locality and the project's domain terms where available.

2. Explore for friction.
   - Inspect organically; do not follow rigid metric heuristics.
   - Look for shallow modules, pass-through wrappers, wide interfaces, leaked invariants, repeated orchestration, duplicated policy across entrypoints, tests reaching past interfaces, and concepts that require bouncing across many files.
   - Apply the deletion test to suspected shallow modules.
   - Completion criterion: each candidate is tied to concrete files, call paths, tests, or caller burden.

3. Classify each deepening candidate.
   - Name the module or cluster to deepen.
   - Identify the current interface burden and what implementation complexity should move behind the seam.
   - Classify dependencies using `MODULES.md`: in-process, local-substitutable, remote but owned, or true external.
   - State how the deepened interface would be tested: direct behavior test, local stand-in, production/test adapters, or fake external adapter.
   - Completion criterion: every candidate has files, problem, proposed deepening, dependency category, leverage/locality benefit, and test-surface strategy.

4. Present candidates before designing final interfaces.
   - Return concise candidate cards.
   - Include recommendation strength: `Strong`, `Worth exploring`, or `Speculative`.
   - Use small ASCII diagrams only when they clarify a seam better than prose.
   - Mark ADR conflicts only when friction is real enough to justify revisiting the ADR.
   - Do not propose detailed final interfaces yet.
   - Completion criterion: the user can choose which candidate to explore without needing implementation details.

5. Explore the chosen candidate.
   - Grill constraints, dependencies, ownership, seams, and tests before coding.
   - For consequential interfaces, design it twice: use parallel agents when useful to produce materially different interface shapes, then compare by depth, leverage, locality, seam placement, and test surface.
   - As domain language or durable decisions crystallize, read `../domain-modeling/CONTEXT-FORMAT.md` and `../domain-modeling/ADR-FORMAT.md`, then update `CONTEXT.md`/ADRs using those rules.
   - Completion criterion: the chosen candidate has a recommended interface direction, rejected alternatives, verification plan, and any context/ADR updates needed to prevent rediscovery.

## Candidate card shape

```md
### {Candidate title} — {Strong | Worth exploring | Speculative}

- Files: `path`, `path`
- Current friction: why the module/interface is shallow or leaky.
- Deepening: what complexity moves behind which seam.
- Dependency category: in-process | local-substitutable | remote but owned | true external.
- Leverage/locality: what callers and maintainers gain.
- Test surface: how behavior is verified through the new interface.
- ADR/context notes: conflicts or terms to record, if any.
```
