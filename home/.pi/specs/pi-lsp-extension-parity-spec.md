## Feature: Pi LSP Extension (OpenCode-Parity)

### Problem Statement
**Who:** Pi users doing multi-file coding workflows in IDE-less terminal sessions.

**What:** Pi currently lacks first-class LSP capabilities (definition, references, hover, symbols, call hierarchy, diagnostics) and post-edit diagnostics feedback comparable to OpenCode.

**Why it matters:** Without LSP, code navigation and correctness feedback are slower, more manual, and more error-prone. This hurts both agent quality (tool context quality) and user DX (confidence + speed).

**Evidence:**
- OpenCode ships an integrated LSP tool + lifecycle orchestration (`tool/lsp.ts`, `lsp/index.ts`, `lsp/client.ts`, `lsp/server.ts`).
- Pi extension API supports all required integration points: custom tools, lifecycle events, tool hooks, and post-edit interception (`tool_call`, `tool_result`, `tool_execution_end`).

# Progress

> Implementation tracking checklist. Check boxes only after code is merged and validation/tests for that item pass.

## 0) Scaffolding & sequencing
- [x] Create `agent/extensions/lsp/` directory structure (`index.ts`, `types.ts`, `config.ts`, `schema.ts`, `server.ts`, `client.ts`, `runtime.ts`, `tool.ts`, `hooks.ts`, `README.md`).
- [x] Add shared type exports in `types.ts` for `LspOperation`, `LspToolInput`, `LspToolResult`, and panel snapshot types.
- [x] Wire entrypoint stub in `index.ts` so extension loads without runtime errors.
- [x] Add temporary status logging for startup/shutdown during early development.
- [x] Define test directory layout for unit/integration/perf fixtures.

## D1) Config schema + loader (merge + trust + timing)
- [x] Implement TypeBox schema for `LspServerConfig`.
- [x] Implement TypeBox schema for `LspSecurityConfig`.
- [x] Implement TypeBox schema for `LspTimingConfig`.
- [x] Implement TypeBox schema for root `LspConfigFile`.
- [x] Validate `projectConfigPolicy` enum (`trusted-only`/`always`/`never`).
- [x] Validate timeout fields are positive integers.
- [x] Implement global config loader for `~/.pi/agent/lsp.json`.
- [x] Implement project config loader for `.pi/lsp.json`.
- [x] Implement safe “file missing = default” behavior for both config locations.
- [x] Implement JSON parse error reporting with file path context.
- [x] Implement deterministic merge: object deep-merge.
- [x] Implement deterministic merge: scalar replace.
- [x] Implement deterministic merge: array replace (no concat).
- [x] Implement `lsp: false` hard-disable behavior.
- [x] Implement per-server `disabled: true` precedence.
- [x] Implement `~` expansion for `trustedProjectRoots` entries.
- [x] Enforce absolute-path requirement for trust entries post-expansion.
- [x] Implement candidate project root resolution via `realpath`.
- [x] Implement plain-directory trust matching (equal/descendant).
- [x] Implement glob trust matching with documented `picomatch` options.
- [x] Implement fail-closed behavior on trust matcher errors.
- [x] Implement trust gating for project `command` override.
- [x] Implement trust gating for project `env` override.
- [x] Emit warning metadata/log when project overrides are blocked by policy.
- [x] Unit test: object/scalar/array merge semantics.
- [x] Unit test: `lsp: false` and per-server disabled precedence.
- [x] Unit test: trust policy matrix (`trusted-only`/`never`/`always`).
- [x] Unit test: trust matcher symlink/realpath behavior.
- [x] Unit test: invalid trust entries fail closed.

## D2) Server registry + root resolution + spawning
- [x] Implement server-definition registry loader from merged config.
- [x] Implement extension-to-server candidate lookup.
- [x] Implement root marker search upward from file path.
- [x] Implement fallback root selection when markers are absent.
- [x] Implement normalized server-root key (`${serverId}::${root}`).
- [x] Implement spawn command resolution from server config.
- [x] Implement spawn env assembly (base env + server env).
- [x] Implement spawn error normalization (structured error object).
- [x] Implement lightweight capability capture from `initialize` result.
- [x] Unit test: root discovery by markers.
- [x] Unit test: root fallback behavior.
- [x] Unit test: extension matching picks expected servers.

## D3) JSON-RPC client wrapper
- [x] Implement JSON-RPC transport over stdio.
- [x] Implement request id generation and in-flight request map.
- [x] Implement initialize handshake with timeout (`initializeTimeoutMs`).
- [x] Implement initialized notification after successful handshake.
- [x] Implement `didOpen` with initial document version.
- [x] Implement `didChange` with monotonic version increments.
- [x] Implement diagnostics subscription (`textDocument/publishDiagnostics`).
- [x] Implement diagnostics cache update per file URI.
- [x] Implement generic request timeout (`requestTimeoutMs`).
- [x] Implement best-effort `$/cancelRequest` on request timeout.
- [x] Implement timeout error mapping (`code: "ETIMEDOUT"`).
- [x] Implement `touchFile(..., true)` diagnostics wait with timeout (`diagnosticsWaitTimeoutMs`).
- [x] Implement cancellation-aware diagnostics wait (abort exits early).
- [x] Unit test: initialize timeout path.
- [x] Unit test: request timeout sends cancel notification.
- [x] Unit test: diagnostics wait timeout falls back gracefully.

