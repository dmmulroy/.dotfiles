# Private gateway

Pi providers for independent identity-protected inference gateways. Profiles and model filters are read from `getAgentDir()/private-gateway.json`; credentials remain in Pi auth storage. Missing configuration registers nothing, and malformed configuration fails without echoing private values.

## Configuration

See `private-gateway.example.json` for the JSON shape. Each profile has:

- `id`: stable, unique Pi provider and credential identity.
- `name`: display label.
- `authOrigin`: HTTPS origin for identity authentication and `/.well-known/opencode`.
- `inferenceOrigin`: HTTPS inference and model-list origin.
- `models.include`: optional exact request model IDs. Omitted means all; `[]` means none.
- `models.exclude`: optional exact request IDs. Exclusion wins.
- `tokenEnvironmentVariable`: optional explicit alternative to Pi-stored credentials.

Profiles are independent. There is no primary/secondary relationship, cross-profile credential lookup, automatic deduplication, or inference failover. To assign models to one route, include them there and exclude them from other profiles.

Configuration must not contain credentials. Use Pi's `/login` or an explicitly named token environment variable.

## Commands

### `/private-gateway-models [profile-id]`

Browse live inventories, compare profiles, and edit exact include/exclude filters. Shared models remain selectable for route-specific behavior. Ctrl+S reviews and saves; Escape discards.

Filter saves resolve stow symlinks, use an exclusive lock, reject stale writers, and atomically replace the mode-0600 settings file. Other agents adopt changes after `/reload`.

### `/private-gateway-doctor [profile-id]`

Performs a live credential and discovery check and reports only ready or failed. It does not put model inventory into the TUI.

### Inventory CLI

```sh
npm run models -- --help
npm run models -- list <profile-id> --config ~/.pi/agent/private-gateway.json
npm run models -- diff <from-id> <to-id> --config ~/.pi/agent/private-gateway.json
```

The CLI is read-only. HTTP failures produce unknown coverage, never an empty catalog.

## Catalog behavior

The well-known endpoint and one authenticated remote config define trusted routes and metadata overlays. Server whitelists restrict membership; blacklists remove models. Without a whitelist, live backend model lists and declarations supply membership. Pi built-ins supply metadata only, never proof of access.

Unsupported list endpoints may fall back to filtered Pi built-ins. Authentication, transient, malformed, pagination, and cancellation failures remain unknown and retain the previous successful catalog. Models without trustworthy token-limit metadata are not exposed.

Pi owns model persistence, inference streaming, tools, retries, and compaction. The extension owns Access authentication, route discovery, inventory, catalog projection, and explicit filtering.

## Authentication

`/login` accepts a token or starts the local browser authentication flow. The fixed local login command does not use a shell. Output is bounded and cancellation/timeout terminates the subprocess. Expired credentials require explicit `/login`; authentication is never launched during an agent turn.

Pi 0.85.1 requires the Access token in its catalog-refresh `apiKey` field. Request adapters remove it from Anthropic API-key authentication and substitute a harmless Google SDK key while retaining Access headers. `gateway-native-apis.mjs` loads public Pi API exports through a native ESM boundary.

Startup model recovery is cached-only, best-effort, and silent. It never replaces an existing CLI or resumed model selection.

## Development

```sh
npm run check
```

Tests use fictional profiles and local TLS servers. They do not contain production credentials or private model IDs.
