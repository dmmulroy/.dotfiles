# OpenCode + Cloudflare AI Gateway for Pi — Implementation Plan

## Location

Build the solution here:

- `home/.pi/agent/extensions/opencode-cloudflare/`

Why here:

- it follows the dotfiles stow layout
- it is auto-discovered by Pi
- it can be hot-reloaded with `/reload`
- it can later be turned into a shareable Pi package without forking Pi itself

---

## Goal

Add first-class Pi support for OpenCode’s Cloudflare-hosted gateway at:

- `https://opencode.cloudflare.dev`

So that Pi can:

- authenticate against the same Cloudflare Access flow OpenCode uses
- route model traffic through the hosted OpenCode/Cloudflare gateway
- expose the gateway as a Pi provider, ideally:
  - provider id: `opencode.cloudflare.dev`
- support Workers AI models immediately
- support the hosted Anthropic / OpenAI / Google routes exposed by the gateway
- remain packageable and maintainable without patching Pi core

---

## Recommendation

### Build a Pi extension/provider adapter, not a Pi core fork

Recommended approach:

- create a Pi extension that registers a custom provider
- back that provider with a custom API dispatcher
- reuse Pi’s built-in streaming implementations from `@mariozechner/pi-ai`
- optionally import existing OpenCode auth state for compatibility
- optionally support `/login opencode.cloudflare.dev` natively inside Pi

### Why this is better than the coworker/core-patch approach

The coworker sample modifies Pi internals such as auth storage and model registry.

That is not the preferred path because it:

- creates an ongoing fork/maintenance burden
- couples the feature to one Pi build instead of an installable extension
- makes upgrades harder
- is unnecessary given Pi’s extension/provider APIs

### Important implementation constraint discovered during research

Pi’s dynamic `registerProvider()` path currently **does not actually honor per-model `baseUrl`** for dynamically-registered providers, even though the type shape suggests it can.

That means a plain dynamic provider with mixed backend paths like:

- `/anthropic`
- `/openai`
- `/google-ai-studio/v1beta`
- `/compat`

will not work correctly as a single provider unless we do one of these:

1. register separate providers per backend, or
2. use one custom API type plus a dispatching `streamSimple()` that selects the correct backend per model

### Chosen design

Use:

- **one provider**: `opencode.cloudflare.dev`
- **one custom API type**: e.g. `opencode-cloudflare`
- **one dispatching stream function** that forwards each request to the appropriate built-in Pi streamer

This keeps the user-facing UX clean while avoiding Pi core changes.

---

## What we know from the gist and live endpoint

### OpenCode auth flow

OpenCode uses a `.well-known/opencode` document and an auth command that ultimately yields a Cloudflare Access token.

Live endpoint inspected:

- `https://opencode.cloudflare.dev/.well-known/opencode`

Current live behavior includes:

- `auth.command` returned from the well-known document
- `auth.env = TOKEN`
- hosted backend routes for:
  - Anthropic
  - OpenAI
  - Google AI Studio
  - Workers AI compatibility endpoint
- required headers including:
  - `cf-access-token`
  - `X-Requested-With: xmlhttprequest`

### Notable delta vs the gist summary

The gist describes `auth.command` as shell-like text, but the live endpoint currently returns it as an argv array.

So the implementation should support both:

- array form
- string form

### Workers AI note

Pi’s OpenAI-compatible streamer already understands reasoning fields like:

- `reasoning_content`
- `reasoning`
- `reasoning_text`

So Workers AI models behind the OpenCode compatibility endpoint likely do **not** need a custom protocol parser; they can probably reuse Pi’s built-in OpenAI-compatible streaming.

---

## High-level design

## 1) Extension package

Create a local Pi package-style extension directory with:

- `package.json`
- `index.ts`
- supporting modules
- `README.md`
- smoke-test helpers

This keeps the solution local-first now, but easily shareable later.

## 2) Provider identity

Register a provider named:

- `opencode.cloudflare.dev`

This matches the gateway hostname and the gist’s desired UX.

## 3) Custom API dispatcher

Register a custom API type such as:

- `opencode-cloudflare`

All provider models use that API type.

The custom `streamSimple()` will:

1. resolve the current gateway config
2. determine the backend for the selected model
3. clone/transform the model into a backend-specific Pi model
4. call the matching built-in streamer:
   - `streamSimpleAnthropic`
   - `streamSimpleOpenAICompletions`
   - `streamSimpleOpenAIResponses`
   - `streamSimpleGoogle`
5. pass through the streamed events unchanged

This gives one clean provider while still routing to multiple hosted base URLs.

## 4) Auth strategy

Support two auth paths, in this order:

### A. Native Pi login