## D4) Runtime orchestrator (clients/spawning/broken/lifecycle)
- [x] Implement `clients` map lifecycle.
- [x] Implement `spawning` map lifecycle.
- [x] Implement `broken` map with attempts/retryAt/lastError.
- [x] Implement spawn de-duplication via shared promise per key.
- [x] Implement broken-key backoff (5s base, 2x, 60s cap, ±20% jitter).
- [x] Implement retry reset on successful request.
- [x] Implement retry reset on config change reload.
- [x] Implement `getClients(file)` orchestrator selector.
- [x] Implement `run(file, requestFn)` helper.
- [x] Implement `runAll(requestFn)` helper.
- [x] Implement `diagnostics()` aggregation helper.
- [x] Implement `shutdownAll()` sequence: `shutdown` request.
- [x] Implement `shutdownAll()` sequence: `exit` notification.
- [x] Implement `shutdownAll()` sequence: SIGTERM grace.
- [x] Implement `shutdownAll()` sequence: SIGKILL fallback.
- [x] Wire `session_shutdown` event to `shutdownAll()`.
- [x] Integration test: spawn de-dup under concurrent requests.
- [x] Integration test: backoff and recovery behavior.
- [x] Integration test: shutdown sequence leaves no live child processes.

## D5) `lsp` tool operation surface + contracts
- [x] Register `lsp` tool with strict operation-aware input validation.
- [x] Implement path normalization for absolute/cwd-relative paths.
- [x] Implement single leading `@` strip before path resolution.
- [x] Implement `realpath` boundary checks vs workspace/worktree.
- [x] Implement `allowExternalPaths` override handling.
- [x] Implement `goToDefinition` operation.
- [x] Implement `findReferences` operation.
- [x] Implement `hover` operation.
- [x] Implement `goToImplementation` operation.
- [x] Implement `documentSymbol` operation.
- [x] Implement `workspaceSymbol` operation with optional root scoping.
- [x] Implement `prepareCallHierarchy` operation.
- [x] Implement `incomingCalls` operation with call-item fallback derivation.
- [x] Implement `outgoingCalls` operation with call-item fallback derivation.
- [x] Implement `diagnostics` operation.
- [x] Implement stable `LspToolResult<T>` envelope for all operations.
- [x] Populate `meta.empty` for no-result responses.
- [x] Populate `meta.partial` for partial-success responses.
- [x] Populate `meta.timedOut` when timeout occurs.
- [x] Return structured errors (no free-form string-only failures).
- [x] Unit test: operation-specific required field validation.
- [x] Unit test: 1-based to 0-based coordinate conversion.
- [x] Unit test: path policy enforcement including leading `@`.

## D6) Post-edit/read hooks + diagnostics summaries
- [x] Wire `tool_result` hook for `write` tool.
- [x] Wire `tool_result` hook for `edit` tool.
- [x] Wire `tool_result` hook for `apply_patch`-compatible tools.
- [x] Implement changed-path extraction for each supported edit tool.
- [x] Normalize extracted paths with same path policy as tool.
- [x] Call `touchFile(..., true)` for changed files.
- [x] Call `touchFile(..., false)` for `read` warm path.
- [x] Aggregate diagnostics across active clients after touches.
- [x] Implement severity-first ranking for summary lines.
- [x] Prioritize changed file diagnostics before related files.
- [x] Enforce cap: max files in summary (default N=3 beyond touched file).
- [x] Enforce cap: max diagnostics per file.
- [x] Enforce output truncation budget for appended summary.
- [x] Append summary only in `tool_result` mutation phase.
- [x] Ensure `tool_execution_end` performs side effects only.
- [x] Integration test: write/edit append summary behavior.
- [x] Integration test: read warm behavior does not block.
- [x] Integration test: timeout still returns best-effort diagnostics summary.

## D7) Benchmark + parity harness
- [x] Create benchmark fixture workspaces (TS + Python minimum).
- [x] Implement warm latency benchmark (p50/p95).
- [x] Implement cold first-request latency benchmark.
- [x] Implement edit-to-diagnostics latency benchmark.
- [x] Implement post-shutdown process leak benchmark.
- [x] Implement diagnostics-summary token-size benchmark.
- [x] Build OpenCode baseline capture script for same fixtures.
- [x] Produce side-by-side parity report output.
- [x] Mark pass/fail against spec parity thresholds.

## D8) Docs + rollout safeguards
- [x] Document config file locations and merge behavior.
- [x] Document trust policy and trusted-root semantics.
- [x] Document timing defaults and timeout/cancellation behavior.
- [x] Document all `lsp` operations and required fields.
- [x] Document path policy, including leading `@` normalization.
- [x] Document diagnostics append behavior and truncation caps.
- [x] Document failure modes and graceful degradation behavior.
- [x] Add troubleshooting section for missing language servers.
- [x] Add troubleshooting section for trust-policy blocked overrides.
- [x] Add troubleshooting section for timeout/backoff behavior.

