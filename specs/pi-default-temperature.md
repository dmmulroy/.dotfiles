# Feature Spec: Configurable Model Temperature in Pi

**Status:** Proposed (implementation-ready)
**Date:** 2026-02-19
**Type:** Feature plan
**Effort:** M

## Problem Statement

**Who:** Pi CLI users (interactive and print mode) who want more deterministic or more creative model output.

**What:** Pi currently exposes model selection and thinking level, but not temperature as a first-class setting/flag in the coding-agent UX.

**Why it matters:**
- Users cannot tune sampling behavior without patching code.
- Deterministic workflows (review/refactor) and exploratory workflows (brainstorming) benefit from different temperature settings.
- `@mariozechner/pi-ai` already supports `temperature`; Pi just doesn’t surface it.

## Proposed Solution

Add a first-class **temperature control** in `@mariozechner/pi-coding-agent` with:

1. **Persistent setting**: `defaultTemperature` in settings JSON (global/project, project overrides global).
2. **One-shot CLI override**: `--temperature <number>`.
3. **Runtime wiring**: pass effective temperature into every LLM call in the agent loop.

### Key design choice

Implement this in the coding-agent layer (no required changes to `pi-ai` provider APIs, which already support `temperature`).

To keep scope tight and avoid adding new numeric controls in TUI immediately:
- **In scope**: settings JSON + CLI flag.
- **Out of scope (v1)**: `/settings` menu UI control for temperature.

## Scope & Deliverables

| Deliverable | Effort | Depends On |
|---|---|---|
| D1. Settings schema + manager support (`defaultTemperature`) | S | - |
| D2. CLI flag support (`--temperature`) + precedence rules | S | D1 |
| D3. Agent session wiring to pass effective temperature to model calls | M | D1, D2 |
| D4. Docs + help text + tests | M | D1–D3 |

## Non-Goals (Explicit Exclusions)

- Add temperature slider/input to interactive `/settings` UI in v1.
- Add per-model temperature overrides in `models.json`.
- Persist temperature changes as session timeline events.
- Change compaction/branch-summary internal summarization behavior in v1.

## Data Model

### New setting

```json
{
  "defaultTemperature": 0.2
}
```

- Type: `number`
- Validation: finite numeric value (no coercion from string)
- Semantics: if undefined, provider/model defaults remain unchanged.

### Precedence

1. CLI `--temperature`
2. Project `.pi/settings.json` `defaultTemperature`
3. Global `~/.pi/agent/settings.json` `defaultTemperature`
4. `undefined` (provider default behavior)

## API / Interface Contract

### CLI

New flag:

```bash
pi --temperature 0.2 "Prompt..."
```

Behavior:
- If parseable finite number: applied for current process only.
- If invalid: warning + ignored (consistent with existing warning behavior for invalid CLI values).

### SettingsManager

Add to `Settings` interface:
- `defaultTemperature?: number`

Add accessors:
- `getDefaultTemperature(): number | undefined`
- `setDefaultTemperature(value: number | undefined): void` (for API symmetry; may not be used by v1 UI)

### Session/Agent wiring

`createAgentSession` computes effective temperature using precedence and ensures LLM calls include it when defined.

Internal contract:
- When defined, pass `{ temperature }` into `streamSimple` options for normal agent turns.
- When undefined, do not send temperature (preserve provider defaults).

## Detailed Design Notes

1. **Argument parsing**
   - Extend args parser with `temperature?: number`.
   - Update `--help` output and README option table.

2. **Session option plumbing**
   - Extend `CreateAgentSessionOptions` with optional `temperature`.
   - In `main`, set `sessionOptions.temperature` from CLI when present.

3. **Effective temperature resolution**
   - In `createAgentSession`, resolve:
     - `options.temperature ?? settingsManager.getDefaultTemperature()`

4. **LLM call injection**
   - Ensure resolved temperature is supplied on each normal agent turn call.
   - Preserve explicit per-call override if introduced later (`streamOptions.temperature ?? resolvedTemperature` pattern).

5. **No v1 change to compaction calls**
   - Compaction currently calls `completeSimple` directly for summarization.
   - Leave unchanged in v1 for deterministic behavior and smaller scope.

## Likely Files Touched (upstream monorepo paths)

- `packages/coding-agent/src/cli/args.ts`
- `packages/coding-agent/src/main.ts`
- `packages/coding-agent/src/core/sdk.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/docs/settings.md`
- `packages/coding-agent/README.md`
- tests under `packages/coding-agent/src/**/__tests__` (or package test layout)

## Acceptance Criteria

- [ ] Users can set `defaultTemperature` in settings JSON and Pi applies it to normal model calls.
- [ ] Project settings override global settings for `defaultTemperature`.
- [ ] `--temperature` overrides settings for the current invocation.
- [ ] Invalid `--temperature` values are warned and ignored (no crash).
- [ ] When no temp is configured, Pi sends no explicit temperature.
- [ ] Docs and CLI help mention the new setting/flag with examples.

## Test Strategy

| Layer | What | How |
|---|---|---|
| Unit | CLI parsing | parse valid/invalid `--temperature` values |
| Unit | Settings manager | `getDefaultTemperature` returns finite number or `undefined` |
| Unit | Precedence | CLI > project > global > undefined |
| Integration | Request options wiring | mock stream function and assert `temperature` option is passed when expected |
| Regression | No-config behavior | assert no `temperature` key when unset |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider-specific temperature constraints differ | Medium | Medium | Keep validation minimal (finite number) and surface provider errors clearly |
| Unexpected behavior change due to non-default temp | Medium | Medium | Default remains unset; only user opt-in enables it |
| Scope creep into UI/rpc | Medium | Low | Explicitly defer interactive `/settings` numeric control to follow-up |

## Trade-offs Made

| Chose | Over | Because |
|---|---|---|
| Settings + CLI only in v1 | Full TUI setting editor support | Faster delivery, lower UX complexity for numeric input |
| Coding-agent layer wiring | Cross-package refactor in `pi-agent-core` | `pi-ai` already supports `temperature`; minimal surface-area change |
| Leave compaction unchanged | Applying temp to all internal calls | Reduces risk to summarization quality and keeps scope bounded |

## Success Metrics

- Users can reliably set deterministic configs (e.g., `defaultTemperature: 0` or low value) without patching code.
- No regressions in default behavior for users who do not set temperature.
- Support questions around “does Pi support temperature?” can point to documented setting + CLI flag.

---

**Spec output:** Ready for task breakdown and implementation.
