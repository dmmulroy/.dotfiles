import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildCatalog, createCatalogService } from "../catalog.ts";
import {
	parseGatewayDocument,
	parseGatewayLocalOverlay,
	resolveGatewayConfig,
} from "../config.ts";
import { createGatewayConfigStore } from "../config-store.ts";

const fixturePath = fileURLToPath(new URL("./fixtures/wellknown.json", import.meta.url));
const fixtureText = readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureText);

test("parses discovery into a deterministic catalog", () => {
	const parsed = parseGatewayDocument(fixture);
	assert.equal(parsed.ok, true);
	const config = resolveGatewayConfig(parsed.value);
	const catalog = buildCatalog(config);
	assert.equal(catalog.ok, true);

	const ids = new Set(catalog.value.models.map((model) => model.id));
	assert.ok(ids.has("gpt-4o"));
	assert.ok(!ids.has("gpt-5.4-pro"));
	assert.ok(!ids.has("claude-opus-4-7-fast"));
	assert.ok(ids.has("@cf/moonshotai/kimi-k2.6"));
	assert.equal(catalog.value.routes.get("@cf/moonshotai/kimi-k2.6")?.requestModelId, "workers-ai/@cf/moonshotai/kimi-k2.6");
	assert.ok(ids.has("grok-4.5"));
	assert.equal(catalog.value.routes.get("grok-4.5")?.backend, "xai");
	assert.equal(config.routes.xai.baseUrl, "https://gateway.opencode.cloudflare.dev/grok");
	assert.equal(config.routes.anthropic.headers["anthropic-beta"], "context-1m-2025-08-07,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14");
});

test("configuration store follows authenticated two-step discovery", async () => {
	const requests = [];
	const store = createGatewayConfigStore({
		fetch: async (url, init) => {
			requests.push({ url, headers: new Headers(init.headers) });
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(JSON.stringify({
					auth: { env: "TOKEN", command: ["cloudflared", "access", "login", "-app=https://opencode.cloudflare.dev"] },
					remote_config: {
						url: "https://opencode.cloudflare.dev/config/opencode.json",
						headers: { "cf-access-token": "{env:TOKEN}" },
					},
				}), { status: 200 });
			}
			return new Response(JSON.stringify({
				enabled_providers: ["openai"],
				provider: { openai: { models: { "gpt-4o": {} } } },
			}), { status: 200 });
		},
		readTextFile: () => undefined,
		localConfigPath: () => "/tmp/overlay.jsonc",
		resolveToken: () => "fixture-token",
		now: () => 1,
	});
	const loaded = await store.load({ authToken: "context-token" });
	assert.equal(loaded.ok, true);
	assert.equal(loaded.value.source, "live");
	assert.deepEqual(loaded.value.enabledBackends, ["openai"]);
	assert.equal(requests.length, 2);
	assert.equal(requests[1].headers.get("cf-access-token"), "context-token");
	assert.equal(loaded.value.routes.openai.baseUrl, "https://gateway.opencode.cloudflare.dev/openai");
});

test("configuration store builds fallback state without network access", async () => {
	let fetches = 0;
	const store = createGatewayConfigStore({
		fetch: async () => {
			fetches += 1;
			return new Response(fixtureText, { status: 200, headers: { "content-type": "application/json" } });
		},
		readTextFile: () => undefined,
		localConfigPath: () => "/tmp/overlay.jsonc",
		resolveToken: () => undefined,
		now: () => 1,
	});
	const loaded = await store.load({ allowNetwork: false });
	assert.equal(loaded.ok, true);
	assert.equal(loaded.value.source, "fallback");
	assert.equal(fetches, 0);

	const refreshed = await store.load({ allowNetwork: true });
	assert.equal(refreshed.ok, true);
	assert.equal(refreshed.value.source, "live");
	assert.equal(fetches, 1);
});

