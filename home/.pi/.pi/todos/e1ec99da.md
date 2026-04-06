{
  "id": "e1ec99da",
  "title": "Upgrade pi to 0.65.0 and update pi-mcp lifecycle handling",
  "tags": [
    "pi",
    "upgrade",
    "extensions"
  ],
  "status": "closed",
  "created_at": "2026-04-05T19:04:47.099Z"
}

Done.

- Upgraded global pi installation to 0.65.0 via `vp install -g @mariozechner/pi-coding-agent@0.65.0`
- Upgraded local workspace dependencies in `/Users/dmmulroy/.dotfiles/home/.pi/package.json` and `package-lock.json` to 0.65.0 for `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui`
- Patched `agent/extensions/pi-mcp/src/index.ts` to handle 0.65 session lifecycle semantics safely:
  - added cleanup/dispose helpers
  - tear down existing MCP runtime on every `session_start`
  - guard async init with generation counters to prevent stale init races
  - reuse cleanup on `session_shutdown`
- Verified:
  - `pi --version` => 0.65.0
  - local dependency versions => 0.65.0
  - patch markers present in `pi-mcp` source

Remaining caveat: external package `pi-extmgr@0.1.28` still uses removed `session_switch` event and may need an upstream fix or temporary disablement.
