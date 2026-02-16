# Pi LSP Extension

OpenCode-parity LSP extension for Pi with:

- `lsp` tool (definition/references/hover/symbols/call hierarchy)
- persistent server clients keyed by `serverId::root`
- trust-gated project overrides
- post-edit diagnostics summaries on `write`/`edit`/patch-like tools
- `/lsp` runtime modal + non-UI textual fallback

## Config locations

- Global: `~/.pi/agent/lsp.json`
- Project: `.pi/lsp.json` (nearest from current cwd upward)

Both are optional. Missing files fall back to defaults.

## Built-in server semantics (OpenCode-style)

Even with no explicit `lsp` config, the extension preloads built-ins for common languages:

- `typescript`
- `pyright`
- `gopls`
- `rust-analyzer`
- `clangd`
- `lua`
- `bash`
- `css`

Matching behavior mirrors OpenCode semantics:

- candidate server chosen by file extension
- root resolved via nearest marker search (`roots`)
- optional exclusion markers (`excludeRoots`) short-circuit matching
- `rootMode: "marker-only"` requires marker presence
- default `rootMode: "workspace-or-marker"` falls back to workspace root

Project/global config can override or disable these built-ins by server ID.

Auto-bootstrap behavior:

- if built-in binary is missing, npm-backed servers are auto-installed into `~/.local/share/pi/lsp-bin`
- currently auto-bootstrapped: `typescript`, `pyright`, `bash`, `css`
- disable auto-install with `OPENCODE_DISABLE_LSP_DOWNLOAD=1` (or `PI_LSP_DISABLE_AUTO_INSTALL=1`)

## Merge behavior (deterministic)

1. Objects deep-merge
2. Scalars replace
3. Arrays replace (no concatenation)
4. `lsp: false` hard-disables all servers
5. Per-server `disabled: true` disables that server

Server config fields:

- `command: string[]`
- `extensions: string[]`
- `roots: string[]` (upward marker search)
- `excludeRoots: string[]` (skip server if found upward)
- `rootMode: "workspace-or-marker" | "marker-only"`
- `env`, `initialization`, `disabled`

## Trust policy

`security.projectConfigPolicy`:

- `trusted-only` (default)
- `always`
- `never`

Project `command`/`env` overrides are only applied when policy allows.

`trustedProjectRoots` semantics:

- `~` expands to `$HOME`
- entries must be absolute after expansion
- plain dirs trust equal/descendant paths
- glob entries match with `picomatch({ dot: true, nocase: win32 })`
- matching uses realpath and fails closed on errors

Blocked project overrides produce warnings in tool result metadata.

## Timing defaults

- `timing.requestTimeoutMs`: `10000`
- `timing.initializeTimeoutMs`: `15000`
- `timing.diagnosticsWaitTimeoutMs`: `3000`

Timeout behavior:

- request timeout sends best-effort `$/cancelRequest`
- timeout is tracked in tool `details.timedOut`
- partial-success is tracked in tool `details.partial`

## `lsp` tool operations

- `goToDefinition` (`filePath`, `line`, `character`)
- `findReferences` (`filePath`, `line`, `character`)
- `hover` (`filePath`, `line`, `character`)
- `goToImplementation` (`filePath`, `line`, `character`)
- `documentSymbol` (`filePath`, `line`, `character`)
- `workspaceSymbol` (`filePath`, `line`, `character`)
- `prepareCallHierarchy` (`filePath`, `line`, `character`)
- `incomingCalls` (`filePath`, `line`, `character`)
- `outgoingCalls` (`filePath`, `line`, `character`)

All operations require `filePath`, `line`, and `character` (1-based positions).

Output semantics match OpenCode:

- if result array is empty: `No results found for <operation>`
- otherwise: pretty JSON of the result array (`JSON.stringify(result, null, 2)`)
- no matching server: throws `No LSP server available for this file type.`

Additional diagnostics are still available in tool `details` (`errors`, `timedOut`, `partial`, `warnings`).

## Path policy

- accepts absolute, cwd-relative, and leading-`@` paths
- strips exactly one leading `@`
- resolves path, then `realpath`
- enforces workspace/worktree boundary unless `security.allowExternalPaths=true`

## Post-edit diagnostics append

`tool_result` hook behavior:

- `write`/`edit`/patch-like tools:
  - extract changed paths
  - normalize paths with same path policy as the tool
  - `touchFile(path, true)`
  - append bounded diagnostics summary to tool output
- `read`:
  - `touchFile(path, false)` warm-only, best effort

Summary caps:

- changed files first
- up to `N=3` related files
- per-file diagnostics cap
- total summary char budget cap

`tool_execution_end` is side-effect-only and never mutates output.

## `/lsp` modal

Command: `/lsp`

- UI mode: centered overlay
- non-UI mode: concise textual summary

Keys:

- `↑/↓` or `j/k`: move
- `Enter`: toggle details
- `/`: filter mode
- `Esc`: exit filter or close modal
- `q`: close
- `Ctrl+R` / `r`: refresh
- `g` / `G`: first/last row
- `?`: help legend

## Failure modes and graceful degradation

- Missing language server binary: spawn failure is tracked in broken map with backoff
- Request timeout: marked timed out, best-effort cancel issued
- Diagnostics timeout: edit flow continues with cached diagnostics
- Untrusted project override: blocked fields ignored with warnings
- No matching server for extension: no-op on warm/touch paths

## Troubleshooting

### Missing language servers

Verify binaries are installed and available in `PATH`:

- `typescript-language-server --stdio`
- `pyright-langserver --stdio`
- `gopls`
- `rust-analyzer`
- `clangd --background-index --clang-tidy`
- `lua-language-server`
- `bash-language-server start`
- `vscode-css-language-server --stdio`

If missing, the extension will auto-install npm-backed built-ins (`typescript`, `pyright`, `bash`, `css`) into `~/.local/share/pi/lsp-bin` unless auto-install is disabled.

Or provide explicit `command` per server in config.

To disable a built-in server:

```json
{
  "lsp": {
    "typescript": { "disabled": true }
  }
}
```

### Trust-policy blocked overrides

If project `command`/`env` overrides are ignored:

1. check `security.projectConfigPolicy`
2. ensure project root matches an absolute `trustedProjectRoots` entry
3. verify glob patterns and realpath behavior

### Timeout / backoff behavior

If server roots are marked broken:

- retries use exponential backoff (5s base, 2x, 60s cap, ±20% jitter)
- success resets broken state
- config reload also resets broken state

Use `/lsp` to inspect broken/spawning/connected status in real time.
