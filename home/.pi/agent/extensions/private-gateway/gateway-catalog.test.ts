import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpGatewayDiscovery, type GatewayModelMetadata } from "./gateway-discovery.ts";
import { HttpGatewayInventory, diffGatewayInventories } from "./gateway-inventory.ts";
import { GatewayRequestError } from "./gateway-http.ts";
import { NativeGatewayCatalog } from "./gateway-catalog.ts";
import { RecordingGatewayHttp, exampleGatewayProfile, exampleGatewayToken } from "./gateway-test-fixtures.ts";

const profile = exampleGatewayProfile(), token = exampleGatewayToken(), signal = new AbortController().signal;

test("well-known merges authenticated remote configuration without executing advertised commands", async () => {
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
		auth: { env: "ACCESS", command: ["never-execute-this"] },
		remote_config: { url: `${profile.authOrigin}/config`, headers: { Authorization: "Bearer {env:ACCESS}" } },
		config: { enabled_providers: ["openai"], provider: { openai: { models: { "gpt-4o": {} } } } },
	} : { provider: { openai: { models: { "gpt-4o": { name: "Overridden name" } } } } });
	const result = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal);
	assert.ok(result.ok);
	assert.equal(http.requests.length, 2);
	assert.equal(http.requests[0]?.token, undefined);
	assert.equal(http.requests[1]?.token, token);
	assert.equal(http.requests[1]?.headers?.Authorization, `Bearer ${token.reveal()}`);
	assert.equal(result.value.routes[0]?.models?.["gpt-4o"]?.name, "Overridden name");
});

test("untrusted route and remote-config URLs are rejected before sending credentials", async () => {
	for (const body of [
		{ remote_config: { url: "https://untrusted.test/config" } },
		{ provider: { openai: { options: { baseURL: "https://untrusted.test/openai" } } } },
	]) {
		const http = new RecordingGatewayHttp(() => body);
		const loaded = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal);
		assert.ok(!loaded.ok && loaded.error.reason === "untrusted-url");
		assert.equal(http.requests.length, 1);
	}
});

test("inventory follows Google pagination, retains metadata, ignores discovery filters, and rejects partial pages", async () => {
	let failing = false;
	const http = new RecordingGatewayHttp((url, operation) => {
		if (operation === "discovery") return { enabled_providers: ["google"], provider: { google: { blacklist: ["example-a"], models: {} } } };
		if (url.searchParams.has("pageToken")) return failing ? new GatewayRequestError("http", "model-list", 403) : { models: [{ name: "models/example-b" }] };
		return { models: [{ name: "models/example-a", inputTokenLimit: 1000, outputTokenLimit: 100 }], nextPageToken: "next" };
	});
	const loaded = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal);
	assert.ok(loaded.ok);
	const source = new HttpGatewayInventory(http);
	const inventory = await source.listGateway(loaded.value, token, signal, "google");
	const entry = inventory[0]; assert.ok(entry?.status === "listed");
	assert.deepEqual(entry.models.map((model) => model.id), ["example-a", "example-b"]);
	assert.equal(entry.models[0]?.metadata.limit?.context, 1000);
	failing = true;
	const partial = await source.listGateway(loaded.value, token, signal, "google");
	assert.equal(partial[0]?.status, "unavailable");
	const delta = diffGatewayInventories(partial, inventory);
	assert.deepEqual(delta.unknownBackends, ["google"]);
	assert.deepEqual(delta.onlyTo, []);
});

test("server whitelists are authoritative and an explicit empty whitelist stays empty", async () => {
	let declarations: Record<string, GatewayModelMetadata> = { "gpt-4o": {} };
	const http = new RecordingGatewayHttp(() => ({ enabled_providers: ["openai"], provider: { openai: { models: declarations, whitelist: Object.keys(declarations) } } }));
	const discovery = new HttpGatewayDiscovery(http), catalog = new NativeGatewayCatalog(new HttpGatewayInventory(http));
	const load = async () => {
		const resolved = await discovery.loadDiscovery(profile, token, signal); assert.ok(resolved.ok);
		return catalog.loadCatalog(profile, resolved.value, token, signal);
	};
	const first = await load(); assert.ok(first.ok);
	assert.deepEqual(first.value.models.map((model) => model.id), ["gpt-4o"]);
	assert.equal(first.value.models[0]?.api, "openai-responses");
	assert.equal(first.value.models[0]?.provider, profile.id);
	declarations = {};
	const empty = await load(); assert.ok(empty.ok); assert.equal(empty.value.models.length, 0);
	assert.equal(http.requests.some((request) => request.operation === "model-list"), false);
});

