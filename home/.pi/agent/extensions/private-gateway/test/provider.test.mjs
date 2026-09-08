import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createModels, InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { createOpenCodeAuthSource } from "../auth.ts";
import { buildDoctorReport } from "../doctor.ts";
import { collectGatewaySecretsFromAuth, redactGatewayMessageEnd, sanitizeGatewaySecretText } from "../redact-gateway-secrets.ts";
import { createPrivateGatewayProvider } from "../provider.ts";
import { FIXTURE_PRIMARY_GATEWAY, FIXTURE_PROFILES, PRIMARY_GATEWAY, SECONDARY_GATEWAY, TEST_PROFILES } from "./profiles.mjs";

const fixturePath = fileURLToPath(new URL("./fixtures/wellknown.json", import.meta.url));
const fixtureText = readFileSync(fixturePath, "utf8");
const gatewayToken = "cf-access-token-value";

function createFetch(handler) {
	return async (input, init) => handler(typeof input === "string" ? input : input.url, init ?? {});
}

async function withGlobalFetch(fetchImpl, run) {
	const original = globalThis.fetch;
	globalThis.fetch = fetchImpl;
	try {
		return await run();
	} finally {
		globalThis.fetch = original;
	}
}

function createAuthSource(files = {}) {
	return createOpenCodeAuthSource({
		environment: () => undefined,
		homeDirectory: () => "/home/tester",
		fileExists: (path) => Object.hasOwn(files, path),
		readTextFile: (path) => files[path],
		now: () => 1000,
		trustedAuthOrigins: [FIXTURE_PRIMARY_GATEWAY.authOrigin, PRIMARY_GATEWAY.authOrigin, SECONDARY_GATEWAY.authOrigin],
	});
}

function createPrimaryProvider(overrides = {}) {
	return createPrivateGatewayProvider({
		profile: FIXTURE_PRIMARY_GATEWAY,
		profiles: FIXTURE_PROFILES,
		authSource: createAuthSource(),
		environment: () => undefined,
		...overrides,
	});
}