Expose the provider in `/login` via extension `oauth` registration.

Login flow:

1. fetch `https://opencode.cloudflare.dev/.well-known/opencode`
2. validate the host and payload shape
3. execute the returned `auth.command`
4. capture stdout as the access token
5. store credentials in Pi auth storage under `opencode.cloudflare.dev`

### B. OpenCode auth import / interoperability

Also support importing auth from OpenCode’s existing auth file:

- `$XDG_DATA_HOME/opencode/auth.json`
- `~/.local/share/opencode/auth.json`

This allows reuse of:

```sh
opencode auth login https://opencode.cloudflare.dev
```

without modifying Pi core.

### Suggested precedence

When resolving auth for the extension:

1. Pi-stored credentials for `opencode.cloudflare.dev`
2. imported OpenCode well-known token from OpenCode auth.json
3. explicit env override, if we provide one

## 5) Gateway config resolution

Implement a small config resolver that fetches and caches:

- the live `.well-known/opencode` document
- backend base URLs
- required headers
- auth command metadata

Use a short in-memory cache to avoid refetching on every single call, but keep it fresh enough that route/header changes can be picked up during a session.

## 6) Model catalog

Build one user-facing provider catalog containing:

### Workers AI

Use an explicit curated list from the live well-known config, including at least:

- `@cf/moonshotai/kimi-k2.5`
- `@cf/nvidia/nemotron-3-120b-a12b`
- `@cf/zai-org/glm-4.7-flash`

Use:

- short `id` values for clean selection
- full prefixed names as display names so both short and long CLI matching remain practical

### Anthropic / OpenAI / Google

Reuse Pi’s built-in model metadata as the base source of truth where possible, then route them through the hosted OpenCode backend paths at request time.

This avoids hand-maintaining large model definitions and keeps parity with Pi updates.

---

## Security design

## Host allowlist

Do **not** build a generic “execute whatever `.well-known/opencode` says from any URL” extension.

For v1, hard-allowlist only:

- `https://opencode.cloudflare.dev`

That is a major safety improvement over a fully generic remote-command trust model.

## Token handling

- never log raw tokens
- redact auth headers in debug output
- never write imported OpenCode secrets into the repo
- prefer Pi auth storage for Pi-owned credentials after login

## Command execution

If `auth.command` is:

- an argv array: execute directly
- a string: execute through a shell wrapper intentionally and explicitly

Reject malformed command payloads.

---

## Phased implementation plan

## Phase 1 — scaffold the extension package

Create:

- `home/.pi/agent/extensions/opencode-cloudflare/package.json`
- `home/.pi/agent/extensions/opencode-cloudflare/index.ts`
- `home/.pi/agent/extensions/opencode-cloudflare/README.md`
- `home/.pi/agent/extensions/opencode-cloudflare/test/`

Outcome:

- Pi discovers the extension
- no provider logic yet
- package shape is ready for incremental development

## Phase 2 — auth + gateway config plumbing

Implement modules for:

- locating OpenCode auth.json
- reading/importing URL-keyed well-known auth records
- fetching/parsing `.well-known/opencode`
- validating the live response shape
- executing `auth.command`
- normalizing token/header/base-url resolution

Outcome:

- we can fetch config
- we can import an existing OpenCode token
- we can log in natively through Pi

## Phase 3 — model catalog + custom dispatcher

Implement:

- model catalog builder
- backend mapping metadata per model
- custom API dispatcher
- delegation into Pi built-in streamers

Outcome:

- provider `opencode.cloudflare.dev` appears in Pi
- selected models route correctly to:
  - `/anthropic`
  - `/openai`
  - `/google-ai-studio/v1beta`
  - `/compat`

## Phase 4 — UX helpers

Add small commands such as:

- `/opencode-cf-status`
- `/opencode-cf-sync-auth`
- `/opencode-cf-doctor`

These are optional but recommended.

Use them to show:

- whether Pi auth exists
- whether OpenCode auth import is available
- which gateway routes are currently resolved
- which models are loaded

## Phase 5 — docs + teammate packaging

Document:

- local usage in dotfiles
- `/login` flow
- OpenCode auth import flow
- smoke-test commands
- how to package/share later as a Pi package or tarball

---

## Proposed file layout

```text
home/.pi/agent/extensions/opencode-cloudflare/
├── IMPLEMENTATION_PLAN.md
├── README.md
├── package.json
├── index.ts
├── auth.ts               # Pi login + OpenCode auth import
├── wellknown.ts          # fetch/parse/validate .well-known/opencode
├── catalog.ts            # model catalog + backend map
├── dispatch.ts           # custom streamSimple delegator
├── constants.ts          # hostnames, paths, provider/api ids
└── test/
    ├── fixtures/
    │   ├── wellknown.json
    │   └── opencode-auth.json
    └── smoke.ts
```