test("unsupported model-list falls back; auth and transient failures never become fallback catalogs", async () => {
	let status = 405;
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? { enabled_providers: ["openai"] } : new GatewayRequestError("http", "model-list", status));
	const discovery = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovery.ok);
	const catalog = new NativeGatewayCatalog(new HttpGatewayInventory(http));
	const fallback = await catalog.loadCatalog(profile, discovery.value, token, signal); assert.ok(fallback.ok);
	assert.ok(fallback.value.models.some((model) => model.id === "gpt-4o"));
	assert.equal(fallback.value.warnings.length, 1);
	for (status of [401, 403, 500]) assert.equal((await catalog.loadCatalog(profile, discovery.value, token, signal)).ok, false);
});

test("new Anthropic models use live adaptive-thinking capabilities, not hardcoded private model names", async () => {
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? { enabled_providers: ["anthropic"] } : {
		data: [{ id: "example-new-anthropic-model", max_input_tokens: 250_000, max_tokens: 32_000, capabilities: {
			thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: false } } },
			effort: { supported: true, high: { supported: true }, max: { supported: true } },
			image_input: { supported: true },
		} }], has_more: false,
	});
	const discovery = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovery.ok);
	const result = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovery.value, token, signal); assert.ok(result.ok);
	const model = result.value.models[0]; assert.ok(model);
	assert.equal(model.contextWindow, 250_000);
	assert.deepEqual(model.input, ["text", "image"]);
	assert.equal(model.thinkingLevelMap?.off, null);
	assert.equal(model.thinkingLevelMap?.max, "max");
	assert.ok(model.compat && "forceAdaptiveThinking" in model.compat && model.compat.forceAdaptiveThinking);
});

test("named native routes work without hardcoded aliases and explicit includes avoid unrelated backend failures", async () => {
	const profile = exampleGatewayProfile("gateway-b", { include: ["example-special-request"] });
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
		enabled_providers: ["anthropic", "google", "named-route", "unknown-plugin"],
		provider: { "named-route": { npm: "@ai-sdk/anthropic", options: { baseURL: `${profile.inferenceOrigin}/anthropic` },
			models: { "example-alias": { id: "example-special-request", limit: { context: 250_000, output: 32_000 }, reasoning: true } }, whitelist: ["example-alias"],
		} },
	} : new GatewayRequestError("http", "model-list", 403));
	const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
	const catalog = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovered.value, token, signal); assert.ok(catalog.ok);
	assert.deepEqual(catalog.value.models.map((model) => model.id), ["example-special-request"]);
	assert.equal(http.requests.length, 1);
	assert.ok(catalog.value.warnings.some((warning) => warning.includes("1 enabled provider")));
});

test("model overlays supplement live membership and server blacklist still wins", async () => {
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
		enabled_providers: ["openai"], provider: { openai: {
			models: { "gpt-4o": { name: "Updated" }, "example-declared-alias": { limit: { context: 128_000, output: 16_000 } } },
			blacklist: ["gpt-4o-mini"],
		} },
	} : { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] });
	const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
	const catalog = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovered.value, token, signal); assert.ok(catalog.ok);
	assert.deepEqual(catalog.value.models.map((model) => model.id).sort(), ["example-declared-alias", "gpt-4o"]);
	assert.equal(catalog.value.models.find((model) => model.id === "gpt-4o")?.name, "Updated");
});

