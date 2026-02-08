---
name: feedback-loop
description: Self-validate work through deterministic feedback loops with repro, measurement, and exit criteria. Use when stuck, outcomes unclear, validation needs automation across code, UI/visual, or data pipeline tasks.
---

# Feedback Loop

Create fast, deterministic feedback loops so the agent can self-validate and converge.

## When to Load

- Task stalled or unclear success criteria
- Need reproducible failures or measurable outcomes
- UI/visual or data outputs hard to validate

## Step 0: Discover Repro

Before any loop, find or create the repro command. In an unfamiliar codebase:

1. Check `AGENTS.md`, `README.md`, `CONTRIBUTING.md` for test/dev/build commands
2. Inspect runner configs: `package.json` scripts, `Makefile`, `justfile`, `Taskfile`, `Cargo.toml`, `pyproject.toml`
3. Check CI: `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` for test/build steps
4. Search for test files near affected code: glob `**/*test*.*`, `**/*spec*.*`
5. If no test exists, **write a minimal reproduction script or test first** — this is your first loop iteration

## Loop Selector

| Signal | Loop type | Recipe |
|---|---|---|
| Failing tests, errors, type errors, regressions | Debugging | [loop-recipes.md#debugging](./references/loop-recipes.md) |
| Visual output, animation, layout, rendering | UI/visual | [loop-recipes.md#uivisual](./references/loop-recipes.md) |
| Metrics drift, ETL, data quality | Data pipeline | [loop-recipes.md#data-pipeline](./references/loop-recipes.md) |
| Build/compile errors, dependency issues | Debugging | Use build command as repro |

If multiple match, prefer the loop with the most deterministic measurement.

## Core Loop (every iteration)

1. **Sense**: capture current output + signal (run repro, read watcher output)
2. **Hypothesize**: state suspected cause and what you expect to change
3. **Change**: smallest fix to test hypothesis (one thing at a time)
4. **Measure**: run deterministic check (test, snapshot, metrics query)
5. **Decide**: keep if green, revert if no signal change, iterate with new hypothesis

## Principles

- Convert human-centric signals into text or structured artifacts
- Encode state in parameters so results are deterministic
- Prefer fast, headless runs over slow UI paths
- Allow the agent to add logs/metrics to expose signal
- Separate exploration (agent) from acceptance (human)

## Required Artifacts (non-negotiable)

| Artifact | What | Example |
|---|---|---|
| Repro | Deterministic command or URL | `npm test -- auth`, `agent-browser open localhost:3000` |
| Expected vs observed | Explicit comparison | "expected 200, got 401" |
| Measurement method | Re-runnable check | test runner, `agent-browser snapshot -i`, metrics query |

Full artifact matrix per loop type: [loop-recipes.md](./references/loop-recipes.md)

## Persistent Observability (tmux)

If tmux is available, set up persistent feedback sources in adjacent panes:

| Source | Start command | Read signal |
|---|---|---|
| Test watcher | `npm run test:watch` / `pytest-watch` | `tmux capture-pane -p -J -t {pane} -S -50` then grep PASS/FAIL |
| Dev server | `npm run dev` / `cargo watch -x run` | `tmux capture-pane -p -J -t {pane} -S -50` then grep ERROR |
| Build watcher | `tsc --watch` / `cargo watch -x check` | `tmux capture-pane -p -J -t {pane} -S -50` then grep error |
| Browser | `agent-browser open localhost:3000` | `agent-browser snapshot -i` |

Read from adjacent pane: `tmux capture-pane -p -J -t {pane} -S -50`
Wait for pattern: `while ! tmux capture-pane -p -t {pane} -S -20 | grep -q "pattern"; do sleep 1; done`

This gives continuous feedback without re-running full commands each iteration.

## Artifact Persistence

- **During loop**: keep artifacts in conversation context (fast, ephemeral)
- **On rescope or escalation**: persist to a markdown file for tracking
- **On completion**: include final repro + resolution in commit message or PR description

## Exit Criteria

- Expected output matches observed and measurement is green
- Repro command passes deterministically

## Rescoping (when loop stalls)

If no new signal after 2 iterations:

1. **State what you tried** and why it didn't produce signal
2. **Question your loop type** — wrong category? Re-run selector
3. **Question your repro** — is it actually exercising the bug? Widen scope
4. **Improve observability** — add more logging, check adjacent systems, use tmux watchers
5. **Reduce scope** — find a smaller, more isolated failing case
6. If still stuck: **escalate to user** (see below)

## Loop Switching

If a bug spans domains (e.g., visual symptom but root cause in data/logic):

- Start with the most deterministic measurement
- If 2 iterations produce no signal, switch loop type
- Derive a text/assertion proxy from visual symptoms where possible (e.g., check computed styles, DOM structure, API response instead of screenshot)
- Carry artifacts forward — repro command and observations transfer between loops

## Escalation Triggers

Stop and ask the user when:

- Agent cannot execute measurement (no screenshot tool, no DB access, no metrics)
- Fix requires changes outside agent scope (infra, permissions, external service)
- 3 rescope attempts with no convergence
- Measurement is subjective (visual "looks right", UX feel)

When escalating, provide: repro command, last hypothesis, all artifacts collected.

## Handling Flaky Repros

If the repro is non-deterministic:

- Pin randomness (seed values, `--seed` flags)
- Freeze time (mocks, `faketime`, test fixtures with fixed dates)
- Mock external dependencies (network, APIs, filesystems)
- Run N times to distinguish signal from noise
- Reduce concurrency / isolate the test

## In This Skill

| File | Purpose |
|---|---|
| [loop-recipes.md](./references/loop-recipes.md) | Steps, tooling, artifacts, checklists per loop type |
| [examples.md](./references/examples.md) | Full worked loop iterations with hypotheses + decisions |
