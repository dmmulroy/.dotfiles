# web-tools

Pi extension that registers two public-web tools:

- `webfetch` — fetch one public URL as markdown, text, html, or an inline raster image
- `websearch` — search the public web for current information and candidate URLs

It also adds `/web-profile`, which lets `webfetch` reuse authenticated cookies from a selected Helium browser profile.

## Tools

### `webfetch`

Parameters:

- `url` — required
- `format` — optional: `markdown`, `text`, `html`
- `timeout` — optional timeout in seconds, clamped to `1..120`

Current defaults:

- `defaultFormat`: `markdown`
- `timeoutSeconds`: `30`
- `maxResponseBytes`: `5 MB`
- `blockPrivateHosts`: `true`
- `maxRedirects`: `5`
- `fallbackUserAgent`: `opencode`

Behavior notes:

- only `http://` and `https://` URLs are supported
- private/local hosts and IPs are blocked by default
- raster images (`png`, `jpeg`, `gif`, `webp`) are returned inline as images
- HTML is converted to markdown or text when requested
- binary content is rejected
- if a site returns `403` with `cf-mitigated: challenge`, the tool retries with the fallback user agent
- when `/web-profile` is set to a Helium profile, `webfetch` keeps using normal HTTP requests but injects cookies from that profile
- auth source priority is disk-first by default:
  1. persisted profile cookies from the Helium `Cookies` sqlite DB
  2. live Helium cookies via CDP (`DevToolsActivePort`) when disk-cookie auth fails or a disk-authenticated request still gets `401`/`403`
- successful auth state is cached in memory per selected Helium profile for the current agent session
  - disk-cookie auth uses a short TTL
  - CDP auth uses a longer TTL so repeated authenticated fetches do not reconnect to CDP on every call
  - if a fresh CDP cache already exists, `webfetch` reuses it preferentially until expiry to avoid repeat auth failures and prompts
- if the selected Helium profile cannot be scoped safely through CDP (for example, ambiguous multi-profile state), the extension skips CDP rather than using potentially wrong-profile browser-wide cookies
- if both Helium auth sources fail operationally, `webfetch` fails clearly instead of silently downgrading to public/zero-cookie behavior
- persisted cookie fallback supports Helium's current Chromium-style macOS cookie store, including `v10` blobs backed by the `Helium Storage Key` keychain item and DB version `24` host-key digests
- partitioned cookies (CHIPS / `top_frame_site_key` / CDP `partitionKey`) are currently excluded from header injection until profile-safe partition matching is implemented
- the footer shows the active source as `web: public` or `web: Helium/<display-name>`

### `websearch`

Parameters:

- `query` — required
- `maxResults` — optional, clamped to `1..20`
- `depth` — optional: `auto`, `fast`, `deep` (`deep` is accepted as a compatibility alias and mapped to `fast`)

Current defaults:

- `enabled`: `true`
- `provider`: `exa`
- `endpoint`: `https://mcp.exa.ai/mcp`
- `timeoutSeconds`: `25`
- `defaultMaxResults`: `8`
- `defaultDepth`: `auto`

Behavior notes:

- uses the Exa MCP endpoint
- Exa currently supports provider depths `auto` and `fast`; tool input `deep` is downgraded to `fast`
- search responses are limited to `1 MB`
- provider requests currently send:
  - `livecrawl: "fallback"`
  - `contextMaxCharacters: 2000`

## `/web-profile`

`/web-profile` opens an overlay picker with:

- `Public web`
- discovered Helium profiles from `~/Library/Application Support/net.imput.helium/Local State`

Selection is persisted in `~/.pi/agent/extensions/web-tools.json` and restored on the next reload/startup.

Notes:

- selecting a Helium profile means authenticated fetching is always desired
- no separate authenticated fetch tool is added; the existing `webfetch` tool remains the only fetch entrypoint
- no browser process is launched by the extension

## Configuration

The extension has an internal settings shape:

```ts
{
  fetch: {
    defaultFormat: "markdown" | "text" | "html";
    timeoutSeconds: number;
    maxResponseBytes: number;
    blockPrivateHosts: boolean;
    maxRedirects: number;
    fallbackUserAgent: string;
  };
  search: {
    enabled: boolean;
    provider: "exa";
    endpoint: string;
    timeoutSeconds: number;
    defaultMaxResults: number;
    defaultDepth: "auto" | "fast" | "deep";
  };
}
```

But in the current implementation, these are hardcoded defaults in `settings.ts`.

That means:

- `webfetch.format` and `webfetch.timeout` can be overridden per call
- `websearch.maxResults` and `websearch.depth` can be overridden per call
- the underlying defaults are not currently exposed through Pi settings, extension settings, or env vars

To change the defaults, edit:

- `home/.pi/agent/extensions/web-tools/settings.ts`

## Source of truth

- extension entry: `home/.pi/agent/extensions/web-tools/index.ts`
- settings/defaults: `home/.pi/agent/extensions/web-tools/settings.ts`
- fetch tool: `home/.pi/agent/extensions/web-tools/webfetch.ts`
- search tool: `home/.pi/agent/extensions/web-tools/websearch.ts`
- Exa provider: `home/.pi/agent/extensions/web-tools/providers/exa.ts`
