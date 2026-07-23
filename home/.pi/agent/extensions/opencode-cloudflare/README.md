# opencode-cloudflare

Pi provider for OpenCode's Cloudflare-hosted gateway:

- provider: `opencode.cloudflare.dev`
- authentication and discovery: `https://opencode.cloudflare.dev`
- inference: `https://gateway.opencode.cloudflare.dev`
- backends: Anthropic, OpenAI, Google, xAI, and Workers AI

## Design

The extension is an adapter around Pi's native provider implementations:

1. `config.ts` parses untrusted discovery and local-overlay data into a precise runtime configuration.
2. `config-store.ts` owns two-step discovery, authenticated remote-config I/O, fallback policy, cancellation, caching, and diagnostics for one extension runtime.
3. `catalog.ts` projects the gateway allowlists, denylists, model metadata, and routes into Pi model registrations.
4. `auth.ts` owns token import, redaction, expiry, Cloudflare Access login, and Pi credential storage.
5. `stream.ts` resolves a route and delegates protocol behavior to Pi's native Anthropic, OpenAI Responses, Google, or OpenAI-compatible streamer.
6. `index.ts` is the composition root and command adapter.

There is no module-global runtime cache, import-time I/O, or hand-written substitute for Pi's provider protocols. Every backend uses Pi's native provider conversion while gateway authentication remains isolated in request headers. Authentication and discovery stay on `opencode.cloudflare.dev`; inference requests use the Access-protected AI Gateway at `gateway.opencode.cloudflare.dev`.

## Authentication

Interactive login:

```text
/login
# choose: OpenCode Cloudflare
```

Reuse OpenCode authentication:

```sh
opencode auth login https://opencode.cloudflare.dev
```

Then run `/login opencode.cloudflare.dev` once in Pi. The login flow imports the usable OpenCode token and Pi's model runtime persists it for subsequent sessions.

Configured provider catalogs refresh in the background when `/model` opens, and immediately with `pi update --models`.

Optional explicit token override:

```sh
export OPENCODE_CLOUDFLARE_TOKEN=...
```

Optional OpenCode auth-file override:

```sh
export OPENCODE_CLOUDFLARE_AUTH_FILE=/path/to/auth.json
```

Without an override, token import checks:

- `$XDG_DATA_HOME/opencode/auth.json`
- `~/.local/share/opencode/auth.json`

## Local model overlays

Machine-specific OpenCode-shaped model entries may be added in:

```sh
~/.pi/agent/opencode-cloudflare.local.jsonc
```

Override that location with:

```sh
export OPENCODE_CLOUDFLARE_LOCAL_CONFIG=/path/to/overlay.jsonc
```

Example:

```jsonc
{
  "provider": {
    "openai": {
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
          },
          "options": {
            "text": { "verbosity": "medium" },
            "reasoning": { "context": "all_turns" }
          }
        }
      }
    }
  }
}
```

Known fields are parsed at the boundary. Invalid known fields fail startup instead of being silently trusted. Unknown provider metadata is ignored.

## Commands

- `/opencode-cf-status` — show auth, discovery-cache, and catalog status
- `/opencode-cf-doctor` — require live discovery and report gateway diagnostics

## Development

From `~/.dotfiles/home/.pi`:

```sh
npm run check --workspace=pi-extension-opencode-cloudflare
```

The check runs a package-scoped strict TypeScript build plus behavioral tests across configuration, authentication, and every backend route.
