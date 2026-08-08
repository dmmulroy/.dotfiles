# OpenCode Cloudflare Fast Mode handoff

## Goal

Add selectable Fast variants to the `opencode.cloudflare.dev` Pi provider using the capabilities advertised by the work gateway. Preserve normal models, Cloudflare Access authentication, native Pi streaming, and accurate model metadata.

This work must be investigated and verified on the work laptop while connected to the required work network or WARP. The current machine cannot reach the configured gateway. The user has confirmed that the work account has access to Fast models.

## Current architecture

The OpenCode Cloudflare extension lives at:

```text
agent/extensions/opencode-cloudflare/
```

Its request path is:

```text
public well-known discovery
  -> optional authenticated remote configuration
  -> parsed gateway catalog and route map
  -> Cloudflare Access-protected AI Gateway
  -> backend selected by the route
```

Source ownership:

- `config-store.ts` fetches `https://opencode.cloudflare.dev/.well-known/opencode`, follows its optional authenticated `remote_config`, caches the result, and falls back safely.
- `auth.ts` obtains and redacts the Cloudflare Access token used for authenticated configuration and inference.
- `config.ts` parses untrusted discovery, remote configuration, and local overlays.
- `catalog.ts` turns the resolved configuration into visible Pi models and maps each visible model ID to a backend route.
- `stream.ts` resolves the route, adds Cloudflare authentication, creates a delegated model, and calls Pi's native backend streamer.
- `index.ts` composes those services and registers the `opencode.cloudflare.dev` provider.

The initial well-known request is made without credentials. Credentials are needed when the document points to protected remote configuration and for AI Gateway inference.

For the OpenAI backend, inference currently delegates through Pi's `openai-responses` implementation and sends requests to:

```text
https://gateway.opencode.cloudflare.dev/openai/responses
```

This is not automatically the same product as ChatGPT Codex subscription Fast Mode. Confirm what the work gateway exposes before choosing protocol behavior.

## Existing Codex Fast reference

The sibling `codex-fast-variants` extension is the working reference for ChatGPT Codex subscription traffic:

- `codex-fast-catalog.ts` discovers Fast capability from Codex catalog metadata.
- `codex-fast-variants.ts` creates and restores `-fast` aliases.
- `codex-fast-request.ts` maps an alias back to the upstream model and adds `service_tier: "priority"`.

Protocol research is recorded in:

```text
docs/research/openai-codex-fast-mode-network-semantics.md
```

Important distinction from that report: `x-codex-routing-hint` is specific to the ChatGPT/Codex backend path. The official client omits it for API-key and custom-provider routes. Do not send that header through the Cloudflare OpenAI route unless live gateway evidence proves that this route intentionally implements the Codex backend contract.

## Investigation on the work laptop

### 1. Establish a clean baseline

Run:

```sh
cd ~/.dotfiles/home/.pi
npm run check --workspace=pi-extension-opencode-cloudflare
/opencode-cf-doctor
pi update --models
```

Inspect `git status` before editing. Preserve concurrent work and keep this feature in separate changes.

**Complete when:** existing package tests pass and live discovery succeeds through the work network.

### 2. Inspect the live model contract safely

Trace the well-known document and authenticated remote configuration through `config-store.ts`. Determine how Fast access is represented:

1. separate Fast model entries;
2. service-tier metadata on standard models;
3. model `options` such as a priority service tier;
4. another gateway-specific route or request model ID;
5. no machine-readable capability metadata.

Inspect data in memory or temporary untracked output. Record only the field shapes needed for implementation. Keep Cloudflare tokens, upstream credentials, response bodies containing secrets, and private model IDs out of tracked files, tests, fixtures, comments, and documentation.

**Complete when:** the exact capability field, request model mapping, backend, pricing metadata, and supported-model selection rule are known from the live gateway.

### 3. Verify the wire behavior

Using one supported model without recording its private ID, compare a Standard request with the gateway's Fast form. Determine whether Fast requires:

- JSON `service_tier: "priority"`;
- a distinct request model ID;
- another documented gateway option;
- more than one of these.

