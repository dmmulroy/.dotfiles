# Cloudflare context-window fallback research

**Checked:** 2026-08-03  
**Question:** Do official Cloudflare Workers AI or AI Gateway sources support `222000` tokens as a generic `contextWindow` fallback when model metadata is absent?

## Conclusion

**No.** The primary sources checked provide no support for `222000` as either a generic fallback or a gateway-wide context limit. Cloudflare treats context windows as **per-model metadata**. When catalog metadata is absent, Cloudflare's own docs code omits the context-window field rather than substituting a default.

Using `222000` may be an application-specific conservative guess, but it should not be represented as a Cloudflare-derived limit. Prefer an unknown/absent value, explicit per-model overrides, or provider-owned metadata.

## Evidence

### Context limits are per model

Cloudflare defines a context window as the total supported input, reasoning, and completion tokens, and explicitly says to find the limit on **each model page**.[^glossary] Published values differ materially, for example:

- Workers AI `@cf/openai/gpt-oss-120b`: **128,000** tokens.[^gpt-oss]
- Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct`: **131,000** tokens.[^llama-scout]
- Workers AI `@cf/moonshotai/kimi-k2.5`: **256,000** tokens.[^kimi]
- Unified catalog `openai/gpt-4.1`: **1,047,576** tokens.[^gpt41]

These values are model records, not Gateway policy. AI Gateway's official limits table covers request size, rate, logs, gateways, metadata, and related features; it lists **no context-window limit**.[^gateway-limits] Gateway fallbacks likewise select another provider/model after errors or timeouts; they do not establish a shared token capacity.[^gateway-fallbacks]

### Missing metadata remains missing

Cloudflare's public docs source models catalog context as nullable: `context_length: z.number().nullable()`.[^content-schema] Its resolver adds `context_window` only when `context_length != null`; there is no default branch or fallback constant.[^resolver] Legacy Workers AI records similarly use an open `properties[]` list rather than a required global context value.[^content-schema]

The first-party catalog demonstrates this behavior. The text-generation page for `alibaba/qwen3-max` has no “Context Window” row, while pages with metadata do show one.[^qwen-missing] In the checked Cloudflare docs checkout, both `alibaba/qwen3-max` and `alibaba/qwen3.5-397b-a17b` had `context_length: null`; the resolver therefore omitted the field. This is direct counterevidence to a generic numeric substitution.

The documented Workers AI model-search endpoint does not define a typed context-window guarantee: both its default `result` entries and OpenRouter-format `data` entries are documented as arrays of `unknown`. It requires an account and API token, so no authenticated live catalog response was available in this environment.[^model-search]

### Exact-number search

A literal search for `222000` and formatting variants (`222,000`, `222 000`) found no match in the checked official Cloudflare sources:

- `cloudflare/cloudflare-docs` at commit `2a8d3a5d10f6131097b3a6ab5b95c6facaf24fd8`, including Workers AI model JSON, unified catalog JSON, Workers AI docs, and AI Gateway docs;
- current checkouts of `cloudflare/workers-sdk`, `cloudflare/cloudflare-typescript`, `cloudflare/api-schemas`, and `cloudflare/ai`.

The catalog values observed around this range were ordinary per-model numbers such as 200,000, 256,000, and 262,144—not 222,000. A negative repository search cannot prove the number never existed in private or historical systems, but combined with the published schema, resolver behavior, model pages, and Gateway limits, there is no first-party basis for adopting it.

## Recommendation

Do not use `222000` as a Cloudflare-generic fallback. Model the missing value as unknown. If a downstream API requires a number, use a clearly documented **local policy value** and avoid naming or commenting it as a Cloudflare limit.

[^glossary]: Cloudflare, [Workers AI glossary — “Context Window”](https://developers.cloudflare.com/workers-ai/platform/glossary/).
[^gpt-oss]: Cloudflare, [Workers AI model: gpt-oss-120b](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/).
[^llama-scout]: Cloudflare, [Workers AI model: Llama 4 Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/).
[^kimi]: Cloudflare, [Workers AI model: Kimi K2.5](https://developers.cloudflare.com/workers-ai/models/kimi-k2.5/).
[^gpt41]: Cloudflare, [Unified model catalog: GPT-4.1](https://developers.cloudflare.com/ai/models/openai/gpt-4.1/).
[^gateway-limits]: Cloudflare, [AI Gateway limits](https://developers.cloudflare.com/ai-gateway/reference/limits/).
[^gateway-fallbacks]: Cloudflare, [AI Gateway fallbacks](https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/).
[^content-schema]: Cloudflare Docs source, [`src/content.config.ts`, lines 379–439](https://github.com/cloudflare/cloudflare-docs/blob/2a8d3a5d10f6131097b3a6ab5b95c6facaf24fd8/src/content.config.ts#L379-L439).
[^resolver]: Cloudflare Docs source, [`model-resolver.ts`, conditional context mapping](https://github.com/cloudflare/cloudflare-docs/blob/2a8d3a5d10f6131097b3a6ab5b95c6facaf24fd8/src/util/models/model-resolver.ts#L84-L101).
[^qwen-missing]: Cloudflare, [Unified model catalog: Qwen 3 Max](https://developers.cloudflare.com/ai/models/alibaba/qwen3-max/).
[^model-search]: Cloudflare API reference, [Workers AI Model Search](https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/).