test("Workers AI direct lists retain bare IDs, whereas unified lists exclude unrelated routes", async () => {
	for (const [path, expected] of [["/workers-ai/v1", ["@cf/example-model"]], ["/compat", ["workers-ai/@cf/example-model"]]] as const) {
		const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
			enabled_providers: ["cloudflare-workers-ai"], provider: { "cloudflare-workers-ai": { options: { baseURL: `${profile.inferenceOrigin}${path}` } } },
		} : { data: path === "/compat" ? [{ id: "workers-ai/@cf/example-model" }, { id: "openai/unrelated" }] : [{ id: "@cf/example-model" }] });
		const discovery = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovery.ok);
		const inventory = await new HttpGatewayInventory(http).listGateway(discovery.value, token, signal, "workers-ai");
		const entry = inventory[0]; assert.ok(entry?.status === "listed");
		assert.deepEqual(entry.models.map((model) => model.id), expected);
	}
});

test("a declared alias overlays its live request ID and keeps authoritative live capabilities", async () => {
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
		enabled_providers: ["anthropic"], provider: { anthropic: { models: {
			"friendly-alias": { id: "example-live-model", name: "Friendly", limit: { context: 400_000 } },
		} } },
	} : { data: [{ id: "example-live-model", max_input_tokens: 200_000, max_tokens: 32_000, capabilities: { image_input: { supported: true } } }] });
	const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
	const result = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovered.value, token, signal); assert.ok(result.ok);
	assert.equal(result.value.models.length, 1);
	assert.equal(result.value.models[0]?.id, "example-live-model");
	assert.equal(result.value.models[0]?.name, "Friendly");
	assert.equal(result.value.models[0]?.contextWindow, 400_000);
	assert.equal(result.value.models[0]?.maxTokens, 32_000);
	assert.deepEqual(result.value.models[0]?.input, ["text", "image"]);
});

test("blacklisting an alias does not remove its otherwise allowed live request ID", async () => {
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
		enabled_providers: ["openai"], provider: { openai: {
			models: { "blocked-alias": { id: "gpt-4o", name: "Must not override" } }, blacklist: ["blocked-alias"],
		} },
	} : { data: [{ id: "gpt-4o" }] });
	const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
	const result = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovered.value, token, signal); assert.ok(result.ok);
	assert.equal(result.value.models.length, 1);
	assert.notEqual(result.value.models[0]?.name, "Must not override");
});

test("multiple declarations of one request ID are still rejected as ambiguous", async () => {
	for (const whitelist of [undefined, ["alias-a", "alias-b"], ["gpt-4o"]]) {
		const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? {
			enabled_providers: ["openai"], provider: { openai: {
				models: { "alias-a": { id: "gpt-4o" }, "alias-b": { id: "gpt-4o" } }, whitelist,
			} },
		} : { data: [{ id: "gpt-4o" }] });
		const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
		const result = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovered.value, token, signal);
		assert.ok(!result.ok && result.error.reason === "duplicate-id");
	}
});

test("capability schema rejects malformed known values but tolerates unknown fields", async () => {
	for (const capabilities of [{ thinking: "yes" }, { effort: { high: { supported: "yes" } } }, { image_input: null }]) {
		const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? { enabled_providers: ["anthropic"] }
			: { data: [{ id: "example-model", capabilities }] });
		const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
		const [entry] = await new HttpGatewayInventory(http).listGateway(discovered.value, token, signal, "anthropic");
		assert.ok(entry?.status === "unavailable" && entry.error.reason === "document");
	}
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? { enabled_providers: ["anthropic"] }
		: { data: [{ id: "example-model", capabilities: { future_capability: { anything: true }, image_input: { supported: true, extra: 1 } } }] });
	const discovered = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovered.ok);
	const [entry] = await new HttpGatewayInventory(http).listGateway(discovered.value, token, signal, "anthropic");
	assert.equal(entry?.status, "listed");
});

test("unknown catalog IDs without token-limit metadata are reported, never assigned invented large limits", async () => {
	const http = new RecordingGatewayHttp((_url, operation) => operation === "discovery" ? { enabled_providers: ["openai"] } : { data: [{ id: "example-unknown-model" }] });
	const discovery = await new HttpGatewayDiscovery(http).loadDiscovery(profile, token, signal); assert.ok(discovery.ok);
	const result = await new NativeGatewayCatalog(new HttpGatewayInventory(http)).loadCatalog(profile, discovery.value, token, signal); assert.ok(result.ok);
	assert.equal(result.value.models.length, 0);
	assert.match(result.value.warnings.join(), /1 listed IDs/);
	assert.doesNotMatch(result.value.warnings.join(), /example-unknown-model/);
});