## D9) TUI modal (`/lsp`) + non-UI fallback
- [x] Implement `getLspPanelSnapshot()` in `runtime.ts`.
- [x] Include configured-but-idle rows in snapshot output.
- [x] Include disabled servers in snapshot output.
- [x] Include spawning roots and broken/backoff state in snapshot output.
- [x] Include diagnostics aggregate counts in snapshot output when available.
- [x] Implement deterministic snapshot row sorting.
- [x] Create `lsp-panel.ts` component scaffold.
- [x] Implement panel title + totals header rendering.
- [x] Implement row list rendering with width-safe truncation.
- [x] Implement selected-row highlighting.
- [x] Implement details/expand view for selected row.
- [x] Implement filter mode (`/`) and query state.
- [x] Implement key handling: `↑/↓` + `j/k`.
- [x] Implement key handling: `Enter` toggle expand.
- [x] Implement key handling: `Esc` close filter/modal.
- [x] Implement key handling: `q` close modal.
- [x] Implement key handling: `Ctrl+R` and `r` refresh.
- [x] Implement key handling: `g` / `G` first/last row.
- [x] Implement key handling: `?` help/legend toggle.
- [x] Register command `/lsp` (only command) in `index.ts`.
- [x] Open modal with centered overlay options from spec.
- [x] Implement non-UI fallback textual summary for `/lsp`.
- [x] Implement empty state (`no servers configured`).
- [x] Implement empty filter state (`no rows match filter`).
- [x] Add optional polling refresh only while modal is open.
- [x] Ensure timers/listeners are cleared on modal close.
- [x] Ensure timers/listeners are cleared on `session_shutdown`.
- [x] Integration test: `/lsp` overlay render and key handling.
- [x] Integration test: `/lsp` non-UI summary path.

## Final verification & sign-off
- [x] Run full unit test suite.
- [x] Run full integration test suite.
- [x] Run parity benchmark suite and capture report artifact.
- [x] Validate all Acceptance Criteria checkboxes in this spec.
- [x] Perform final reviewer pass on updated implementation.
- [x] Update spec status from "pending review" to approved/implemented state. (implemented)

---

### Discovery Summary
**Explored:**
- `agent/lsp-deep-dive.md` (OpenCode architecture deep dive)
- OpenCode source:
  - `packages/opencode/src/tool/lsp.ts`
  - `packages/opencode/src/lsp/index.ts`
  - `packages/opencode/src/lsp/client.ts`
  - `packages/opencode/src/lsp/server.ts`
  - `packages/opencode/src/config/config.ts` (LSP config shape)
- Pi docs/APIs:
  - `docs/extensions.md`
  - `docs/settings.md`
  - `dist/core/extensions/types.d.ts`

**Key findings:**
1. OpenCode’s strength is not only the `lsp` tool, but persistent server/client orchestration keyed by `{serverID, root}` with spawn de-duplication and broken-server tracking.
2. OpenCode quality depends heavily on document synchronization (`didOpen`/`didChange`) and async diagnostic aggregation/debounce.
3. Pi extension API can fully support parity architecture:
   - Register `lsp` tool
   - Use `tool_result` for output mutation (post-edit diagnostics append)
   - Use `tool_execution_end` for side effects only (telemetry/cleanup, no output mutation)
   - Warm on read hooks
   - Keep per-session state and clean shutdown.
4. Pi settings are not a typed extension config surface; extension-specific config should use a dedicated `lsp.json` merge model (global + project), while optionally supporting compatibility with settings-based overrides later.

---

### Constraints Inventory
- Must be extension-based (no core fork required for v1).
- Must support all requested operations in v1.
- Must include post-edit diagnostics hooks for `write`/`edit` and apply-patch-like tools if present.
- Must avoid process leaks and avoid duplicate server spawns.
- Must keep context/token growth from diagnostics bounded.
- Must enforce trust policy for project-local config before honoring `command`/`env` overrides.
- Must use deterministic config merge semantics (deep merge objects, replace arrays).
- Must define explicit timeout/cancellation behavior for LSP requests and diagnostics waits.

---

### Solution Space

| Option | Description | Pros | Cons |
|---|---|---|---|
| Simplest | Stateless `lsp` tool shelling out to ad-hoc CLI per request | Fast to build | Fails parity/perf goals; no persistent diagnostics |
| Balanced (recommended) | Extension-local orchestrator + persistent clients + diagnostics cache + post-edit hooks | Achieves OpenCode parity with manageable complexity | Moderate implementation complexity |
| Full engineering | Core-level Pi LSP subsystem + native UI/status integrations | Strong long-term platform fit | Over-scope for requested spec, higher maintenance and migration cost |

**Recommendation:** Balanced approach: extension-local orchestrator mirroring OpenCode architecture.

---

### Proposed Solution
Implement a Pi extension package that provides:
1. A formal `lsp` tool with operation routing and structured output.
2. An internal LSP orchestrator managing server definitions, root resolution, process lifecycle, and client pools.
3. A JSON-RPC LSP client wrapper handling `initialize`, document sync, versioning, diagnostics subscriptions, and bounded wait-for-diagnostics behavior.
4. Edit/read lifecycle hooks that mirror OpenCode behavior:
   - `write` / `edit` / `apply_patch`-compatible tools: `touchFile(waitForDiagnostics=true)` then attach bounded diagnostics summary.
   - `read`: `touchFile(waitForDiagnostics=false)` warming only.