If implementation grows, split further; otherwise keep it compact.

---

## Provider behavior details

## Provider id

- `opencode.cloudflare.dev`

## Internal API id

- `opencode-cloudflare`

## Backend routing map

At dispatch time, map models roughly to:

- Anthropic models -> hosted Anthropic endpoint
- OpenAI/Codex models -> hosted OpenAI endpoint
- Google Gemini models -> hosted Google AI Studio endpoint
- Workers AI models -> hosted compatibility endpoint

## Request headers

Build request headers from the live well-known config, including at minimum:

- `cf-access-token: <token>`
- `X-Requested-With: xmlhttprequest`

If the well-known payload adds provider-specific headers, preserve them.

---

## Testing plan

## Fixture tests

Add lightweight tests or smoke scripts for:

- parsing array vs string `auth.command`
- reading URL-keyed OpenCode auth records
- importing the correct token from OpenCode auth.json
- routing model ids to the correct backend
- building/redacting headers correctly

## Manual smoke tests

After implementation:

### Model discovery

```sh
pi --list-models opencode.cloudflare.dev
```

### Existing OpenCode auth import

```sh
opencode auth login https://opencode.cloudflare.dev
pi --list-models opencode.cloudflare.dev
```

### Native Pi login

```sh
pi
/login
# choose opencode.cloudflare.dev
```

### Print-mode canaries

Workers AI:

```sh
pi -p --provider opencode.cloudflare.dev --model @cf/moonshotai/kimi-k2.5 "Reply with exactly: ok"
```

OpenAI route canary:

```sh
pi -p --provider opencode.cloudflare.dev --model gpt-4o "Reply with exactly: ok"
```

Anthropic route canary:

```sh
pi -p --provider opencode.cloudflare.dev --model claude-sonnet-4-5 "Reply with exactly: ok"
```

Google route canary:

```sh
pi -p --provider opencode.cloudflare.dev --model gemini-2.5-flash "Reply with exactly: ok"
```

## Failure-path tests

Verify clear errors for:

- missing auth
- expired/rejected token
- malformed well-known response
- gateway HTML/login-page responses instead of JSON

---

## Risks and mitigations

## Risk: token expiry / no real refresh contract

The OpenCode well-known flow does not expose a clean refresh-token contract.

### Mitigation

For v1:

- treat refresh as best-effort
- support explicit re-login cleanly
- if token looks like a JWT, parse `exp` and use that
- otherwise fall back to a conservative synthetic expiry or manual renewal semantics
- document that rerunning `/login` or `opencode auth login ...` may be required

## Risk: gateway config drift

The live well-known response can change.

### Mitigation

- fetch and validate the live well-known config
- keep provider routing derived from the well-known document where possible
- avoid hardcoding headers unnecessarily

## Risk: unsupported model coverage drift

Pi’s built-in model lists may move faster than what the gateway actually supports.

### Mitigation

- keep Workers AI explicit
- use canary tests for Anthropic/OpenAI/Google
- if necessary, narrow the exposed catalog to a known-good subset after first smoke tests

## Risk: dynamic provider limitation in Pi

Dynamic provider registration currently ignores per-model base URLs.

### Mitigation

- do not rely on plain `registerProvider()` with mixed backend paths
- use the custom API dispatcher design from the start

---

## Scope decision

## Recommended v1 scope

Ship all of this in v1:

- one provider: `opencode.cloudflare.dev`
- native Pi `/login` support
- OpenCode auth-file import support
- Workers AI models
- routed Anthropic/OpenAI/Google support via dispatcher
- minimal status/doctor command
- README + smoke tests

## Explicitly avoid in v1

- patching Pi core auth/model registry
- a standalone proxy server or external gateway process
- generic arbitrary `.well-known/opencode` trust for any host
- premature UI polish beyond basic doctor/status helpers

---

## Approval checkpoints

If you approve this plan, implementation should proceed in this order:

1. scaffold the extension package in `home/.pi/agent/extensions/opencode-cloudflare/`
2. implement auth import + native `/login`
3. implement the custom API dispatcher
4. wire the initial model catalog
5. add smoke scripts and docs
6. only then consider packaging/sharing ergonomics

---

## Bottom line

The best path is:

- **a Pi extension/provider adapter**
- **not a Pi fork**
- **not a separate proxy service**

That gives the cleanest long-term solution, matches Pi’s extension model, and avoids baking OpenCode-specific logic into Pi core while still reusing OpenCode’s existing Cloudflare Access flow and hosted gateway.