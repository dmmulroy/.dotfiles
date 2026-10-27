# herdr-codemode

Pi extension that exposes [@herdr/sdk](https://github.com/dmmulroy/herdr-ts-sdk) to codemode scripts as `tools.herdr_*`, one tool per SDK operation.

```js
const snap = await tools.herdr_session_snapshot({});
const pane = await tools.herdr_panes_split({ paneId: snap.focusedPaneId, direction: "right" });
await tools.herdr_panes_sendText({ paneId: pane.id, text: "pnpm test\n" });
const done = await tools.herdr_panes_waitForOutput({
  paneId: pane.id,
  source: "recent",
  match: { type: "regex", value: "passed|failed" },
  timeoutMs: 120000,
});
return done.timedOut ? "no result yet" : done.match.matchedLine;
```

## Tool surface

- **Names** mirror the SDK path: `herdr.panes.sendText` → `herdr_panes_sendText`.
- **Only `herdr_search` is listed** in the codemode description (about 180 tokens on every turn, and only inside Herdr), following Cloudflare's Code Mode MCP server. Every operation tool is `deferred`: it is callable but never listed. Scripts discover tools this way:
  - `herdr_search({})` returns the usage instructions and a table of contents (namespaces with tool counts, about 800 tokens).
  - `herdr_search({ query, namespace?, limit? })` returns up to `limit` ranked hits (default 8) as `{ name, description, destructive? }`, plus `total`.
  - `describeTool(name)` returns one tool's full signature.
  - The instructions tell the agent to search, describe, and call in one script and return only the result, so discovery stays out of context.
- **Waits** (`panes_waitForOutput`, `agents_wait`, `events_wait`) require `timeoutMs`, because Herdr waits forever without one. They resolve to `{ timedOut: true }` when Herdr reports its `timeout` code, and to `{ timedOut: false, match | agent | event }` otherwise. Every other failure, including `agents_prompt`'s `timeout` and `agent_prompt_stalled`, rejects with the SDK error tag first.
- **Conventions** (parameters, deadlines, results, error tags) live once in the namespace instructions: `describeNamespace("herdr")`.
- **Schemas** come from the SDK's Effect Schemas: parameters are one flat object, and results are plain JSON in which `Option` becomes `null`.
- **Annotations**: reads and waits are `readOnlyHint`; closes, clears, `layouts_apply`, server stop/handoff, worktree removal, integration uninstall, and plugin unlink are `destructiveHint`.
- **Not exposed**: `events.subscribe`, `clientShell.*`, and `server.sshAgent.*`. They hold a connection open for a caller-owned scope, which a request/response tool cannot do.

Tools register only inside Herdr (`HERDR_ENV=1`, `HERDR_SOCKET_PATH`, or `HERDR_SESSION`). Set `PI_HERDR_CODEMODE=1` to force them on, or `0` to turn them off. The SDK runtime is built on the first call and disposed of on `session_shutdown`.

## Vendored SDK

`@herdr/sdk` is not on npm yet, so `vendor/herdr-sdk/` holds its built bundle, type declarations, wire schema, and wire result-type map. `VENDORED.md` records the source commit. To refresh, run:

```bash
npm run vendor:herdr-sdk            # defaults to ~/Code/personal/herdr-sdk
npm run vendor:herdr-sdk -- <path>  # or a specific checkout
```

The runtime dependencies `effect`, `@effect/platform-node-shared`, and `ajv` are pinned in `package.json` to the versions the SDK declares. Keep them in sync when re-vendoring.

## Checks

```bash
npm run check   # tsc + node:test against an isolated fixture socket (never a live Herdr)
```
