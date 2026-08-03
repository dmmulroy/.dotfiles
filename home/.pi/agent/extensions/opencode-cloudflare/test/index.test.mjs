import assert from "node:assert/strict";
import { test } from "node:test";
import registerOpencodeCloudflare from "../index.ts";
import {
	LOCAL_CONFIG_ENV,
	OPENCODE_AUTH_FILE_ENV,
	TOKEN_ENV_OVERRIDE,
} from "../constants.ts";

function createExtensionApiHarness() {
	const handlers = new Map();
	const providerRegistrations = [];
	return {
		api: {
			registerProvider(name, config) {
				providerRegistrations.push({ name, config });
			},
			registerCommand() {},
			on(event, handler) {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			},
		},
		handlers,
		providerRegistrations,
	};
}

function createProviderModelsStore(initialEntry) {
	let entry = initialEntry;
	return {
		async read() {
			return structuredClone(entry);
		},
		async write(nextEntry) {
			entry = structuredClone(nextEntry);
		},
		async delete() {
			entry = undefined;
		},
	};
}

function restoreEnvironment(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

function isolateProductionCredentials() {
	const previous = {
		authFile: process.env[OPENCODE_AUTH_FILE_ENV],
		localConfig: process.env[LOCAL_CONFIG_ENV],
		token: process.env[TOKEN_ENV_OVERRIDE],
	};
	process.env[OPENCODE_AUTH_FILE_ENV] = "/tmp/opencode-cloudflare-test-missing-auth.json";
	process.env[LOCAL_CONFIG_ENV] = "/tmp/opencode-cloudflare-test-missing-overlay.jsonc";
	delete process.env[TOKEN_ENV_OVERRIDE];
	return () => {
		restoreEnvironment(OPENCODE_AUTH_FILE_ENV, previous.authFile);
		restoreEnvironment(LOCAL_CONFIG_ENV, previous.localConfig);
		restoreEnvironment(TOKEN_ENV_OVERRIDE, previous.token);
	};
}

test("provider startup registers fallback models before refreshing the live catalog", async () => {
	const restoreCredentials = isolateProductionCredentials();
	const originalFetch = globalThis.fetch;
	let resolveFetch;
	let fetchCount = 0;
	globalThis.fetch = () => {
		fetchCount += 1;
		return new Promise((resolve) => {
			resolveFetch = resolve;
		});
	};
	try {
		const harness = createExtensionApiHarness();
		await registerOpencodeCloudflare(harness.api);
		assert.equal(fetchCount, 0);
		assert.equal(harness.providerRegistrations.length, 1);
		const store = createProviderModelsStore();
		await harness.providerRegistrations[0].config.refreshModels({ store, allowNetwork: false });

		let resolveLiveRegistration;
		const liveRegistration = new Promise((resolve) => {
			resolveLiveRegistration = resolve;
		});
		const originalRegisterProvider = harness.api.registerProvider;
		harness.api.registerProvider = (name, config) => {
			originalRegisterProvider(name, config);
			if (harness.providerRegistrations.length === 2) resolveLiveRegistration();
		};
		const sessionStart = harness.handlers.get("session_start")?.[0];
		assert.ok(sessionStart);
		const result = sessionStart(
			{ type: "session_start", reason: "startup" },
			{ ui: { notify() {} } },
		);
		assert.equal(result, undefined);
		assert.equal(fetchCount, 1);
		assert.equal(harness.providerRegistrations.length, 1);
		const input = harness.handlers.get("input")?.[0];
		assert.ok(input);
		let inputSettled = false;
		const inputResult = input(
			{ type: "input", text: "hello", source: "interactive" },
			{ ui: { notify() {} } },
		).then(() => {
			inputSettled = true;
		});
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(inputSettled, false);

		resolveFetch(new Response(JSON.stringify({
			config: {
				provider: {
					"cloudflare-workers-ai": {
						models: {
							"@cf/example/model": { limit: { context: 393216, output: 32000 } },
						},
					},
				},
			},
		}), { status: 200, headers: { "content-type": "application/json" } }));
		await liveRegistration;
		await inputResult;
		assert.equal(inputSettled, true);
		const refreshedModel = harness.providerRegistrations[1].config.models.find(
			(candidate) => candidate.id === "@cf/example/model",
		);
		assert.equal(refreshedModel?.contextWindow, 393216);
		assert.equal(refreshedModel?.maxTokens, 32000);
		const cached = await store.read();
		const cachedModel = cached?.models.find((candidate) => candidate.id === "@cf/example/model");
		assert.equal(cachedModel?.contextWindow, 393216);
		assert.equal(cachedModel?.maxTokens, 32000);
	} finally {
		globalThis.fetch = originalFetch;
		restoreCredentials();
	}
});

test("live model refresh persists the discovered catalog", async () => {
	const restoreCredentials = isolateProductionCredentials();
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify({
		config: {
			provider: {
				"cloudflare-workers-ai": {
					models: {
						"@cf/example/persisted-model": { limit: { context: 393216, output: 32000 } },
					},
				},
			},
		},
	}), { status: 200, headers: { "content-type": "application/json" } });
	try {
		const store = createProviderModelsStore();
		const harness = createExtensionApiHarness();
		await registerOpencodeCloudflare(harness.api);
		const refreshModels = harness.providerRegistrations[0].config.refreshModels;
		await refreshModels({ store, allowNetwork: true });

		const cached = await store.read();
		const model = cached?.models.find((candidate) => candidate.id === "@cf/example/persisted-model");
		assert.equal(model?.provider, "opencode.cloudflare.dev");
		assert.equal(model?.contextWindow, 393216);
		assert.equal(model?.maxTokens, 32000);
		assert.equal(typeof cached?.checkedAt, "number");
	} finally {
		globalThis.fetch = originalFetch;
		restoreCredentials();
	}
});

