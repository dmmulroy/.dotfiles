# opencode-cloudflare

Pi extension that exposes OpenCode's Cloudflare-hosted gateway as a single provider:

- provider: `opencode.cloudflare.dev`

It supports:

- native Pi `/login`
- importing existing OpenCode auth from `~/.local/share/opencode/auth.json`
- routed Anthropic / OpenAI / Google / Workers AI access through `https://opencode.cloudflare.dev`

## Usage

With this extension loaded:

```sh
pi -e ./home/.pi/agent/extensions/opencode-cloudflare --list-models opencode.cloudflare.dev
```

Interactive login:

```text
/login
# choose: OpenCode Cloudflare
```

Reuse an existing OpenCode login:

```sh
opencode auth login https://opencode.cloudflare.dev
pi -e ./home/.pi/agent/extensions/opencode-cloudflare --list-models opencode.cloudflare.dev
```

Optional explicit env override:

```sh
export OPENCODE_CLOUDFLARE_TOKEN=...
```

Optional auth file override via environment variable:

```sh
export OPENCODE_CLOUDFLARE_AUTH_FILE=/path/to/auth.json
```

This is used for token import/fallback. If unset, the extension looks in:

- `$XDG_DATA_HOME/opencode/auth.json`
- `~/.local/share/opencode/auth.json`

## Commands

- `/opencode-cf-status` — show Pi/OpenCode auth status and catalog counts
- `/opencode-cf-sync-auth` — copy the current OpenCode token into Pi auth storage, then reload
- `/opencode-cf-doctor` — refetch `.well-known/opencode` and validate the extension state

## Example prompts

Workers AI:

```sh
pi -e ./home/.pi/agent/extensions/opencode-cloudflare -p --provider opencode.cloudflare.dev --model @cf/moonshotai/kimi-k2.5 "Reply with exactly: ok"
```

OpenAI:

```sh
pi -e ./home/.pi/agent/extensions/opencode-cloudflare -p --provider opencode.cloudflare.dev --model gpt-4o "Reply with exactly: ok"
```

Anthropic:

```sh
pi -e ./home/.pi/agent/extensions/opencode-cloudflare -p --provider opencode.cloudflare.dev --model claude-sonnet-4-5 "Reply with exactly: ok"
```

Google:

```sh
pi -e ./home/.pi/agent/extensions/opencode-cloudflare -p --provider opencode.cloudflare.dev --model gemini-2.5-flash "Reply with exactly: ok"
```

## Diagnostics

Anthropic streams can be traced without changing normal logging:

```sh
export OPENCODE_CLOUDFLARE_TRACE_ANTHROPIC=1
```

When enabled, each Anthropic gateway request logs one sanitized JSON line to stderr with response status/headers, a payload summary, raw SSE event names, whether `message_stop` was observed, byte count, and the final 12 KiB of the raw SSE stream. `authorization`, `cf-access-token`, cookies, and set-cookies are redacted.

Use this to distinguish upstream/gateway truncation (`message_stop` absent from the raw SSE tail/events) from local parser/wrapper behavior.

## Notes

- The extension uses a single custom Pi API (`opencode-cloudflare`) and dispatches each request to the appropriate built-in Pi streamer.
- Anthropic gateway requests use the Anthropic SDK with explicit `authToken`, producing `Authorization: Bearer <token>` plus `cf-access-token`; the old `provider: "github-copilot"` auth shim is no longer used.
- If you refresh your OpenCode token outside of Pi while Pi is already running, use `/reload` so Pi refreshes its cached fallback token command.
- The gateway auth flow is allowlisted to `https://opencode.cloudflare.dev` only.