test("request-time route resolution is cache-only", async () => {
	const parsed = parseGatewayDocument(fixture);
	assert.equal(parsed.ok, true);
	const config = resolveGatewayConfig(parsed.value);
	const loads = [];
	const catalog = createCatalogService({
		load: async (options) => {
			loads.push(options);
			return { ok: true, value: config };
		},
		clear() {},
		status: () => ({}),
	});

	const resolved = await catalog.resolveRoute("gpt-4o");
	assert.equal(resolved.ok, true);
	assert.equal(loads.length, 1);
	assert.equal(loads[0].allowNetwork, false);
});

test("local overlays augment built-in models and preserve typed options", () => {
	const parsed = parseGatewayLocalOverlay({
		provider: {
			anthropic: {
				models: {
					"anthropic/fixture-adaptive-model": {
						id: "fixture-adaptive-model",
						name: "Fixture Adaptive Model",
						reasoning: true,
						thinkingLevelMap: { xhigh: "xhigh", max: "max" },
						compat: {
							forceAdaptiveThinking: true,
							supportsStrictTools: true,
							supportsToolReferences: true,
						},
						limit: { context: 1000000, output: 128000 },
					},
				},
			},
			openai: {
				models: {
					"custom-openai-responses-model": {
						id: "custom-openai-responses-model",
						name: "Custom OpenAI Responses Model",
						reasoning: true,
						options: {
							text: { verbosity: "medium" },
							reasoning: { context: "all_turns" },
						},
						limit: { context: 1000000, output: 128000 },
					},
				},
			},
		},
	});
	assert.equal(parsed.ok, true);
	const catalog = buildCatalog(resolveGatewayConfig(undefined, parsed.value));
	assert.equal(catalog.ok, true);

	const adaptive = catalog.value.models.find((model) => model.id === "fixture-adaptive-model");
	assert.equal(adaptive?.compat?.forceAdaptiveThinking, true);
	assert.equal(adaptive?.compat?.supportsStrictTools, true);
	assert.equal(adaptive?.compat?.supportsToolReferences, true);
	assert.equal(adaptive?.thinkingLevelMap?.max, "max");
	assert.equal(adaptive?.contextWindow, 1000000);
	const openaiRoute = catalog.value.routes.get("custom-openai-responses-model");
	assert.equal(openaiRoute?.backend, "openai");
	assert.equal(openaiRoute?.responseVerbosity, "medium");
	assert.equal(openaiRoute?.reasoningContext, "all_turns");
});

test("partial local model overlays preserve gateway limits", () => {
	const document = parseGatewayDocument({
		config: {
			provider: {
				"cloudflare-workers-ai": {
					models: {
						"@cf/deepseek-ai/deepseek-v4-pro": {
							limit: { context: 393216, output: 32000 },
						},
					},
				},
			},
		},
	});
	const overlay = parseGatewayLocalOverlay({
		provider: {
			"cloudflare-workers-ai": {
				models: {
					"@cf/deepseek-ai/deepseek-v4-pro": {
						id: "workers-ai/@cf/deepseek-ai/deepseek-v4-pro",
					},
				},
			},
		},
	});
	assert.equal(document.ok, true);
	assert.equal(overlay.ok, true);
	const catalog = buildCatalog(resolveGatewayConfig(document.value, overlay.value));
	assert.equal(catalog.ok, true);
	const model = catalog.value.models.find((candidate) => candidate.id === "@cf/deepseek-ai/deepseek-v4-pro");
	assert.equal(model?.contextWindow, 393216);
	assert.equal(model?.maxTokens, 32000);
});

test("models without discovered limits use the fallback context window", () => {
	const overlay = parseGatewayLocalOverlay({
		provider: {
			"cloudflare-workers-ai": {
				models: {
					"@cf/example/model": {
						id: "workers-ai/@cf/example/model",
					},
				},
			},
		},
	});
	assert.equal(overlay.ok, true);
	const catalog = buildCatalog(resolveGatewayConfig(undefined, overlay.value));
	assert.equal(catalog.ok, true);
	const model = catalog.value.models.find((candidate) => candidate.id === "@cf/example/model");
	assert.equal(model?.contextWindow, 128000);
});

