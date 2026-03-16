# Web Tools Extension Implementation Plan

## Location

Build the extension here:

- `home/.pi/agent/extensions/web-tools/`

This makes it:

- auto-discovered by Pi
- hot-reloadable with `/reload`
- able to manage its own npm deps via a local `package.json`

---

## Primary goal

Create a Pi-native web tools extension with two tools:

- `webfetch` — fetch one URL and return readable content
- `websearch` — search the web for current/public information and candidate URLs

The design should be inspired by OpenCode's `webfetch`/`websearch` behavior and the current Pi port, but improved for:

- Pi tool contracts
- cleaner internals
- stronger HTML handling
- deterministic LLM-facing output
- safer networking
- compatibility with `@juanibiapina/pi-extension-settings`

---

## Key design decisions

## Keep from the current port

- two-tool split: `websearch` then `webfetch`
- `webfetch.format = "markdown" | "text" | "html"`
- Turndown for markdown conversion
- Pi truncation utilities
- `renderCall()` and `renderResult()`
- Exa as the initial search backend
- progress updates with `onUpdate`

## Improve over the current port

- throw errors instead of returning soft `isError` payloads
- replace regex HTML stripping with a real HTML pipeline
- unify markdown/text extraction around the same sanitized HTML
- handle raster images natively in Pi tool results
- reject unsupported binary content instead of decoding garbage
- normalize content-type handling, including XHTML
- write full output to temp files on truncation
- hide search-provider transport behind a provider adapter

## Explicitly avoid

- regex-only HTML parsing
- provider-specific blobs as the public search output
- a custom one-off settings file format
- stale prelude/shared-helper assumptions

---

## Settings compatibility requirement

This extension should be compatible with:

- `https://www.npmjs.com/package/@juanibiapina/pi-extension-settings`

That means:

1. Add `@juanibiapina/pi-extension-settings` as a dependency in `package.json`
2. Register extension settings via the `pi-extension-settings:register` event
3. Read stored values with `getSetting()`
4. Keep setting values string-based at the storage boundary, then parse them into typed runtime config
5. Avoid inventing a parallel config file format for normal extension settings

## Important compatibility choice

The README for `pi-extension-settings` warns about load order when settings are registered at extension load time.

Because this extension will live in `home/.pi/agent/extensions/web-tools/` instead of being installed as an ordered package, we should make registration more robust by:

- emitting the registration event during `session_start`
- optionally also emitting once during factory load only if we add an idempotent guard

### Recommended approach

For v1:

- register settings on `session_start`
- keep registration idempotent in our extension code
- document that `/extension-settings` UI requires the `pi-extension-settings` extension to be installed and loaded

This reduces load-order fragility while remaining compatible with the package.

---

## Settings model

## Extension name in settings

Use:

- `web-tools`

All settings should register under that extension name.

## Storage model

Normal extension settings should come from `pi-extension-settings`, which stores values in:

- `~/.pi/agent/settings-extensions.json`

We should **not** introduce a separate `web-tools.json` config file for v1.

## Source of truth precedence

1. tool parameters
2. parsed values from `getSetting("web-tools", ...)`
3. hardcoded defaults

### Secrets

Secrets should **not** be stored in extension settings.

If we need credentials later, use environment variables only.

---

## Proposed settings

These are the settings to register via `pi-extension-settings:register`.

## Fetch settings

### `fetchDefaultFormat`

- label: `Fetch Default Format`
- default: `markdown`
- values: `markdown`, `text`, `html`

### `fetchTimeoutSeconds`

- label: `Fetch Timeout`
- default: `30`
- values: `10`, `20`, `30`, `60`, `120`

### `fetchMaxResponseMB`

- label: `Fetch Max Response Size`
- default: `5`
- values: `1`, `2`, `5`, `10`

Runtime code will convert MB -> bytes.

### `fetchBlockPrivateHosts`

- label: `Block Private Hosts`
- default: `on`
- values: `on`, `off`

### `fetchMaxRedirects`

- label: `Fetch Max Redirects`
- default: `5`
- values: `0`, `3`, `5`, `10`

### `fetchUserAgent`

- label: `Fetch User-Agent`
- default: `pi-web-tools/1.0`
- free-form string