Also determine whether Priority pricing is returned in gateway configuration or usage data.

**Complete when:** a captured, sanitized request delta and successful live response establish the actual gateway contract.

## Implementation branches

Choose the branch supported by live evidence.

### Branch A: configuration already exposes separate Fast models

Keep those visible IDs. Ensure `config.ts` parses the relevant fields, `catalog.ts` preserves the entries, and each route carries the correct `requestModelId` and request options. Do not create duplicate aliases.

### Branch B: configuration advertises Fast capability on standard models

Parse the capability into a typed field in `GatewayModelConfig`. In `catalog.ts`, create one `<visible-model-id>-fast` alias for each advertised OpenAI model while preserving the standard entry. Point the alias route back to the standard upstream request model with `requestModelId`.

### Branch C: configuration has no Fast capability metadata

Change the gateway configuration contract first so it advertises support and pricing. Do not infer support from model-name patterns and do not add a tracked allowlist of work model IDs.

## Expected client changes

The exact names should follow the live contract, but ownership should remain:

### `config.ts`

- Parse the gateway's Fast or Priority metadata at the external boundary.
- Reject malformed known values with `GatewayConfigParseError`.
- Preserve the metadata through document merging and local overlays only where local override is intentionally supported.

### `catalog.ts`

- Add service-tier information to the OpenAI `RouteDescriptor`.
- Expose Fast aliases only for models explicitly advertised as supported.
- Use `requestModelId` to keep the visible `-fast` alias out of the upstream request.
- Preserve model limits, reasoning behavior, compatibility flags, and modalities.
- Use advertised Priority prices for the alias. Do not copy Standard API prices when they differ.

### `stream.ts`

- Extend the existing OpenAI payload transformation in `applyOpenAIResponsesPayloadOptions()` or its renamed replacement.
- Add the verified Fast request field only for the Fast route.
- Preserve any existing `onPayload` callback and the verbosity/reasoning options.
- Leave Anthropic, Google, xAI, Workers AI, and standard OpenAI routes unchanged.
- Keep Cloudflare Access credentials redacted and maintain the current gateway headers.

### `index.ts`

No new raw runtime dependencies should be needed. Continue composing configuration, catalog, authentication, and streaming at this entrypoint.

### `codex-fast-variants`

Keep ChatGPT Codex subscription discovery and routing independent. Reuse a pure alias helper only if both providers truly share the same invariant; do not couple Cloudflare authentication or configuration to the Codex extension.

## Required tests

Add behavior tests through the existing public seams:

### Configuration and catalog

- parses the live Fast capability shape;
- rejects malformed capability values;
- creates aliases only for advertised supported OpenAI models;
- preserves the standard model beside every alias;
- maps the alias to the correct upstream request model;
- preserves current model metadata and uses correct Fast pricing;
- creates no Fast aliases for other backends;
- avoids duplicate IDs when the gateway already supplies a Fast entry.

### Streaming

- Standard OpenAI request omits the Fast field;
- Fast OpenAI request contains the verified request delta;
- visible response metadata retains the `-fast` model ID;
- verbosity, reasoning context, and caller `onPayload` still compose;
- Cloudflare authentication headers remain correct;
- other backend payloads remain unchanged;
- gateway rejection becomes a safe actionable error without credential leakage.

### Live verification

On the work network:

1. refresh the provider catalog;
2. confirm both Standard and Fast choices appear as intended;
3. complete one Standard inference and one Fast inference;
4. verify the sanitized outgoing request delta;
5. confirm the response remains attributed to the visible `-fast` model;
6. run the package and root checks.

## Completion criteria

The work is complete when:

- Fast availability comes from the live gateway contract rather than private hard-coded IDs;
- Standard behavior is unchanged;
- a Fast selection produces the verified gateway request;
- live Standard and Fast inference both succeed on the work network;
- displayed model metadata and pricing are accurate;
- no custom footer is introduced;
- credentials and private model IDs are absent from tracked artifacts;
- `npm run check --workspace=pi-extension-opencode-cloudflare` and root `npm run check` pass.