5. A mergeable config model using `~/.pi/agent/lsp.json` + `.pi/lsp.json` (deterministic merge; project overrides global except trust-gated `command`/`env`), with an OpenCode-like per-server schema.
6. A Pi overlay TUI panel (`/lsp`) to inspect configured + active LSP servers and runtime health, following the same extension-overlay pattern used by `pi-mcp-adapter`.

This keeps implementation self-contained, testable, and distributable as a Pi package/extension while meeting parity requirements.

---

### Scope & Deliverables

| Deliverable | Effort | Depends On |
|---|---:|---|
| D1. LSP config schema + loader (deterministic global/project merge + trust policy) | M | - |
| D2. LSP server registry + root resolution + spawn abstraction | L | D1 |
| D3. JSON-RPC client wrapper (`initialize`, `didOpen`, `didChange`, diagnostics cache) | L | D2 |
| D4. Orchestrator state (`clients`, `spawning`, `broken`, lifecycle) | L | D3 |
| D5. `lsp` tool with full operation surface | M | D4 |
| D6. Post-edit/read hooks + diagnostics summarization policy | L | D4, D5 |
| D7. Benchmark + parity harness against OpenCode baselines | L | D5, D6 |
| D8. Docs + rollout safeguards + troubleshooting guide | M | D1-D7 |
| D9. TUI LSP panel modal (`/lsp`) + non-UI fallback summary | M | D4-D6 |

Total expected effort: **XL**

---

### Non-Goals (Explicit Exclusions)
- Core Pi internal refactor to native LSP subsystem in v1.
- Full UI parity with IDE visual diagnostics gutters.
- Perfect “better in all measures” across every language/server immediately without staged benchmarking.
- Auto-installing/downloading every language server in v1 without explicit trust/supply-chain policy.

---

### Data Model

```ts
type LspOperation =
  | "goToDefinition"
  | "findReferences"
  | "hover"
  | "documentSymbol"
  | "workspaceSymbol"
  | "goToImplementation"
  | "prepareCallHierarchy"
  | "incomingCalls"
  | "outgoingCalls"
  | "diagnostics";

interface LspPosition {
  filePath: string;   // abs/cwd-relative or Pi-style @-prefixed, normalized before use
  line: number;       // 1-based input, normalized to 0-based internally
  character: number;  // 1-based input, normalized to 0-based internally
}

interface LspCallHierarchyItemRef {
  uri: string;
  range: unknown;
  selectionRange: unknown;
  name: string;
  kind: number;
  detail?: string;
  data?: unknown;
}

type LspToolInput =
  | ({ operation: "goToDefinition" | "findReferences" | "hover" | "goToImplementation" | "prepareCallHierarchy" } & LspPosition)
  | ({ operation: "documentSymbol" | "diagnostics"; filePath: string })
  | ({ operation: "workspaceSymbol"; query: string; filePath?: string })
  | ({ operation: "incomingCalls" | "outgoingCalls" } & (
      { callHierarchyItem: LspCallHierarchyItemRef; filePath?: string }
      | LspPosition
    ));

interface LspServerConfig {
  disabled?: boolean;
  command?: string[];
  extensions?: string[];
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  roots?: string[];            // root marker filenames/patterns
}

interface LspSecurityConfig {
  projectConfigPolicy?: "trusted-only" | "always" | "never"; // default: trusted-only
  trustedProjectRoots?: string[];                                  // absolute dirs or absolute globs (normative semantics below)
  allowExternalPaths?: boolean;                                    // default: false
}

interface LspTimingConfig {
  requestTimeoutMs?: number;          // default: 10000
  diagnosticsWaitTimeoutMs?: number;  // default: 3000 (used when waitForDiagnostics=true)
  initializeTimeoutMs?: number;       // default: 15000
}

interface LspConfigFile {
  lsp?: false | Record<string, LspServerConfig>;
  security?: LspSecurityConfig;
  timing?: LspTimingConfig;
}

interface LspToolResult<T = unknown> {
  ok: boolean;
  operation: LspOperation;
  data: T;
  errors?: Array<{ serverId: string; message: string; code?: string }>;
  meta: {
    durationMs: number;
    serverHits: number;
    partial: boolean;
    timedOut?: boolean;
    empty?: boolean;
    truncated?: boolean;
  };
}

interface BrokenServerState {
  attempts: number;
  retryAt: number; // epoch ms
  lastError: string;
}

interface LspClientState {
  serverId: string;
  root: string;
  diagnostics: Map<string, Diagnostic[]>;
  versions: Map<string, number>;
}

interface LspRuntimeState {
  clients: Map<string, LspClientState>;        // key `${serverId}::${root}`
  spawning: Map<string, Promise<LspClientState | undefined>>;
  broken: Map<string, BrokenServerState>;      // failed server-root keys with backoff
}
```

---

### API/Interface Contract

#### Tool contract
- **Tool name:** `lsp`
- **Input validation:** strict operation-aware schema

| Operation | Required fields | Optional fields | Behavior |
|---|---|---|---|
| `goToDefinition`, `findReferences`, `hover`, `goToImplementation`, `prepareCallHierarchy` | `filePath`, `line`, `character` | - | Position-based request against resolved document |
| `documentSymbol`, `diagnostics` | `filePath` | - | File-scoped request |
| `workspaceSymbol` | `query` | `filePath` | If `filePath` present, scope to its resolved root; otherwise query all active roots |
| `incomingCalls`, `outgoingCalls` | `callHierarchyItem` **or** (`filePath`, `line`, `character`) | - | If position provided, run `prepareCallHierarchy` first and use first returned item; error if none |