---

## Search settings

### `searchEnabled`

- label: `Enable Web Search`
- default: `on`
- values: `on`, `off`

### `searchProvider`

- label: `Search Provider`
- default: `exa`
- values: `exa`

### `searchEndpoint`

- label: `Search Endpoint`
- default: `https://mcp.exa.ai/mcp`
- free-form string

### `searchTimeoutSeconds`

- label: `Search Timeout`
- default: `25`
- values: `10`, `15`, `25`, `30`, `60`

### `searchDefaultMaxResults`

- label: `Search Default Max Results`
- default: `5`
- values: `3`, `5`, `8`, `10`

### `searchDefaultDepth`

- label: `Search Default Depth`
- default: `auto`
- values: `auto`, `fast`, `deep`

---

## Typed runtime config

The extension should not pass raw string settings throughout the codebase.

Create a typed runtime config object derived from `getSetting()` values.

Example shape:

```ts
interface WebToolsSettings {
  fetch: {
    defaultFormat: "markdown" | "text" | "html";
    timeoutSeconds: number;
    maxResponseBytes: number;
    blockPrivateHosts: boolean;
    maxRedirects: number;
    userAgent: string;
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

## Parsing helpers needed

Implement setting parsers for:

- boolean values from `on|off`
- integers from string values
- enum validation
- sane fallbacks if a stored value is invalid

If a stored setting is invalid, fall back to the default and optionally notify the user in interactive mode.

---

## End-state behavior

## `webfetch`

### Purpose

Fetch a single URL and return:

- readable markdown
- readable text
- raw HTML/source
- inline raster image result when appropriate

### Inputs

- `url: string`
- `format?: "markdown" | "text" | "html"`
- `timeout?: number` in seconds

### Resolution rules

- `format` param overrides `fetchDefaultFormat`
- `timeout` param overrides `fetchTimeoutSeconds`

### Output modes

#### HTML/text

Return:

- `content: [{ type: "text", text: ... }]`
- structured `details`

#### Raster image

Return:

- `content: [{ type: "text", text: summary }, { type: "image", data, mimeType }]`
- structured `details`

### Requirements

- only accept `http://` and `https://`
- trim input URL before validation
- validate with `new URL()`
- optionally block localhost/private-network targets based on settings
- enforce timeout using tool signal + internal timeout
- enforce max response size while streaming
- handle HTML, XHTML, text, images, and unsupported binary cleanly
- save full output to a temp file if truncated

---

## `websearch`

### Purpose

Search the public web for:

- current information
- relevant pages
- URLs for the model to inspect with `webfetch`

### Inputs

- `query: string`
- `maxResults?: number`
- `depth?: "auto" | "fast" | "deep"`

### Resolution rules

- `maxResults` overrides `searchDefaultMaxResults`
- `depth` overrides `searchDefaultDepth`

### Output

Return a deterministic text summary plus structured normalized results in `details`.

Each result should include at least:

- `title`
- `url`
- `snippet`
- optional metadata like `publishedAt`, `score`, `source`

### Requirements

- do not fetch full pages in `websearch`
- format results so the LLM can easily choose a URL
- only register the tool when `searchEnabled` is `on`
- route backend-specific logic through a provider adapter

---

## Architecture

## Directory layout

```text
home/.pi/agent/extensions/web-tools/
├── IMPLEMENTATION_PLAN.md
├── package.json
├── package-lock.json
├── index.ts
├── settings.ts
├── types.ts
├── network.ts
├── html.ts
├── truncation.ts
├── temp.ts
├── render.ts
├── webfetch.ts
├── websearch.ts
└── providers/
    ├── types.ts
    └── exa.ts
```

---

## File responsibilities

### `index.ts`

- extension entrypoint
- register tools
- register settings metadata on `session_start`
- wire shared settings/runtime helpers into both tools

### `settings.ts`

- import `getSetting` from `@juanibiapina/pi-extension-settings`
- define setting registrations
- emit `pi-extension-settings:register`
- parse raw string settings into typed runtime config
- expose `getWebToolsSettings()`

### `types.ts`

Shared types for:

- runtime settings
- webfetch details
- websearch details
- normalized content classification
- normalized search results

### `network.ts`