test("partial compatibility overrides preserve built-in safety flags", () => {
	const overlay = parseGatewayLocalOverlay({
		provider: {
			anthropic: {
				models: {
					"anthropic/claude-opus-4-7": { compat: { forceAdaptiveThinking: true } },
				},
			},
		},
	});
	assert.equal(overlay.ok, true);
	const catalog = buildCatalog(resolveGatewayConfig(undefined, overlay.value));
	assert.equal(catalog.ok, true);
	const model = catalog.value.models.find((candidate) => candidate.id === "claude-opus-4-7");
	assert.equal(model?.compat?.forceAdaptiveThinking, true);
	assert.equal(model?.compat?.supportsTemperature, false);
});

test("rejects malformed known fields at the configuration boundary", () => {
	const parsed = parseGatewayDocument({
		config: {
			provider: {
				openai: { models: { broken: { reasoning: "yes" } } },
			},
		},
	});
	assert.equal(parsed.ok, false);
	assert.match(parsed.error.message, /broken\.reasoning/);
});

test("keeps discovery on the auth origin and inference on the gateway origin", () => {
	const parsed = parseGatewayDocument({
		remote_config: {
			url: "https://opencode.cloudflare.dev/config/opencode.json",
			headers: { "cf-access-token": "{env:TOKEN}" },
		},
		config: {
			provider: {
				openai: { options: { baseURL: "https://gateway.opencode.cloudflare.dev/openai" } },
			},
		},
	});
	assert.equal(parsed.ok, true);
	assert.equal(parsed.value.remoteConfig?.url, "https://opencode.cloudflare.dev/config/opencode.json");
	assert.equal(parsed.value.providers.openai?.baseUrl, "https://gateway.opencode.cloudflare.dev/openai");
});

test("rejects route URLs that could exfiltrate gateway credentials", () => {
	const parsed = parseGatewayDocument({
		config: {
			provider: {
				openai: { options: { baseURL: "https://attacker.example/openai" } },
			},
		},
	});
	assert.equal(parsed.ok, false);
	assert.match(parsed.error.message, /a URL on https:\/\/gateway\.opencode\.cloudflare\.dev/);
});

test("configuration fetch observes cancellation", async () => {
	const store = createGatewayConfigStore({
		fetch: async (_url, init) => new Promise((_resolve, reject) => {
			init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
		}),
		readTextFile: () => undefined,
		localConfigPath: () => "/tmp/overlay.jsonc",
		resolveToken: () => undefined,
		now: () => 1,
		requestTimeoutMs: 1000,
	});
	const controller = new AbortController();
	const pending = store.load({ fallbackToDefault: false, signal: controller.signal });
	controller.abort();
	const loaded = await pending;
	assert.equal(loaded.ok, false);
	assert.equal(loaded.error.reason, "network");
});

test("configuration store owns cache, fallback, and local parse failures", async () => {
	let now = 1000;
	let fetches = 0;
	let fetchMode = "live";
	let overlayText;
	const store = createGatewayConfigStore({
		fetch: async () => {
			fetches += 1;
			return fetchMode === "live"
				? new Response(fixtureText, { status: 200, headers: { "content-type": "application/json" } })
				: new Response("unavailable", { status: 503, statusText: "Unavailable" });
		},
		readTextFile: () => overlayText,
		localConfigPath: () => "/tmp/overlay.jsonc",
		resolveToken: () => "fixture-token",
		now: () => now,
	});

	const first = await store.load();
	const cached = await store.load();
	assert.equal(first.ok, true);
	assert.equal(cached.ok, true);
	assert.equal(fetches, 1);
	assert.equal(store.status().cacheSource, "live");

	now += 60001;
	fetchMode = "unavailable";
	const stale = await store.load();
	assert.equal(stale.ok, true);
	assert.equal(stale.value.source, "live");
	assert.match(store.status().lastFetchError ?? "", /503 Unavailable/);

	store.clear();
	const coldFallback = await store.load();
	assert.equal(coldFallback.ok, true);
	assert.equal(coldFallback.value.source, "fallback");

	overlayText = "{ provider: invalid }";
	store.clear();
	const invalidOverlay = await store.load();
	assert.equal(invalidOverlay.ok, false);
	assert.equal(invalidOverlay.error.reason, "local-json");
});
