# opencode-cloudflare

Thin Pi provider for OpenCode's Cloudflare-hosted work gateway:

- provider: `opencode.cloudflare.dev`
- authentication and discovery: `https://opencode.cloudflare.dev`
- inference: `https://gateway.opencode.cloudflare.dev`

The extension registers a complete native Pi `Provider`. Pi owns credential storage, dynamic catalog persistence, mixed-API dispatch, and protocol conversion. The extension owns only gateway-specific authentication, trusted discovery, and the smallest request wrappers the gateway requires.

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

Then run `/login opencode.cloudflare.dev` once in Pi. The login flow imports the usable OpenCode token and Pi persists it.

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

## Commands

- `/opencode-cf-doctor` — verify credential presence, live discovery, backends, and model count without printing secrets

Model metadata overrides belong in Pi's normal `models.json`.

## Development

From `~/.dotfiles/home/.pi`:

```sh
npm run check --workspace=pi-extension-opencode-cloudflare
```