- **Path policy (required):**
  1. Accept absolute, cwd-relative, and Pi-style leading-`@` paths.
  2. Strip exactly one leading `@` before normalization.
  3. Resolve against `ctx.cwd`, normalize, then `realpath`.
  4. Enforce boundary policy: path must be within workspace/worktree root unless `security.allowExternalPaths=true`.
  5. Reject missing/non-readable files for file-scoped operations with structured error.

- **Output schema (stable v1):** tool always returns a JSON string encoding `LspToolResult<T>`.
  - `ok=true` with `meta.empty=true` for no-result responses (not a string message).
  - `meta.partial=true` when some server responses fail but at least one succeeds.
  - `meta.timedOut=true` when one or more request/wait timeouts occur.

#### Timeout & cancellation contract (normative)
- **Initialize timeout:** default 15000ms (`timing.initializeTimeoutMs`).
- **Per-request timeout:** default 10000ms (`timing.requestTimeoutMs`) for LSP requests (`definition`, `references`, `hover`, etc.).
- **On request timeout:**
  1. send `$/cancelRequest` for the in-flight request id (best effort)
  2. record structured timeout error (`code: "ETIMEDOUT"`)
  3. continue with other servers/requests when possible (partial response allowed)
- **Diagnostics wait timeout:** `touchFile(..., true)` waits up to default 3000ms (`timing.diagnosticsWaitTimeoutMs`) for fresh diagnostics for touched files.
- **Cancellation behavior:** if host/tool cancellation occurs while waiting, stop waiting immediately and return best-effort partial result.

#### Result data shapes (stable)
- `goToDefinition`, `findReferences`, `goToImplementation`: `Array<LocationLike>`
- `hover`: `{ contents: string[]; range?: RangeLike }`
- `documentSymbol`, `workspaceSymbol`: `Array<SymbolLike>`
- `prepareCallHierarchy`: `Array<LspCallHierarchyItemRef>`
- `incomingCalls`, `outgoingCalls`: `Array<CallHierarchyEdgeLike>`
- `diagnostics`: `Record<string, Diagnostic[]>`

#### Internal contracts
- `getClients(file): Promise<LspClientState[]>`
- `touchFile(file, waitForDiagnostics?: boolean): Promise<void>`
- `diagnostics(): Promise<Record<string, Diagnostic[]>>`
- `resolveCallHierarchyItem(input): Promise<LspCallHierarchyItemRef>`
- `run(file, requestFn)` / `runAll(requestFn)` helper execution model
- `shutdownAll(): Promise<void>`

#### Tool-hook contracts
- `tool_result` is the **only** hook that mutates tool output.
  - For `write`, `edit`, and `apply_patch`-compatible tools:
    - run `touchFile(..., true)` for touched files
    - append bounded diagnostics summary to the tool result payload
  - For `read`:
    - run `touchFile(..., false)` (warming only)
- `tool_execution_end` is side-effect-only (telemetry, cleanup, scheduling) and never mutates output.

Diagnostics append policy:
- edited file first, then at most N additional files (default N=3)
- max diagnostics per file capped
- output truncation enforced

### Process Lifecycle Guarantees
- **Spawn de-dup key:** `${serverId}::${root}`. Concurrent requests share one spawn promise.
- **Backoff policy (required):** exponential retry with jitter for broken keys.
  - base delay: 5s, multiplier: 2x, max delay: 60s, jitter: ±20%
  - retries reset on successful request or config change
- **No unbounded waits:** all initialize/request/diagnostics waits must be governed by configured timeouts.
- **Shutdown policy (required):**
  1. send LSP `shutdown` request (timeout 1500ms)
  2. send LSP `exit` notification (best-effort, timeout 500ms)
  3. if process still alive, send SIGTERM (grace 2000ms)
  4. if still alive, force kill (SIGKILL)

---

### Post-Edit Diagnostics Behavior

1. In `tool_result` (output-mutation phase), detect changed paths from tool input/result:
   - `write`: input path
   - `edit`: input path
   - `apply_patch`-compatible: parse touched paths from tool details/content when available
2. Normalize each path using the path policy (including leading-`@` stripping and workspace boundary checks).
3. Touch files with `waitForDiagnostics=true` (bounded by `timing.diagnosticsWaitTimeoutMs`, default 3000ms).
4. Aggregate diagnostics cache across active clients.
5. Filter + rank:
   - include changed file(s) first
   - include small number of highest-severity related files
6. Render concise diagnostics summary back into tool output.

Fallback behavior:
- If no LSP server available for file type: no-op (never hard-fail edit path).
- If LSP request errors: degrade gracefully; mark server-root as temporarily broken with backoff.
- If diagnostics wait times out: continue with best-available cached diagnostics, set timeout metadata, never block edit flow.
- `tool_execution_end` may run non-mutating follow-up work only (e.g., telemetry, background warms).

---

### Configuration Model (Pi-fit + OpenCode parity)

#### Files
- Global: `~/.pi/agent/lsp.json`
- Project: `.pi/lsp.json`