Shared networking helpers:

- URL validation/normalization
- optional private-host blocking
- redirect-aware fetch wrapper
- timeout composition with tool abort signal
- streamed body reader with max-byte enforcement
- content-type + charset parsing

### `html.ts`

Shared HTML pipeline:

- parse HTML/XHTML
- isolate `<body>` when present
- remove junk nodes
- absolutize relative links/assets
- serialize sanitized HTML
- convert sanitized HTML to markdown
- convert sanitized HTML to text

### `truncation.ts`

- wrap Pi truncation utilities
- save full output to temp file when needed
- return preview + metadata

### `temp.ts`

- create temp file paths for full-output capture

### `render.ts`

- shared helpers for compact tool-call/result rendering

### `webfetch.ts`

- schema
- fetch implementation
- output classification
- text/image return shaping

### `websearch.ts`

- schema
- provider invocation
- deterministic result formatting
- search tool registration helper

### `providers/types.ts`

- provider interface
- normalized request/response contracts

### `providers/exa.ts`

- Exa-specific transport and parsing
- convert raw provider output into normalized results

---

## Dependency plan

Use a local `package.json`.

## Required deps

### Runtime

- `@juanibiapina/pi-extension-settings`
- `turndown`
- `turndown-plugin-gfm`
- `linkedom`
- `html-to-text`

### Why

#### `@juanibiapina/pi-extension-settings`

- centralized extension settings
- `/extension-settings` compatibility
- simple `getSetting()` helper

#### `turndown` + `turndown-plugin-gfm`

- HTML -> Markdown
- better handling of tables and common markdown patterns

#### `linkedom`

- lightweight DOM parsing/sanitization in Node

#### `html-to-text`

- cleaner text extraction than regex stripping
- preserves structure better than the current port

---

## `webfetch` technical design

## 1. Validation

Rules:

- trim URL
- require explicit `http://` or `https://`
- parse with `new URL()`
- reject malformed URLs

For v1, do **not** auto-prepend `https://` to bare hostnames.

---

## 2. Host blocking

If `fetchBlockPrivateHosts = on`, block:

- `localhost`
- loopback
- private IPv4 ranges
- link-local ranges
- unique local IPv6
- redirect targets that resolve into blocked ranges

This should be implemented in `network.ts`.

---

## 3. Timeout

Compose:

- internal timeout derived from settings or tool param
- Pi's tool abort signal

Timeout must cover the whole operation, not just the initial `fetch()` call.

---

## 4. Byte limit

Do not blindly call `response.arrayBuffer()`.

Instead:

- stream response body
- track bytes incrementally
- throw once limit is exceeded
- only assemble the buffer if still under limit

Default size comes from `fetchMaxResponseMB`.

---

## 5. Content classification

Parse `content-type` into normalized:

- `mime`
- `charset`

### Categories

#### HTML-like

- `text/html`
- `application/xhtml+xml`

#### Text-like

- `text/*`
- selected XML/JSON/text-ish types as needed

#### Raster images

- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`

#### SVG

- `image/svg+xml`

Treat SVG as text/XML, not raster image output.

#### Unsupported binary

Fail clearly for things like:

- zip
- pdf
- octet-stream

---

## 6. Decoding

- use declared charset when supported by `TextDecoder`
- otherwise fall back to UTF-8
- record declared and actual decoder choice in `details`

---

## 7. Shared HTML pipeline

This is the biggest improvement over the current port.

### Pipeline

1. parse document with `linkedom`
2. select `<body>` if present
3. remove junk elements
4. absolutize relative `href`/`src` against final URL
5. serialize sanitized subtree
6. convert sanitized HTML to markdown or text

### Remove at minimum

- `script`
- `style`
- `noscript`
- `template`
- `meta`
- `link`
- `iframe`
- `object`
- `embed`

### Principle

`markdown` and `text` should be two renderings of the same cleaned content, not two unrelated extraction paths.

### Markdown conversion

- use `turndown`
- add GFM plugin
- trim/collapse excess blank lines after conversion

### Text conversion

- use `html-to-text`
- preserve block boundaries
- avoid ugly word wrapping
- normalize whitespace sanely

This avoids the OpenCode-style bugs around:

- head/title leakage
- direct-tail loss after skipped elements
- block-collapse surprises
- branch-sensitive content drift between markdown and text modes

---

## 8. Image handling

For raster images:

- base64-encode response bytes
- return summary text + Pi image content block

Example result shape:

```ts
{
  content: [
    { type: "text", text: "Fetched image from https://... (image/png, 120 KB)" },
    { type: "image", data: base64Data, mimeType: "image/png" }
  ],
  details: { ... }
}
```

---

## 9. Truncation

For text output:

- use `truncateHead`
- if truncated:
  - write full output to a temp file
  - append a truncation notice
  - include `fullOutputPath` in `details`

---

## 10. `webfetch` details shape

```ts
interface WebFetchDetails {
  requestedUrl: string;
  finalUrl: string;
  format: "markdown" | "text" | "html";
  status: number;
  mime: string;
  contentType: string;
  charset?: string;
  decoder?: string;
  bytes: number;
  image?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
}
```

---

## `websearch` technical design

## 1. Public tool API

Use a provider-agnostic schema:

```ts
{
  query: string;
  maxResults?: number;
  depth?: "auto" | "fast" | "deep";
}
```

This is clearer than exposing provider-shaped fields like `type` or `numResults`.

---

## 2. Provider abstraction

Define:

```ts
interface SearchProvider {
  search(input: SearchRequest, signal?: AbortSignal): Promise<NormalizedSearchResult[]>;
}
```

The tool layer should only know about normalized results.

---

## 3. Exa provider

Initial backend:

- `ExaSearchProvider`

Responsibilities:

- build request to configured endpoint
- enforce provider timeout
- parse provider transport format
- convert raw results into normalized result objects

All Exa-specific transport logic stays in `providers/exa.ts`.

---

## 4. Normalized result shape

```ts
interface NormalizedSearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
  score?: number;
}
```

---

## 5. Search result formatting

Format deterministically for the model.

Preferred shape:

```text
Search results for: <query>

1. <title>
   URL: <url>
   Snippet: <snippet>

2. <title>
   URL: <url>
   Snippet: <snippet>
