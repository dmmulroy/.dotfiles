# OpenAI Codex Fast Mode: semantics and request delta

**Investigated:** 2026-08-08  
**Codex source:** [`3aae5d885bac39c1262491aa3fd100dfd8b3919f`](https://github.com/openai/codex/tree/3aae5d885bac39c1262491aa3fd100dfd8b3919f)

## Conclusion

Fast Mode does **not** select a different model, change reasoning effort, use another inference endpoint, or alter the prompt/tool payload. It is a request for a higher **service tier**—a server-side scheduling/routing choice—for a model that the authenticated Codex model catalog says supports it.

For a normal Codex inference request, enabling Fast changes these fields:

```diff
 POST /responses
 
- # JSON body omits service_tier
+ "service_tier": "priority"
 
- x-codex-routing-hint: model=<model>
+ x-codex-routing-hint: model=<model>;tier=priority
```

The header delta applies only to the normal OpenAI + ChatGPT/Codex-backend auth path. The JSON `service_tier` delta is the important protocol signal. Fast Mode is a UI/config name; **`priority` is the on-the-wire value**, not `fast`.

## What `/fast` does locally

`/fast` is a dynamically exposed service-tier command. It is available only when the CLI's FastMode feature is enabled and the current model catalog advertises a service tier. The command toggles the current tier:

- **On:** persist and apply the catalog's Fast tier, which the client represents as `priority`.
- **Off:** persist and apply the special local value `default`, meaning “explicit Standard routing.” The request builder removes that sentinel, so the provider receives no `service_tier` field.

Source evidence:

- `FastMode` is a stable, default-enabled feature keyed as `fast_mode`. [features](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/features/src/lib.rs#L270-L271) · [feature spec](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/features/src/lib.rs#L1437-L1441)
- The client exposes service-tier commands from the selected model's catalog entry and toggles the selected tier to `default` when it is already active. [command creation](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/tui/src/chatwidget/service_tiers.rs#L61-L103)
- The tests show `/fast` emits and persists `ServiceTier::Fast.request_value()` and that toggling it off emits `default`. [on](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/tui/src/chatwidget/tests/slash_commands.rs#L2675-L2706) · [off](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/tui/src/chatwidget/tests/slash_commands.rs#L2865-L2912)
- The documented persistent equivalent is `service_tier = "fast"` plus `[features].fast_mode = true`; the parser normalizes either `fast` or `priority` to `priority`. [OpenAI docs](https://developers.openai.com/codex/agent-configuration/speed/) · [normalization](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/protocol/src/config_types.rs#L497-L521)

## Exact request construction

1. The selected tier is carried into the turn configuration. It is rejected if FastMode is disabled, and unsupported tiers are dropped based on the model metadata returned by the service. [validation](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/core/src/session/mod.rs#L926-L953)
2. Before serializing the Responses request, `service_tier_for_request` retains only an advertised tier and specifically drops the `default` sentinel. [filter](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/protocol/src/openai_models.rs#L771-L783)
3. That retained value is assigned to the optional JSON `service_tier` member of `ResponsesApiRequest`; serde omits the member when it is `None`. [assignment](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/core/src/client.rs#L916-L947) · [wire type](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/codex-api/src/common.rs#L245-L275)
4. The HTTP transport serializes that object and sends it as `POST /responses` with an SSE response; Fast does not select a different path. [transport](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/codex-api/src/endpoint/responses.rs#L61-L145)
5. For OpenAI ChatGPT/Codex-backend auth, the client also emits `x-codex-routing-hint`. It is `model=<model>;tier=priority` in Fast Mode and `model=<model>` when Standard is selected. The header is intentionally omitted for API-key/custom/AWS and other non-Codex-backend routes. [header construction](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/core/src/client.rs#L991-L1014) · [HTTP insertion](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/core/src/client.rs#L1483-L1515)

The same `service_tier` request member is carried by the Responses WebSocket message as well, so changing the transport does not change Fast Mode semantics. [WebSocket request mapping](https://github.com/openai/codex/blob/3aae5d885bac39c1262491aa3fd100dfd8b3919f/codex-rs/codex-api/src/common.rs#L277-L330)

## Semantic and eligibility boundaries

- OpenAI documents Fast as a higher-credit-rate mode that makes supported GPT-5.6, GPT-5.5, and GPT-5.4 models about 1.5× faster. It costs 2.5× Standard credits for GPT-5.6/5.5 and 2× for GPT-5.4. It is distinct from GPT-5.3-Codex-Spark, which is a separate model. [OpenAI Fast Mode docs](https://developers.openai.com/codex/agent-configuration/speed/)
- It is a **ChatGPT credit** feature. With an API key Codex uses normal Platform API billing; Fast's ChatGPT credit multiplier does not apply. [OpenAI auth docs](https://developers.openai.com/codex/auth/) · [Fast Mode docs](https://developers.openai.com/codex/agent-configuration/speed/)
- Availability is not inferred from the client setting alone. The backend-provided model catalog controls whether `priority` is advertised for the model, and the server remains authoritative for account, plan, region, workspace-policy, capacity, and billing enforcement.

## What source inspection cannot establish

The open-source client proves the request field/header and that Fast is a priority-routing request. It does **not** reveal the provider's scheduler implementation: which cluster/model replica receives it, whether inference token generation itself is faster versus queue time/TTFT, admission/fallback behavior under load, or the server's exact entitlement decision. Those are server-side implementation details; OpenAI's public documentation promises the observed speed and credit multiplier, not that internal mechanism.

## Relevance to Pi

This resolves the earlier ambiguity: Pi would need to reproduce the **Codex subscription** request semantics—at least `service_tier: "priority"`, and likely the Codex routing hint when using its ChatGPT OAuth route—not send `service_tier: "fast"`. Whether Pi's provider/client currently exposes and sends those exact values is a separate implementation question.