#### Merge semantics (deterministic)
1. Objects: deep-merge by key.
2. Scalars: project value replaces global value.
3. Arrays: project value **replaces** global array (no concatenation).
4. `lsp: false` disables all servers regardless of lower-level values.
5. Per-server `disabled: true` wins for that server.
6. Project `command`/`env` overrides are applied only if trust policy permits.

#### Security / trust policy (required)
- Default: `security.projectConfigPolicy = "trusted-only"`.
- `trusted-only`: allow project `.pi/lsp.json` to override `command`/`env` only when project root matches `security.trustedProjectRoots`.
- `never`: ignore project `command`/`env` always.
- `always`: allow project `command`/`env` overrides (explicit opt-in; least safe).
- When blocked by policy, ignore unsafe fields and emit a clear warning in logs/tool metadata.

#### Trusted root matching semantics (normative)
1. Compute candidate project root as `realpath(dirname(.pi/lsp.json))` (or workspace root when no project file).
2. Expand `~` in each `trustedProjectRoots` entry to `$HOME`.
3. Reject non-absolute trust entries after expansion (invalid config error).
4. Normalize both candidate and trust entries to POSIX-style separators (`/`) and remove trailing `/`.
5. Plain directory entries (no glob metacharacters): trust when candidate is equal to entry or a descendant of entry.
6. Glob entries: evaluate against candidate using `picomatch` with `{ dot: true, nocase: process.platform === "win32" }`.
7. Symlink safety: trust decisions are based on candidate **realpath** only; unresolved/symlink alias paths are not used for allow decisions.
8. If matching fails or any normalization step errors, treat project as untrusted (fail closed).

#### Example (global `~/.pi/agent/lsp.json`)
```json
{
  "security": {
    "projectConfigPolicy": "trusted-only",
    "trustedProjectRoots": ["~/Code/personal/**", "~/Code/work/**"],
    "allowExternalPaths": false
  },
  "timing": {
    "initializeTimeoutMs": 15000,
    "requestTimeoutMs": 10000,
    "diagnosticsWaitTimeoutMs": 3000
  },
  "lsp": {
    "typescript": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      "roots": ["package.json", "tsconfig.json"],
      "initialization": {
        "typescript": { "preferences": { "includeCompletionsForModuleExports": true } }
      }
    },
    "pyright": {
      "command": ["pyright-langserver", "--stdio"],
      "extensions": [".py"],
      "roots": ["pyproject.toml", "setup.cfg", "requirements.txt"]
    },
    "eslint": {
      "disabled": true
    }
  }
}
```

Rationale: mirrors OpenCode’s per-server shape while fitting Pi extension constraints, adds explicit trust boundaries, defines timeout/cancellation behavior, and keeps behavior predictable via deterministic merge rules.

---

### Acceptance Criteria
- [x] `lsp` tool supports all v1 operations listed in scope with operation-specific required-field validation.
- [x] Position-based operations correctly map 1-based input to 0-based LSP protocol coordinates.
- [x] `workspaceSymbol` requires `query` and supports optional `filePath` root scoping.
- [x] `incomingCalls`/`outgoingCalls` accept either `callHierarchyItem` or derive it from position via `prepareCallHierarchy`.
- [x] Path normalization strips one leading `@`, resolves safely, and enforces workspace boundary policy.
- [x] `write`/`edit` trigger post-edit diagnostics with bounded summary output via `tool_result`.
- [x] `tool_execution_end` performs side effects only and never mutates returned tool output.
- [x] `read` warms LSP document state without blocking for diagnostics.
- [x] `/lsp` opens an interactive centered overlay panel in UI mode and lists configured + active server state.
- [x] `/lsp` in non-UI mode returns a concise textual status summary instead of trying to render a modal.
- [x] Request/initialize/diagnostics waits honor explicit timeout defaults (10s / 15s / 3s) unless overridden by `timing` config.
- [x] On request timeout, best-effort `$/cancelRequest` is issued and result metadata marks timeout/partial outcomes.
- [x] Clients are reused by `{serverId, root}` and duplicate spawns are prevented.
- [x] Broken server-root keys follow defined exponential backoff policy and recover on success/config change.
- [x] Session shutdown follows `shutdown` → `exit` → SIGTERM → SIGKILL sequence with timeouts.
- [x] Tool output always conforms to stable `LspToolResult<T>` JSON envelope.
- [x] Config merge behavior is deterministic (objects deep-merge, arrays replace) and validated.
- [x] `trustedProjectRoots` matching follows normative realpath/glob semantics and fails closed on errors.
- [x] Project-local `command`/`env` overrides are blocked unless allowed by explicit trust policy.
- [x] No uncaught extension errors under missing-server, bad-root, malformed-response, timeout, or blocked-policy conditions.
- [x] Benchmark harness demonstrates parity or better vs OpenCode baselines for defined targets.

---

### Test Strategy

