# Pi + ChatGPT Codex Fast Mode

## Verdict

“codec subscription” almost certainly means an **OpenAI Codex subscription via ChatGPT**. Pi can authenticate to that service and select its Codex models, but **Pi 0.84.1 has no supported Fast Mode control**. There is no Pi command, setting, CLI flag, or model-catalog entry that sends Codex `service_tier: "fast"`. Do not substitute API `priority` for Fast Mode: OpenAI documents those as different products/pricing paths.

## What is available

- This machine runs Pi **0.84.1** (`pi --version`; package metadata), whose built-in `openai-codex` provider is explicitly an OAuth subscription provider named “OpenAI (ChatGPT Plus/Pro)”. Its catalog contains GPT-5.6 Sol, Terra, and Luna (plus older models and Spark). The current OpenAI Codex model guide describes Luna as the fast, lower-cost GPT-5.6 choice. [Pi provider source](https://github.com/earendil-works/pi/blob/368e013/packages/ai/src/providers/openai-codex.ts) · [Pi catalog](https://github.com/earendil-works/pi/blob/368e013/packages/ai/src/providers/data/openai-codex.json) · [OpenAI models](https://developers.openai.com/codex/models/)
- OpenAI Fast Mode is a **ChatGPT-authenticated Codex** feature, not a separate model: supported GPT-5.6, 5.5, and 5.4 models run about 1.5× faster; it consumes 2.5× Standard credits for 5.6/5.5 and 2× for 5.4. It is available in OpenAI’s desktop app, Codex CLI, and IDE extension. It does not apply to API-key billing. [OpenAI Speed](https://developers.openai.com/codex/agent-configuration/speed/) · [OpenAI pricing](https://developers.openai.com/codex/pricing/)
- Pi’s current upstream source is also 0.84.1. Its changelog says the earlier “OpenAI Codex fast model variants” were removed because they did not work. [Pi changelog](https://github.com/earendil-works/pi/blob/368e013/packages/coding-agent/CHANGELOG.md#L1224-L1227)

## Why Pi cannot enable it

Pi’s Codex Responses implementation has a typed `serviceTier` plumbing path, but Pi’s normal `streamSimple()` path only carries the usual base options and never exposes a Fast Mode UI/command or maps a model/config selection to `"fast"`. The only explicit tier accounting branches are `flex` and `priority`; they are not Codex Fast Mode. Its config schema accepts generic `samplingParams`, but the Codex request builder does not merge those parameters into its request body, so a `models.json` workaround will not enable Fast Mode. [Pi Codex request source](https://github.com/earendil-works/pi/blob/368e013/packages/ai/src/api/openai-codex-responses.ts#L86-L112) · [request construction](https://github.com/earendil-works/pi/blob/368e013/packages/ai/src/api/openai-codex-responses.ts#L560-L641) · [base options](https://github.com/earendil-works/pi/blob/368e013/packages/ai/src/api/simple-options.ts#L21-L49)

## Actionable commands

```bash
# Confirm the models Pi currently exposes for the ChatGPT/Codex provider.
pi --list-models codex

# Authenticate in Pi if needed: run Pi, then use /login and choose
# “OpenAI (ChatGPT Plus/Pro)”. Pi documents /login and /model.
pi

# Closest Pi-only speed-oriented choice: use the normal (not Fast Mode) Luna model.
pi --provider openai-codex --model gpt-5.6-luna
```

Pi documents `/login` and `/model`, plus `--provider`, `--model`, and `--list-models`; none is a Fast Mode switch. [Pi usage](https://github.com/earendil-works/pi/blob/368e013/packages/coding-agent/docs/usage.md#L27-L49) · [Pi CLI model options](https://github.com/earendil-works/pi/blob/368e013/packages/coding-agent/docs/usage.md#L185-L192)

To use actual Fast Mode today, use OpenAI Codex rather than Pi after signing in with the same ChatGPT account:

```bash
codex
# inside Codex CLI:
/fast on
/fast status
/fast off
```

For a persistent Codex-CLI default, OpenAI specifies this `~/.codex/config.toml` configuration (shown for reference only; not applied here):

```toml
service_tier = "fast"

[features]
fast_mode = true
```

[OpenAI’s Fast Mode commands and configuration](https://developers.openai.com/codex/agent-configuration/speed/)

## Limitations / eligibility

- Fast Mode requires ChatGPT sign-in; an API key uses API pricing instead. [OpenAI authentication](https://developers.openai.com/codex/auth/)
- Availability may still depend on the subscriber’s plan, region, workspace controls, role, and model availability. OpenAI says workspace controls can set Fast Mode availability but do not make unavailable models available. [OpenAI ChatGPT-plan guidance](https://help.openai.com/en/articles/11369540-codex-in-chatgpt)
- GPT-5.3-Codex-Spark is a distinct fast model, **not** Fast Mode, and OpenAI limits its research preview to ChatGPT Pro. [OpenAI Speed](https://developers.openai.com/codex/agent-configuration/speed/)
