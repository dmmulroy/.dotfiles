# private-gateway

Thin Pi providers for identity-protected inference gateways. Origins are read from the environment; the extension does not register anything when the primary origins are unset.

| Slot | Environment |
| --- | --- |
| Primary | `PRIVATE_GATEWAY_PRIMARY_AUTH_ORIGIN`, `PRIVATE_GATEWAY_PRIMARY_GATEWAY_ORIGIN` |
| Secondary | `PRIVATE_GATEWAY_SECONDARY_AUTH_ORIGIN`, `PRIVATE_GATEWAY_SECONDARY_GATEWAY_ORIGIN` |

Optional display names: `PRIVATE_GATEWAY_PRIMARY_NAME`, `PRIVATE_GATEWAY_SECONDARY_NAME`.

Pi provider ids are the auth-origin hostnames. Shared model ids stay on the primary catalog; the secondary catalog omits those ids. When discovery does not declare backend models, the extension queries each authenticated backend model-list endpoint and falls back to Pi's built-in catalog if that endpoint is unavailable.

## Authentication

Interactive login:

```text
/login
# choose a Private Gateway profile
```

Reuse an existing well-known token by logging into the auth origin, then run `/login <auth-host>` in Pi.

Optional token overrides:

```sh
export PRIVATE_GATEWAY_PRIMARY_TOKEN=...
export PRIVATE_GATEWAY_SECONDARY_TOKEN=...
```

These environment variables are not interchangeable.

Optional auth-file override:

```sh
export PRIVATE_GATEWAY_AUTH_FILE=/path/to/auth.json
```

Without an override, token import checks:

- `$XDG_DATA_HOME/opencode/auth.json`
- `~/.local/share/opencode/auth.json`

Import looks up the Access origin for that profile.

## Commands

- `/private-gateway-doctor` — verify credential presence, live discovery, backends, and model count without printing secrets

## Development

From `~/.dotfiles/home/.pi`:

```sh
npm run check --workspace=pi-extension-private-gateway
```