| Layer | What | How |
|---|---|---|
| Unit | Config parse/merge semantics (object deep-merge, array replace), operation validation, coordinate conversion | Vitest/Jest unit suite |
| Unit | Trust policy gating for project `command`/`env` overrides | policy matrix tests (`trusted-only` / `never` / `always`) |
| Unit | Trusted-root matcher semantics (absolute entry checks, glob behavior, symlink realpath, fail-closed) | fixture matrix with plain paths, globs, symlink aliases, invalid entries |
| Unit | Path normalization (`@` stripping), `realpath`, workspace boundary enforcement | temp-fs path fixtures + symlink cases |
| Unit | Timeout + cancellation behavior (`initialize`, request, diagnostics wait) | fake timers + mocked JSON-RPC transport validating `$/cancelRequest` |
| Unit | Spawn de-duplication + broken-key backoff behavior | deterministic async tests with mocked spawner/time |
| Integration | JSON-RPC protocol lifecycle (`initialize`, `didOpen`, `didChange`, diagnostics) | test LSP server fixture |
| Integration | `incomingCalls`/`outgoingCalls` derivation via `prepareCallHierarchy` fallback | call-hierarchy-capable fixture server |
| Integration | Hook contract: `tool_result` mutation vs `tool_execution_end` side effects | extension event simulation harness |
| Integration | `/lsp` overlay panel rendering + key handling (`j/k`, `Enter`, `/`, `Esc`, `Ctrl+R`) | TUI harness with deterministic snapshot fixtures |
| Integration | Shutdown sequence (`shutdown`/`exit`/TERM/KILL) and leak prevention | controlled child-process harness |
| E2E | Real TS + Python workspaces with trusted/untrusted project config variants | scripted Pi sessions invoking tool + edits |
| Perf | Cold/warm latency + edit-to-diagnostics + process/memory profile | parity benchmark harness against OpenCode |

---

### Performance / Parity Targets

OpenCode-comparison targets (same machine/workspace class):
- Warm request latency (p50/p95): **<= OpenCode + 5%**
- Cold first-request latency: **<= OpenCode + 10%**
- Edit-to-diagnostics visible latency (p95): **<= 3.5s**
- No leaked LSP server processes after session shutdown
- Diagnostics summary token overhead per edit: bounded configurable cap (default <= 2KB text)

If targets are missed, release gate blocks “parity” claim and requires mitigation cycle.

---

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Untrusted project config executes arbitrary commands/env | Medium | High | default `trusted-only` policy, explicit allowlist, ignore+warn on blocked overrides |
| Language server ecosystem variance (install paths, protocol quirks) | High | High | per-server adapters + explicit known-good server matrix |
| Process leaks / zombie servers | Medium | High | centralized lifecycle manager + required shutdown sequence + leak tests |
| Hung/slow LSP requests stall tool execution | Medium | High | explicit initialize/request/diagnostics timeouts + best-effort cancellation + partial responses |
| Diagnostics noise overwhelms context | High | Medium | strict summarization caps + severity-first ordering + truncation |
| Performance regression from aggressive touching | Medium | Medium | debounce, per-file cooldown, warm-path caching |
| Path traversal/out-of-workspace reads | Low | High | `realpath` boundary checks, default external-path deny policy |
| Config complexity and user misconfiguration | Medium | Medium | schema validation, deterministic merge rules, clear troubleshooting docs |

---

### Trade-offs Made

| Chose | Over | Because |
|---|---|---|
| Extension-local orchestrator | Pi core patch | faster path, lower blast radius, package distributable |
| Dedicated `lsp.json` | hidden custom settings keys | explicit extension-owned schema + predictable merge |
| `trusted-only` project override policy by default | unrestricted project `command`/`env` execution | safer default for shared/untrusted repos |
| Bounded diagnostics summaries | full raw diagnostics dump | protects context budget + better agent usability |
| Graceful no-op on missing server | hard failure | preserves edit flow reliability |

---

### Open Questions
- [x] Auto-install policy: include OpenCode-like download/bootstrap behavior in v1 or require preinstalled servers? → Owner: product/maintainer
- [x] Default built-in server matrix for parity launch (TS, Python, Rust, Go, etc.)? → Owner: maintainer
- [x] Trust source of truth: should `trustedProjectRoots` remain extension-local or integrate with a broader Pi trust registry if one is introduced? → Owner: maintainer/security

---

### Success Metrics
- Navigation operations usage rate and success rate in real sessions.
- Reduction in post-edit error escape rate (errors discovered later vs immediately after edit).
- Median time-to-fix after edit decreases in LSP-enabled projects.
- User-reported confidence and workflow speed at/above OpenCode baseline.

---

### D9 Detailed Plan (Merged TUI Plan)

This section merges and supersedes `specs/pi-lsp-tui-panel-plan.md`.

#### Goal
Add an interactive centered overlay (`/lsp`) to inspect configured + active LSP servers, runtime health, and diagnostics posture.

#### Runtime Snapshot Contract (`runtime.ts`)
Add a panel-facing read-only API:

```ts
interface LspPanelRow {
  serverId: string;
  source: "global" | "project" | "merged";
  disabled: boolean;
  extensions: string[];
  configuredRoots: string[];
  connectedRoots: string[];
  spawningRoots: string[];
  broken?: { attempts: number; retryAt: number; lastError: string };
  diagnostics?: { error: number; warning: number; info: number; hint: number; total: number };
  lastSeenAt?: number;
}

interface LspPanelSnapshot {
  generatedAt: number;
  rows: LspPanelRow[];
  totals: {
    configured: number;
    connected: number;
    spawning: number;
    broken: number;
    disabled: number;
  };
}
```

