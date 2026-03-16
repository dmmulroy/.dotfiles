# opencode-cloudflare

Pi extension that exposes OpenCode's Cloudflare-hosted gateway as a single provider:

- provider: `opencode.cloudflare.dev`

It supports:

- native Pi `/login`
- importing existing OpenCode auth from `~/.local/share/opencode/auth.json`
- routed Anthropic / OpenAI / Google / Workers AI access through `https://opencode.cloudflare.dev`

## Usage

Install from the local dotfiles path:

```sh
pi install ~/.dotfiles/home/.pi/extensions/opencode-cloudflare
```

With the package installed:

```sh
pi --list-models opencode.cloudflare.dev
```

Interactive login:

```text
/login
# choose: OpenCode Cloudflare
```

Reuse an existing OpenCode login:

```sh
opencode auth login https://opencode.cloudflare.dev
pi --list-models opencode.cloudflare.dev
```

Optional explicit env override:

```sh
export OPENCODE_CLOUDFLARE_TOKEN=...
```

Optional auth file override via `/extension-settings`:

- Open `OpenCode Cloudflare` in `/extension-settings`
- Set `OpenCode Auth File Path` to a custom `auth.json`
- This is used for token import/fallback
- `OPENCODE_CLOUDFLARE_AUTH_FILE` still takes precedence over the setting

## Commands

- `/opencode-cf-status` — show Pi/OpenCode auth status and catalog counts
- `/opencode-cf-sync-auth` — copy the current OpenCode token into Pi auth storage, then reload
- `/opencode-cf-doctor` — refetch `.well-known/opencode` and validate the extension state

## Example prompts

Workers AI:

```sh
pi -p --provider opencode.cloudflare.dev --model @cf/moonshotai/kimi-k2.5 "Reply with exactly: ok"
```

OpenAI:

```sh
pi -p --provider opencode.cloudflare.dev --model gpt-4o "Reply with exactly: ok"
```

Anthropic:

```sh
pi -p --provider opencode.cloudflare.dev --model claude-sonnet-4-5 "Reply with exactly: ok"
```

Google:

```sh
pi -p --provider opencode.cloudflare.dev --model gemini-2.5-flash "Reply with exactly: ok"
```

## Notes

- The extension uses a single custom Pi API (`opencode-cloudflare`) and dispatches each request to the appropriate built-in Pi streamer.
- If you refresh your OpenCode token outside of Pi while Pi is already running, use `/reload` so Pi refreshes its cached fallback token command.
- The gateway auth flow is allowlisted to `https://opencode.cloudflare.dev` only.