test("cache-only model refresh restores a persisted catalog without network access", async () => {
	const restoreCredentials = isolateProductionCredentials();
	const originalFetch = globalThis.fetch;
	let fetchCount = 0;
	globalThis.fetch = async () => {
		fetchCount += 1;
		throw new Error("cache-only refresh must not use the network");
	};
	try {
		const store = createProviderModelsStore({
			models: [{
				id: "@cf/example/persisted-model",
				name: "Persisted Model",
				api: "opencode-cloudflare",
				provider: "opencode.cloudflare.dev",
				baseUrl: "https://gateway.opencode.cloudflare.dev",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 393216,
				maxTokens: 32000,
			}],
			checkedAt: 123456789,
		});
		const harness = createExtensionApiHarness();
		await registerOpencodeCloudflare(harness.api);
		const refreshModels = harness.providerRegistrations[0].config.refreshModels;
		const models = await refreshModels({ store, allowNetwork: false });

		assert.equal(fetchCount, 0);
		const model = models.find((candidate) => candidate.id === "@cf/example/persisted-model");
		assert.equal(model?.contextWindow, 393216);
		assert.equal(model?.maxTokens, 32000);
	} finally {
		globalThis.fetch = originalFetch;
		restoreCredentials();
	}
});

test("failed live refresh preserves the last persisted catalog", async () => {
	const restoreCredentials = isolateProductionCredentials();
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		throw new Error("gateway unavailable");
	};
	try {
		const persistedModel = {
			id: "@cf/example/last-known-model",
			name: "Last Known Model",
			api: "opencode-cloudflare",
			provider: "opencode.cloudflare.dev",
			baseUrl: "https://gateway.opencode.cloudflare.dev",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 393216,
			maxTokens: 32000,
		};
		const store = createProviderModelsStore({ models: [persistedModel], checkedAt: 123456789 });
		const harness = createExtensionApiHarness();
		await registerOpencodeCloudflare(harness.api);
		const refreshModels = harness.providerRegistrations[0].config.refreshModels;
		await refreshModels({ store, allowNetwork: true });

		const cached = await store.read();
		assert.deepEqual(cached, { models: [persistedModel], checkedAt: 123456789 });
	} finally {
		globalThis.fetch = originalFetch;
		restoreCredentials();
	}
});

test("session shutdown aborts an in-flight catalog refresh", async () => {
	const restoreCredentials = isolateProductionCredentials();
	const originalFetch = globalThis.fetch;
	let requestSignal;
	globalThis.fetch = (_url, init) => {
		requestSignal = init.signal;
		return new Promise((_resolve, reject) => {
			init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
		});
	};
	try {
		const harness = createExtensionApiHarness();
		await registerOpencodeCloudflare(harness.api);
		const sessionStart = harness.handlers.get("session_start")?.[0];
		const sessionShutdown = harness.handlers.get("session_shutdown")?.[0];
		assert.ok(sessionStart);
		assert.ok(sessionShutdown);
		sessionStart(
			{ type: "session_start", reason: "startup" },
			{ ui: { notify() {} } },
		);
		assert.equal(requestSignal.aborted, false);
		sessionShutdown(
			{ type: "session_shutdown", reason: "quit" },
			{ ui: { notify() {} } },
		);
		assert.equal(requestSignal.aborted, true);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(harness.providerRegistrations.length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		restoreCredentials();
	}
});

test("offline startup does not refresh the live catalog", async () => {
	const restoreCredentials = isolateProductionCredentials();
	const originalFetch = globalThis.fetch;
	const previousOffline = process.env.PI_OFFLINE;
	let fetchCount = 0;
	process.env.PI_OFFLINE = "1";
	globalThis.fetch = async () => {
		fetchCount += 1;
		return new Response("{}", { status: 200 });
	};
	try {
		const harness = createExtensionApiHarness();
		await registerOpencodeCloudflare(harness.api);
		const sessionStart = harness.handlers.get("session_start")?.[0];
		sessionStart?.(
			{ type: "session_start", reason: "startup" },
			{ ui: { notify() {} } },
		);
		assert.equal(fetchCount, 0);
		assert.equal(harness.providerRegistrations.length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnvironment("PI_OFFLINE", previousOffline);
		restoreCredentials();
	}
});