Rules:
- Include configured-but-idle servers (not only active clients).
- Deterministic sort: `broken` → `spawning` → `connected` → `idle` → `disabled`, then `serverId`.
- Snapshot reads never mutate runtime state.

#### Panel Component (`lsp-panel.ts`)
- Implement focused modal state machine (selection, optional expand, filter mode, loading/error states).
- Render title, totals, rows, details/legend/help footer.
- Enforce width safety on every line (truncate/pad).
- Prefer shared helpers from `agent/prelude/ui/layout.ts` and `agent/prelude/ui/box.ts`.

#### Command Wiring (`index.ts`)
- Register **only** `/lsp` for this modal.
- Open via `ctx.ui.custom(..., { overlay: true, overlayOptions: { anchor: "center", width: 82, maxWidth: "95%", maxHeight: "80%", margin: 1 } })`.
- Non-UI behavior (`ctx.hasUI === false`): return concise textual snapshot summary (totals + top problematic servers), no modal attempt.

#### Interaction Contract
- `↑/↓` or `j/k`: move selection
- `Enter`: toggle expanded details for selected server
- `/`: enter filter mode
- `Esc`: close filter else close modal
- `q`: close modal
- `Ctrl+R` (and `r`): refresh snapshot
- `g` / `G`: first/last row
- `?`: toggle help/legend

#### Lifecycle / Cleanup
- Optional periodic refresh only while modal is open.
- Clear timers/listeners on close.
- Clear timers/listeners on `session_shutdown`.

#### D9 File Plan
- `agent/extensions/lsp/runtime.ts` — `getLspPanelSnapshot()` + derived state helpers
- `agent/extensions/lsp/lsp-panel.ts` — modal component
- `agent/extensions/lsp/index.ts` — `/lsp` command + overlay + non-UI fallback
- `agent/extensions/lsp/README.md` — `/lsp` usage + keymap + status legend

#### D9 Acceptance Addendum
- `/lsp` opens centered modal in interactive mode.
- Panel shows configured + active servers (including idle/disabled/broken).
- `Ctrl+R` refresh updates data without reopening.
- No timer/listener leaks after close/shutdown.
- Non-UI invocation returns readable textual summary.

---

# Handoff Artifact

# Pi LSP Extension — Implementation Spec

**Status:** Implemented
**Effort:** XL
**Approved by:** implemented
**Date:** 2026-02-18

## Deliverables (Ordered)

1. **D1 Config Schema + Loader (merge + trust policy)** (M)
   - Depends on: -
   - Files likely touched: `agent/extensions/lsp/config.ts`, `agent/extensions/lsp/schema.ts`

2. **D2 Server Registry + Root Resolution** (L)
   - Depends on: D1
   - Files likely touched: `agent/extensions/lsp/server.ts`

3. **D3 JSON-RPC Client Wrapper** (L)
   - Depends on: D2
   - Files likely touched: `agent/extensions/lsp/client.ts`

4. **D4 Runtime Orchestrator** (L)
   - Depends on: D3
   - Files likely touched: `agent/extensions/lsp/runtime.ts`

5. **D5 `lsp` Tool Surface (all operations)** (M)
   - Depends on: D4
   - Files likely touched: `agent/extensions/lsp/index.ts`, `agent/extensions/lsp/tool.ts`

6. **D6 Post-Edit/Read Hooks + Diagnostics Summaries** (L)
   - Depends on: D4, D5
   - Files likely touched: `agent/extensions/lsp/hooks.ts`

7. **D7 Benchmarks + Parity Validation** (L)
   - Depends on: D5, D6
   - Files likely touched: `agent/extensions/lsp/bench/*`

8. **D8 Docs + Rollout** (M)
   - Depends on: D1-D7
   - Files likely touched: `agent/extensions/lsp/README.md`, `docs/lsp-extension.md`

9. **D9 TUI LSP Panel (`/lsp`) + non-UI fallback summary** (M)
   - Depends on: D4-D6
   - See “D9 Detailed Plan (Merged TUI Plan)” above for full interaction contract, lifecycle rules, and file-level plan.

## Key Technical Decisions
- Extension-local orchestration with OpenCode-inspired architecture.
- Dedicated `lsp.json` (global/project) for explicit configuration.
- Deterministic merge semantics (deep-merge objects, replace arrays).
- `trusted-only` default policy for project-local `command`/`env` overrides.
- Normative trusted-root matching semantics (`realpath`, glob rules, fail-closed).
- Explicit timeout/cancellation contract for initialize/request/diagnostics waits.
- Stable `LspToolResult<T>` envelope for all tool responses.
- `tool_result` is the sole output-mutation hook; `tool_execution_end` is side-effect-only.
- D9 panel command/interaction specifics are centralized in “D9 Detailed Plan (Merged TUI Plan)”.
- Event-hooked diagnostics for edits, warming on reads.

## Data Model
(See “Data Model” section above.)

## Acceptance Criteria
(See “Acceptance Criteria” section above.)

## Open Items (Non-Blocking)
- Auto-install policy for language servers.
- Default server matrix for launch.
- Whether to align `trustedProjectRoots` with any future Pi-wide trust registry.

---
*Spec approved for task decomposition after maintainer sign-off.*
