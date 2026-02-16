# Pi LSP Extension Rollout Notes

This document complements `agent/extensions/lsp/README.md`.

## Rollout safeguards

- default trust mode: `trusted-only`
- blocked project `command`/`env` overrides are logged as warnings
- all waits are bounded (initialize/request/diagnostics)
- broken server roots use exponential backoff with jitter
- shutdown is graceful-first (`shutdown` → `exit` → TERM → KILL)

## Degradation behavior

- missing server binary: tool returns structured errors, edit flow continues
- path outside workspace boundary: rejected unless `allowExternalPaths=true`
- malformed config: file ignored with parse/validation warning
- diagnostics timeout: best-effort summary with timeout note

## Built-in discovery semantics

Without explicit `lsp` config, the extension auto-registers built-ins (`typescript`, `pyright`, `gopls`, `rust-analyzer`, `clangd`, `lua`, `bash`, `css`) and discovers roots via marker search.

Built-ins default to workspace fallback when markers are absent, unless a server is explicitly configured with `rootMode: "marker-only"`.

When built-in binaries are missing, npm-backed servers (`typescript`, `pyright`, `bash`, `css`) are auto-bootstrapped into `~/.local/share/pi/lsp-bin` unless disabled via `OPENCODE_DISABLE_LSP_DOWNLOAD=1` (or `PI_LSP_DISABLE_AUTO_INSTALL=1`).

## Operational checklist

1. Ensure required language server binaries are installed.
2. Disable any unwanted built-ins explicitly in `~/.pi/agent/lsp.json`.
3. Configure trusted roots for repos that need project command/env overrides.
4. Run benchmark harness (`agent/extensions/lsp/bench/run-parity.ts`).
5. Verify `/lsp` panel shows expected runtime status.

## Package/update notes

- Extension root: `agent/extensions/lsp/`
- Tests: `agent/extensions/lsp/tests/`
- Benchmarks: `agent/extensions/lsp/bench/`