```

Rules:

- always show URL prominently
- keep snippets short
- avoid dumping raw provider payloads
- truncate long output with temp-file fallback

`websearch` should help the model choose a URL for `webfetch`, not act like a scraper.

---

## 6. `websearch` details shape

```ts
interface WebSearchDetails {
  query: string;
  depth: "auto" | "fast" | "deep";
  maxResults: number;
  provider: string;
  resultCount: number;
  truncated?: boolean;
  fullOutputPath?: string;
  results: NormalizedSearchResult[];
}
```

---

## Pi-native behavior

## Error handling

Pi tools should throw on failure.

Throw for:

- invalid URL
- blocked host
- timeout
- response too large
- unsupported binary content
- search provider failure
- malformed provider response

Do not return soft error result objects from the tool implementation.

---

## Prompt integration

Both tools should provide:

- `description`
- `promptSnippet`
- `promptGuidelines`

### `webfetch`

Guidance:

- use when the user gave a URL
- use after `websearch` when a specific page must be read
- prefer `markdown` unless raw HTML/source is explicitly needed

### `websearch`

Guidance:

- use when current web info is needed
- use when the correct URL is unknown
- follow with `webfetch` for the chosen result

---

## Rendering plan

## `renderCall`

### `webfetch`

Compact line with:

- tool name
- URL
- non-default format when present

### `websearch`

Compact line with:

- tool name
- query
- non-default depth and maxResults

## `renderResult`

### Partial

- `Fetching...`
- `Searching...`

### Success

#### `webfetch`

Show:

- success mark
- MIME type
- byte size
- truncation indicator if relevant

Expanded view:

- first N preview lines
- or concise image note
- temp file path if truncated

#### `websearch`

Show:

- success mark
- result count
- truncation indicator if relevant

Expanded view:

- top few formatted search results
- temp file path if truncated

---

## Implementation sequence

## Phase 1: scaffold

- create extension directory
- add `package.json`
- add module skeletons
- install deps
- verify Pi loads the extension

## Phase 2: settings integration

- add `settings.ts`
- define setting registrations
- emit `pi-extension-settings:register` on `session_start`
- implement typed setting parsing with defaults
- verify values resolve correctly even if the settings UI extension is not loaded

## Phase 3: shared infra

- implement network helpers
- implement temp-file helper
- implement truncation wrapper
- implement shared render helpers

## Phase 4: `webfetch`

- implement validation and blocking
- implement streaming body reads
- implement MIME routing
- implement decoding
- implement HTML pipeline
- implement image results
- implement truncation + details + renderer

## Phase 5: `websearch`

- implement provider interface
- implement Exa provider
- implement normalized results
- implement deterministic formatting
- conditionally register tool based on `searchEnabled`

## Phase 6: polish

- tighten prompt snippets/guidelines
- improve error messages
- refine whitespace/markdown cleanup
- verify settings compatibility with `/extension-settings`

## Phase 7: tests

- add unit/fixture tests
- add regression coverage for the HTML issues from the OpenCode analysis
- add search formatting/provider parsing tests

---

## Test plan

## Test harness

Use Node's built-in test runner where possible.

Suggested structure:

```text
home/.pi/agent/extensions/web-tools/
├── test/
│   ├── fixtures/
│   ├── settings.test.ts
│   ├── html.test.ts
│   ├── webfetch.test.ts
│   └── websearch.test.ts
```

---

## Settings tests

- registration payload shape is correct
- default values parse correctly
- invalid stored values fall back safely
- `on|off` -> boolean parsing works
- numeric string parsing works
- extension behaves sanely if `pi-extension-settings` UI extension is absent

---

## `webfetch` tests

### Validation/safety

- rejects malformed URLs
- rejects non-http(s)
- blocks localhost/private IPs when enabled
- validates redirect targets too

### Content detection

- recognizes uppercase/mixed-case HTML content types
- recognizes XHTML
- treats SVG as text path
- returns image result for PNG/JPEG/WebP/GIF
- rejects unsupported binary

### HTML regressions

- no `<title>` leakage
- removes skipped elements
- preserves direct tail text
- preserves block boundaries in text mode
- normalizes whitespace sanely
- absolutizes relative links
- markdown and text come from the same sanitized content

### Limits/errors

- timeout enforced
- streamed size cap enforced
- truncation writes temp file path

---

## `websearch` tests

- normalized result mapping is correct
- formatted output is deterministic
- truncation writes temp file path
- provider timeout throws
- malformed provider response throws
- `searchEnabled=off` skips registration

---

## Manual verification checklist

## Settings

- install/load `@juanibiapina/pi-extension-settings`
- verify `web-tools` settings appear in `/extension-settings`
- change defaults and confirm tool behavior changes without code edits

## `webfetch`

- fetch an article as markdown
- fetch same page as text
- confirm no head/title leakage
- fetch a PNG and verify inline image rendering
- fetch an SVG and verify text-path behavior
- fetch a large page and verify truncation notice + temp file
- fetch a binary file and verify clean failure

## `websearch`

- search for a current topic
- confirm results are URL-forward and readable
- confirm the model can easily select one result for `webfetch`
- change `searchDefaultMaxResults` and `searchDefaultDepth` via settings and verify behavior

---

## Final recommended v1 decisions

- extension path: `home/.pi/agent/extensions/web-tools/`
- settings compatibility via `@juanibiapina/pi-extension-settings`
- no custom settings JSON for v1
- register settings under `web-tools`
- register settings on `session_start` for better load-order tolerance
- `webfetch` always available
- `websearch` registered only when `searchEnabled = on`
- require explicit `http://` or `https://`
- block private hosts by default
- use one shared sanitized HTML pipeline for markdown/text
- support raster images inline
- reject unsupported binary content
- write full output to temp files on truncation
- keep provider transport hidden behind an adapter

---

## Definition of done

Done means:

- Pi auto-loads the extension from `home/.pi/agent/extensions/web-tools/`
- `web-tools` settings appear and work with `/extension-settings`
- `webfetch` is solid for HTML, text, image, truncation, and error cases
- `websearch` returns concise normalized results for current web info
- both tools throw proper Pi errors
- key bugs from the OpenCode analysis are eliminated
- core fixture/unit coverage exists for settings, HTML handling, truncation, and provider parsing
