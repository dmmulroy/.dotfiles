# Cua Driver — dotfiles integration

## Transport

Use the persistent `computer` MCP server, configured as `cua-driver mcp` in
`home/.pi/agent/mcp.json`. Its tools have the `computer_` prefix. Prefer MCP
for GUI workflows here; CLI is for installation, diagnostics, and isolated
inspection. Do not mix one-shot CLI calls into an MCP action sequence.

Discover with `mcp({ search: "...", server: "computer" })`, describe an
unfamiliar tool once, then reuse its schema. Pass `mcp.args` as serialized JSON:

```text
mcp({ tool: "computer_get_window_state", args: "{\"pid\":844,\"window_id\":10725}" })
```

The installed tool schemas are authoritative when upstream examples disagree.
Use exact window IDs and fresh snapshot-bound element tokens. Verify after
each action; never retry text insertion before inspecting whether it landed.
On a connection error, reconnect once and rediscover. On a permission error,
stop and ask the human to grant the required OS permission.

## Helium identity

For Helium (`net.imput.helium`), choose the profile before navigation:

- Work account, company domain, internal service → **work**.
- Personal account, finance, shopping, personal service → **personal**.
- Ambiguous identity or mixed accounts → ask which profile.

Select the exact window, inspect its profile control, and confirm the intended
profile or signed-in account marker is visible before proceeding. Prefer an
already-correct window. Do not assume Cua's Chromium browser binding supports
Helium; use native window tools when exact binding is unavailable. Read
[BROWSER.md](BROWSER.md) before using browser preparation or typed browser tools.
Never enable remote debugging or widen existing-profile authorization merely
to work around a refusal.

## Desktop and data safety

Prefer a purpose-built API, CLI, or filesystem operation for non-GUI outcomes.
Use Cua for authenticated UI, desktop-only work, and visual verification.

Keep background delivery and the visible agent cursor. Ask before foreground
or desktop takeover unless the user already authorized it for this workflow.
This also applies to temporarily activating native menu operations. Do not
substitute AppleScript or global-pointer tools after a Cua refusal.

Do not enable recordings/history or widen runtime permissions automatically.
Installation uses standard permission mode; telemetry is disabled locally.

## Upstream provenance and updates

Installed with `vpx skills add` from `trycua/cua`, tag
`cua-driver-rs-v0.24.0`, path `libs/cua-driver/rust/Skills/cua-driver`.
The source, ref, and folder hash are recorded in `home/.agents/.skill-lock.json`.
The upstream pack is retained, with a local entry-point note in `SKILL.md`.
On updates, preserve this file and that note; review guidance against the
installed binary. The lock tracks a release tag, not rolling main.

Canonical files live under `home/.agents/skills/cua-driver/`; the live skill
must be a Stow symlink. Do not install duplicate copies under `.pi/agent/skills`.