test("native provider projects models and uses backend-specific APIs", async () => {
	const provider = createPrimaryProvider({
		authSource: createAuthSource(),
		fetch: createFetch(async (url) => {
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(fixtureText, { status: 200, headers: { "content-type": "application/json" } });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => gatewayToken,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login("opencode.cloudflare.dev", "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});
	const refreshed = await models.refresh({ force: true });
	assert.equal(refreshed.errors.size, 0);
	const catalog = models.getModels("opencode.cloudflare.dev");
	const gpt = catalog.find((model) => model.id === "gpt-4o");
	const workers = catalog.find((model) => model.id.includes("kimi-k2.6"));
	const anthropic = catalog.find((model) => model.api === "anthropic-messages");
	const google = catalog.find((model) => model.api === "google-generative-ai");
	assert.equal(gpt?.api, "openai-responses");
	assert.equal(workers?.api, "openai-completions");
	assert.equal(anthropic?.api, "anthropic-messages");
	assert.equal(google?.api, "google-generative-ai");
	assert.ok(catalog.every((model) => model.provider === "opencode.cloudflare.dev"));
});

test("native provider discovers gateway models absent from Pi's built-in catalog", async () => {
	const requests = [];
	const provider = createPrimaryProvider({
		fetch: createFetch(async (url, init) => {
			requests.push({ url, headers: new Headers(init.headers) });
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(JSON.stringify({
					enabled_providers: ["openai"],
					provider: {
						openai: { options: { baseURL: `${FIXTURE_PRIMARY_GATEWAY.gatewayOrigin}/openai` } },
					},
				}), { status: 200 });
			}
			if (url === `${FIXTURE_PRIMARY_GATEWAY.gatewayOrigin}/openai/models`) {
				return new Response(JSON.stringify({
					object: "list",
					data: [{ id: "placeholder-future-openai-model", object: "model" }],
				}), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => gatewayToken,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login("opencode.cloudflare.dev", "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});

	const refreshed = await models.refresh({ force: true });

	assert.equal(refreshed.errors.size, 0);
	const discovered = models.getModel("opencode.cloudflare.dev", "placeholder-future-openai-model");
	assert.ok(discovered);
	assert.equal(discovered.api, "openai-responses");
	assert.equal(discovered.baseUrl, `${FIXTURE_PRIMARY_GATEWAY.gatewayOrigin}/openai`);
	const catalogRequest = requests.find(({ url }) => url.endsWith("/openai/models"));
	assert.ok(catalogRequest);
	assert.equal(catalogRequest.headers.get("authorization"), `Bearer ${gatewayToken}`);
	assert.equal(catalogRequest.headers.get("cf-access-token"), gatewayToken);
});

test("native provider applies public metadata to a newly discovered OpenAI model", async () => {
	const provider = createPrimaryProvider({
		fetch: createFetch(async (url) => {
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(JSON.stringify({ enabled_providers: ["openai"] }), { status: 200 });
			}
			if (url.endsWith("/openai/models")) {
				return new Response(JSON.stringify({ data: [{ id: "gpt-6-astra" }] }), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => gatewayToken,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login("opencode.cloudflare.dev", "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});

	await models.refresh({ force: true });

	const discovered = models.getModel("opencode.cloudflare.dev", "gpt-6-astra");
	assert.ok(discovered);
	assert.equal(discovered.contextWindow, 1_050_000);
	assert.equal(discovered.maxTokens, 128_000);
	assert.deepEqual(discovered.input, ["text", "image"]);
	assert.equal(discovered.thinkingLevelMap?.off, null);
	assert.equal(discovered.thinkingLevelMap?.max, "max");
});

test("native provider discovers models with an imported token when Pi has no stored credential", async () => {
	const authPath = "/home/tester/.local/share/opencode/auth.json";
	const provider = createPrimaryProvider({
		authSource: createAuthSource({
			[authPath]: JSON.stringify({
				[FIXTURE_PRIMARY_GATEWAY.authOrigin]: { token: gatewayToken },
			}),
		}),
		fetch: createFetch(async (url, init) => {
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(JSON.stringify({ enabled_providers: ["openai"] }), { status: 200 });
			}
			if (url.endsWith("/openai/models")) {
				assert.equal(new Headers(init.headers).get("cf-access-token"), gatewayToken);
				return new Response(JSON.stringify({ data: [{ id: "placeholder-imported-token-model" }] }), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => undefined,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);

	const refreshed = await models.refresh({ force: true });

	assert.equal(refreshed.errors.size, 0);
	assert.ok(models.getModels("opencode.cloudflare.dev").some(({ id }) => id === "placeholder-imported-token-model"));
});

test("native provider discovers each enabled backend model-list format", async () => {
	const provider = createPrimaryProvider({
		fetch: createFetch(async (url, init) => {
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(JSON.stringify({
					enabled_providers: ["anthropic", "google", "xai", "cloudflare-workers-ai"],
				}), { status: 200 });
			}
			if (url.endsWith("/anthropic/v1/models")) {
				assert.equal(new Headers(init.headers).get("anthropic-version"), "2023-06-01");
				return new Response(JSON.stringify({ data: [{
					id: "placeholder-future-anthropic-model",
					display_name: "Placeholder Future Anthropic Model",
					max_input_tokens: 1_000_000,
					max_tokens: 128_000,
					capabilities: {
						image_input: { supported: true },
						thinking: { supported: true, types: { enabled: { supported: false }, adaptive: { supported: true } } },
						effort: { supported: true, low: { supported: true }, max: { supported: true } },
					},
				}] }), { status: 200 });
			}
			if (url.endsWith("/google-ai-studio/v1beta/models")) {
				return new Response(JSON.stringify({ models: [{ name: "models/placeholder-future-google-model" }] }), { status: 200 });
			}
			if (url.endsWith("/grok/models")) {
				return new Response(JSON.stringify({ data: [{ id: "placeholder-future-xai-model" }] }), { status: 200 });
			}
			if (url.endsWith("/compat/models")) {
				return new Response(JSON.stringify({ data: [
					{ id: "openai/placeholder-unrelated-model" },
					{ id: "workers-ai/placeholder-future-workers-model" },
				] }), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => gatewayToken,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login("opencode.cloudflare.dev", "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});

	const refreshed = await models.refresh({ force: true });

	assert.equal(refreshed.errors.size, 0);
	const catalog = models.getModels("opencode.cloudflare.dev");
	const anthropic = catalog.find(({ id }) => id === "placeholder-future-anthropic-model");
	assert.equal(anthropic?.api, "anthropic-messages");
	assert.equal(anthropic?.name, "Placeholder Future Anthropic Model");
	assert.equal(anthropic?.contextWindow, 1_000_000);
	assert.equal(anthropic?.maxTokens, 128_000);
	assert.deepEqual(anthropic?.input, ["text", "image"]);
	assert.equal(anthropic?.thinkingLevelMap?.off, null);
	assert.equal(anthropic?.thinkingLevelMap?.low, "low");
	assert.equal(anthropic?.thinkingLevelMap?.medium, null);
	assert.equal(anthropic?.thinkingLevelMap?.max, "max");
	assert.equal(anthropic?.compat?.forceAdaptiveThinking, true);
	assert.ok(catalog.some(({ id, api }) => id === "placeholder-future-google-model" && api === "google-generative-ai"));
	assert.ok(catalog.some(({ id, api }) => id === "placeholder-future-xai-model" && api === "openai-completions"));
	assert.ok(catalog.some(({ id, api }) => id === "workers-ai/placeholder-future-workers-model" && api === "openai-completions"));
	assert.ok(!catalog.some(({ id }) => id === "openai/placeholder-unrelated-model"));
});

test("native credential resolution and Access headers reach inference", async () => {
	const captured = [];
	const fetchImpl = createFetch(async (url, init) => {
		if (url.endsWith("/.well-known/opencode")) {
			return new Response(JSON.stringify({
				enabled_providers: ["openai"],
				provider: {
					openai: {
						options: { baseURL: "https://gateway.opencode.cloudflare.dev/openai" },
						models: { "gpt-4o": {} },
					},
				},
			}), { status: 200 });
		}
		captured.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body ?? "{}")) });
		return new Response(
			'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
			{ status: 200, headers: { "content-type": "text/event-stream" } },
		);
	});
	await withGlobalFetch(fetchImpl, async () => {
		const provider = createPrimaryProvider({
			authSource: createAuthSource(),
			fetch: fetchImpl,
		});
		const models = createModels({
			credentials: new InMemoryCredentialStore(),
			modelsStore: new InMemoryModelsStore(),
			authContext: {
				env: async () => undefined,
				fileExists: async () => false,
			},
		});
		models.setProvider(provider);
		await models.login("opencode.cloudflare.dev", "api_key", {
			signal: new AbortController().signal,
			prompt: async () => gatewayToken,
			notify() {},
		});
		await models.refresh({ force: true });
		const model = models.getModel("opencode.cloudflare.dev", "gpt-4o");
		assert.ok(model);
		const result = await models.completeSimple(model, {
			messages: [{ role: "user", content: "Reply", timestamp: 1 }],
		});
		assert.equal(result.stopReason === "error" ? result.errorMessage : undefined, undefined);
		assert.equal(captured.length, 1);
		assert.equal(captured[0].url, "https://gateway.opencode.cloudflare.dev/openai/responses");
		assert.equal(captured[0].headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(captured[0].headers.get("cf-access-token"), gatewayToken);
	});
});

test("Anthropic and Google wrappers keep Access auth out of native key headers", async () => {
	const captured = [];
	const fetchImpl = createFetch(async (url, init) => {
		if (url.endsWith("/.well-known/opencode")) {
			return new Response(JSON.stringify({
				enabled_providers: ["anthropic", "google"],
				provider: {
					anthropic: {
						options: { baseURL: "https://gateway.opencode.cloudflare.dev/anthropic" },
						models: { "claude-haiku-4-5": { reasoning: true } },
					},
					google: {
						options: { baseURL: "https://gateway.opencode.cloudflare.dev/google-ai-studio/v1beta" },
						models: { "gemini-2.5-flash": {} },
					},
				},
			}), { status: 200 });
		}
		captured.push({ url, headers: new Headers(init.headers) });
		if (url.includes("/anthropic/")) {
			return new Response([
				'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
				'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
				'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
				'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
				'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}\n\n',
				'event: message_stop\ndata: {"type":"message_stop"}\n\n',
			].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
		}
		return new Response(
			'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n',
			{ status: 200, headers: { "content-type": "text/event-stream" } },
		);
	});
	await withGlobalFetch(fetchImpl, async () => {
		const provider = createPrimaryProvider({
			authSource: createAuthSource(),
			fetch: fetchImpl,
		});
		const models = createModels({
			credentials: new InMemoryCredentialStore(),
			modelsStore: new InMemoryModelsStore(),
			authContext: {
				env: async () => undefined,
				fileExists: async () => false,
			},
		});
		models.setProvider(provider);
		await models.login("opencode.cloudflare.dev", "api_key", {
			signal: new AbortController().signal,
			prompt: async () => gatewayToken,
			notify() {},
		});
		await models.refresh({ force: true });

		const anthropic = models.getModel("opencode.cloudflare.dev", "claude-haiku-4-5");
		const google = models.getModel("opencode.cloudflare.dev", "gemini-2.5-flash");
		assert.ok(anthropic);
		assert.ok(google);
		await models.completeSimple(anthropic, { messages: [{ role: "user", content: "Reply", timestamp: 1 }] });
		await models.completeSimple(google, { messages: [{ role: "user", content: "Reply", timestamp: 1 }] });

		const anthropicRequest = captured.find((request) => request.url.includes("/anthropic/"));
		const googleRequest = captured.find((request) => request.url.includes("/google-ai-studio/"));
		assert.ok(anthropicRequest);
		assert.ok(googleRequest);
		assert.equal(anthropicRequest.headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(anthropicRequest.headers.get("x-api-key"), null);
		assert.equal(googleRequest.headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(googleRequest.headers.get("x-goog-api-key"), "gateway-authenticated");
		assert.doesNotMatch(googleRequest.url, new RegExp(gatewayToken));
	});
});

test("unavailable discovery with no stored catalog leaves an empty model list", async () => {
	const provider = createPrimaryProvider({
		authSource: createAuthSource(),
		fetch: createFetch(async () => new Response("unavailable", { status: 503 })),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => gatewayToken,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login("opencode.cloudflare.dev", "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});
	const refreshed = await models.refresh({ force: true });
	assert.equal(refreshed.errors.size, 1);
	assert.equal(models.getModels("opencode.cloudflare.dev").length, 0);
});

test("doctor reports health without leaking tokens", async () => {
	const report = await buildDoctorReport({
		profiles: FIXTURE_PROFILES,
		now: 1000,
		environment: (name) => name === "PRIVATE_GATEWAY_PRIMARY_TOKEN" ? gatewayToken : undefined,
		authSource: createAuthSource(),
		fetch: createFetch(async (url) => {
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(fixtureText, { status: 200, headers: { "content-type": "application/json" } });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
		piAuthStatuses: { [FIXTURE_PRIMARY_GATEWAY.id]: "stored" },
	});
	assert.match(report, /Private Gateway doctor/);
	assert.match(report, /Live discovery: ok/);
	assert.match(report, /Enabled backends:/);
	assert.match(report, /Models available: /);
	assert.doesNotMatch(report, new RegExp(gatewayToken));
});

test("doctor includes models discovered from the gateway model-list endpoint", async () => {
	const report = await buildDoctorReport({
		profiles: FIXTURE_PROFILES,
		now: 1000,
		environment: (name) => name === "PRIVATE_GATEWAY_PRIMARY_TOKEN" ? gatewayToken : undefined,
		authSource: createAuthSource(),
		fetch: createFetch(async (url) => {
			if (url.endsWith("/.well-known/opencode")) {
				return new Response(JSON.stringify({ enabled_providers: ["openai"] }), { status: 200 });
			}
			if (url.endsWith("/openai/models")) {
				return new Response(JSON.stringify({ data: [{ id: "placeholder-future-openai-model" }] }), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});

	assert.match(report, /Models available: 1/);
});

test("doctor stays clean when live discovery is unavailable", async () => {
	const report = await buildDoctorReport({
		profiles: FIXTURE_PROFILES,
		now: 1000,
		environment: () => undefined,
		authSource: createAuthSource(),
		fetch: createFetch(async () => new Response("unavailable", { status: 503, statusText: "Unavailable" })),
		piAuthStatuses: { [FIXTURE_PRIMARY_GATEWAY.id]: "missing" },
	});
	assert.match(report, /Live discovery: Gateway configuration request failed with HTTP 503 Unavailable/);
	assert.match(report, /Models available: 0/);
	assert.match(report, /Catalog: unavailable/);
});

test("doctor reports secondary models after omitting primary gateway duplicates", async () => {
	const authPath = "/home/tester/.local/share/opencode/auth.json";
	const report = await buildDoctorReport({
		profiles: [FIXTURE_PRIMARY_GATEWAY, SECONDARY_GATEWAY],
		now: 1000,
		environment: () => undefined,
		authSource: createAuthSource({
			[authPath]: JSON.stringify({
				[FIXTURE_PRIMARY_GATEWAY.authOrigin]: { token: gatewayToken },
				[SECONDARY_GATEWAY.authOrigin]: { token: gatewayToken },
			}),
		}),
		fetch: createFetch(async (url) => {
			if (url === `${FIXTURE_PRIMARY_GATEWAY.authOrigin}/.well-known/opencode`) {
				return new Response(JSON.stringify({
					enabled_providers: ["openai"],
					provider: {
						openai: {
							options: { baseURL: `${FIXTURE_PRIMARY_GATEWAY.gatewayOrigin}/openai` },
							models: { "gpt-4o": {} },
						},
					},
				}), { status: 200 });
			}
			if (url === `${SECONDARY_GATEWAY.authOrigin}/.well-known/opencode`) {
				return new Response(JSON.stringify({
					enabled_providers: ["openai"],
					provider: {
						openai: {
							options: { baseURL: `${SECONDARY_GATEWAY.gatewayOrigin}/openai` },
							models: {
								"gpt-4o": {},
								"placeholder-secondary-model": { name: "Placeholder Secondary Model" },
							},
						},
					},
				}), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
		piAuthStatuses: {
			[FIXTURE_PRIMARY_GATEWAY.id]: "stored",
			[SECONDARY_GATEWAY.id]: "stored",
		},
	});
	const secondarySection = report.split("\n\n").find((section) => section.startsWith("Private Gateway 2 doctor"));
	assert.ok(secondarySection);
	assert.match(secondarySection, /Models available: 1/);
	assert.match(secondarySection, /Live discovery: ok/);
});

test("collects secrets from Pi-resolved provider auth", () => {
	const secrets = collectGatewaySecretsFromAuth({
		auth: {
			apiKey: gatewayToken,
			headers: {
				Authorization: `Bearer ${gatewayToken}`,
				"cf-access-token": gatewayToken,
			},
		},
		source: "stored credential",
	});
	assert.deepEqual(secrets, [gatewayToken]);
});

test("secret sanitizer removes tokens from error text", () => {
	const sanitized = sanitizeGatewaySecretText(`Invalid token ${gatewayToken}`, [gatewayToken]);
	assert.equal(sanitized, "Invalid token <redacted>");
	assert.doesNotMatch(sanitized, new RegExp(gatewayToken));
});

test("message_end redacts secondary gateway tokens from persisted assistant errors", () => {
	const rewritten = redactGatewayMessageEnd(
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				provider: SECONDARY_GATEWAY.id,
				stopReason: "error",
				errorMessage: `Invalid token ${gatewayToken}`,
			},
		},
		{ model: { provider: SECONDARY_GATEWAY.id } },
		[gatewayToken],
		TEST_PROFILES,
	);
	assert.equal(rewritten?.message.errorMessage, "Invalid token <redacted>");
});

test("message_end redacts gateway tokens from persisted assistant errors", () => {
	const rewritten = redactGatewayMessageEnd(
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				provider: "opencode.cloudflare.dev",
				stopReason: "error",
				errorMessage: `Invalid token ${gatewayToken}`,
			},
		},
		{ model: { provider: "opencode.cloudflare.dev" } },
		[gatewayToken],
		FIXTURE_PROFILES,
	);
	assert.equal(rewritten?.message.errorMessage, "Invalid token <redacted>");
	assert.doesNotMatch(rewritten?.message.errorMessage ?? "", new RegExp(gatewayToken));
});

test("native secondary provider projects models onto the secondary provider id", async () => {
	const provider = createPrivateGatewayProvider({
		profile: SECONDARY_GATEWAY,
		profiles: TEST_PROFILES,
		authSource: createAuthSource(),
		environment: () => undefined,
		fetch: createFetch(async (url) => {
			if (url === "https://secondary.example.test/.well-known/opencode") {
				return new Response(JSON.stringify({
					enabled_providers: ["anthropic"],
					provider: {
						anthropic: {
							options: { baseURL: "https://secondary-gateway.example.test/anthropic" },
							models: { "placeholder-secondary-model": { name: "Placeholder Secondary Model", reasoning: true } },
						},
					},
				}), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => gatewayToken,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login(SECONDARY_GATEWAY.id, "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});
	const refreshed = await models.refresh({ force: true });
	assert.equal(refreshed.errors.size, 0);
	const catalog = models.getModels(SECONDARY_GATEWAY.id);
	assert.ok(catalog.some((model) => model.id === "placeholder-secondary-model"));
	assert.ok(catalog.every((model) => model.provider === SECONDARY_GATEWAY.id));
	assert.ok(catalog.every((model) => model.baseUrl.startsWith(SECONDARY_GATEWAY.gatewayOrigin)));
});

test("Secondary catalog omits models already served by the primary gateway", async () => {
	const authPath = "/home/tester/.local/share/opencode/auth.json";
	const provider = createPrivateGatewayProvider({
		profile: SECONDARY_GATEWAY,
		profiles: [FIXTURE_PRIMARY_GATEWAY, SECONDARY_GATEWAY],
		authSource: createAuthSource({
			[authPath]: JSON.stringify({
				[FIXTURE_PRIMARY_GATEWAY.authOrigin]: { token: "primary-token" },
				[SECONDARY_GATEWAY.authOrigin]: { token: "secondary-token" },
			}),
		}),
		environment: () => undefined,
		fetch: createFetch(async (url) => {
			if (url === `${SECONDARY_GATEWAY.authOrigin}/.well-known/opencode`) {
				return new Response(JSON.stringify({
					enabled_providers: ["openai"],
					provider: {
						openai: {
							options: { baseURL: `${SECONDARY_GATEWAY.gatewayOrigin}/openai` },
							models: {
								"gpt-4o": {},
								"placeholder-secondary-model": { name: "Placeholder Secondary Model" },
							},
						},
					},
				}), { status: 200 });
			}
			if (url === `${FIXTURE_PRIMARY_GATEWAY.authOrigin}/.well-known/opencode`) {
				return new Response(JSON.stringify({
					enabled_providers: ["openai"],
					provider: {
						openai: {
							options: { baseURL: `${FIXTURE_PRIMARY_GATEWAY.gatewayOrigin}/openai` },
							models: { "gpt-4o": {} },
						},
					},
				}), { status: 200 });
			}
			throw new Error(`unexpected fetch ${url}`);
		}),
	});
	const models = createModels({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		authContext: {
			env: async () => undefined,
			fileExists: async () => false,
		},
	});
	models.setProvider(provider);
	await models.login(SECONDARY_GATEWAY.id, "api_key", {
		signal: new AbortController().signal,
		prompt: async () => gatewayToken,
		notify() {},
	});
	const refreshed = await models.refresh({ force: true });
	assert.equal(refreshed.errors.size, 0);
	const catalog = models.getModels(SECONDARY_GATEWAY.id);
	assert.deepEqual(catalog.map((model) => model.id), ["placeholder-secondary-model"]);
	assert.ok(catalog.every((model) => model.provider === SECONDARY_GATEWAY.id));
});

test("message_end leaves unrelated providers and non-error turns unchanged", () => {
	const unrelated = redactGatewayMessageEnd(
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				provider: "openai",
				stopReason: "error",
				errorMessage: `Invalid token ${gatewayToken}`,
			},
		},
		{ model: { provider: "openai" } },
		[gatewayToken],
		FIXTURE_PROFILES,
	);
	assert.equal(unrelated, undefined);

	const success = redactGatewayMessageEnd(
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				provider: "opencode.cloudflare.dev",
				stopReason: "stop",
				errorMessage: `Invalid token ${gatewayToken}`,
			},
		},
		{ model: { provider: "opencode.cloudflare.dev" } },
		[gatewayToken],
		FIXTURE_PROFILES,
	);
	assert.equal(success, undefined);
});
