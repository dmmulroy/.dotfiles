# opencode-cloudflare

Pi extension that exposes OpenCode's Cloudflare-hosted gateway as a single provider:

- provider: `opencode.cloudflare.dev`

It supports:

- native Pi `/login`
- importing existing OpenCode auth from `~/.local/share/opencode/auth.json`
- routed Anthropic / OpenAI / Google / Workers AI access through `https://opencode.cloudflare.dev`
- the service's provider allowlists/blacklists, so intentionally blocked gateway models are not advertised in Pi

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

## Local model overlays

Add local, machine-specific OpenCode-shaped provider model entries in:

```sh
~/.pi/agent/opencode-cloudflare.local.jsonc
```

The file is intentionally not tracked by this dotfiles repo. Override the path with:

```sh
export OPENCODE_CLOUDFLARE_LOCAL_CONFIG=/path/to/overlay.jsonc
```

Example shape:

```jsonc
{
  "provider": {
    "<gateway-provider>": {
      "models": {
        "<model-id>": {
          "id": "<request-model-id>",
          "name": "<Display Name>",
          "attachment": true,
          "reasoning": true,
          "limit": {
            "context": 128000,
            "output": 32000
          },
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        }
      }
    }
  }
}
```

Provider keys are normalized the same way as the gateway config, including aliases such as `cloudflare-workers-ai`. Local model entries may also provide Pi-specific `thinkingLevelMap` and `compat` fields and `cost.cache_write` for accurate adaptive-thinking behavior and usage reporting. For OpenAI Responses models, `options.text.verbosity` may set an explicit `low`, `medium`, or `high` response verbosity.

### Programmatic Tool Calling

Eligible OpenAI Responses models can opt into OpenAI-hosted Programmatic Tool Calling:

```jsonc
{
  "provider": {
    "openai": {
      "models": {
        "<overlay-model-id>": {
          "id": "<upstream-request-model-id>",
          "options": {
            "programmatic_tool_calling": {
              "allowed_callers": ["direct", "programmatic"]
            }
          }
        }
      }
    }
  }
}
```

Use `["programmatic"]` to make every active Pi function tool program-only, or `["direct", "programmatic"]` to allow both invocation modes. Other shapes fail startup rather than silently weakening the policy. Absence of the option leaves the model on Pi AI's standard OpenAI Responses adapter.

Generated JavaScript runs only in OpenAI's isolated hosted V8 runtime. The extension never executes it locally. Client-owned calls are projected into ordinary Pi tool calls, so tool interceptors, approval hooks, mutation queues, rendering, and session persistence remain active. Tool results are returned as strings; image-only results use a textual placeholder because Pi does not expose a truthful tool output schema.

The selected upstream model and Cloudflare AI Gateway route must support the Programmatic Tool Calling preview. Check the OpenAI model page and probe the configured gateway route before relying on it. Requests remain stateless with `store: false`; opaque program, caller, reasoning, program-output, and final-message state is persisted in Pi message signatures for resume, reload, fork, and branch replay. `store: false` does not enable Zero Data Retention by itself; ZDR eligibility depends on the OpenAI organization or project and the complete request path.

Only enable programmatic access for tools whose repeated model-directed use is acceptable. Pi still validates arguments and applies its normal permission boundaries to every nested call.

For example, a private adaptive Anthropic model that is not yet in Pi's built-in catalog can be exposed immediately using placeholders rather than a real private model ID:

```jsonc
{
  "provider": {
    "anthropic": {
      "models": {
        "anthropic/<private-adaptive-model-id>": {
          "id": "<private-adaptive-request-id>",
          "name": "Private Adaptive Anthropic Model",
          "attachment": true,
          "reasoning": true,
          "thinkingLevelMap": { "xhigh": "xhigh" },
          "compat": { "forceAdaptiveThinking": true },
          "cost": { "input": 5, "output": 25, "cache_read": 0.5, "cache_write": 6.25 },
          "limit": { "context": 1000000, "output": 128000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

## Commands

- `/opencode-cf-status` — show Pi/OpenCode auth status, whether the catalog is using live well-known config or fallback defaults, the last fetch result, and catalog counts
- `/opencode-cf-sync-auth` — copy the current OpenCode token into Pi auth storage, then reload
- `/opencode-cf-doctor` — refetch `.well-known/opencode`, report live config diagnostics, and validate the extension state

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

## Notes

- The extension uses a single custom Pi API (`opencode-cloudflare`) and dispatches each request to the appropriate built-in Pi streamer, except opted-in OpenAI Programmatic Tool Calling routes, which use the extension's stateless Responses adapter.
- Structured gateway JSON failures are translated into actionable Pi errors, such as prompting `/login opencode.cloudflare.dev` or `/opencode-cf-sync-auth` for rejected Access tokens.
- Anthropic gateway requests use the Anthropic SDK with explicit `authToken`, producing `Authorization: Bearer <token>` plus `cf-access-token`; the old `provider: "github-copilot"` auth shim is no longer used.
- If you refresh your OpenCode token outside of Pi while Pi is already running, use `/reload` so Pi refreshes its cached fallback token command.
- The gateway auth flow is allowlisted to `https://opencode.cloudflare.dev` only. Native `/login` accepts only a gateway-provided `cloudflared access login ... -app=https://opencode.cloudflare.dev` argument array; remote shell command strings or different app targets are refused.
