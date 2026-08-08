import assert from "node:assert/strict";
import test from "node:test";

import { createCodexAccessToken } from "./codex-access-token.ts";
import {
	fetchCodexFastModelCatalog,
	fetchLatestCodexClientVersion,
	parseCodexFastModelCatalog,
} from "./codex-fast-catalog.ts";
import { createCodexTestAccessToken } from "./codex-fast-test-fixtures.ts";

test("parseCodexFastModelCatalog recognizes current and legacy Fast Mode metadata", () => {
	const result = parseCodexFastModelCatalog({
		models: [
			{ slug: "priority-model", service_tiers: [{ id: "priority" }] },
			{ slug: "legacy-model", additional_speed_tiers: ["fast"] },
			{ slug: "standard-model", service_tiers: [{ id: "default" }] },
		],
	});

	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.deepEqual(
		[...result.value.fastCapableModelIds].sort(),
		["legacy-model", "priority-model"],
	);
});

test("parseCodexFastModelCatalog rejects malformed capability fields", () => {
	const result = parseCodexFastModelCatalog({
		models: [{ slug: "malformed-model", service_tiers: [{ name: "Fast" }] }],
	});

	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.reason, "invalid-response");
});

test("fetchLatestCodexClientVersion reads version metadata without authentication", async () => {
	let observedHeaders: Headers | undefined;
	const result = await fetchLatestCodexClientVersion(
		async (input, init) => {
			assert.equal(input.toString(), "https://registry.npmjs.org/@openai/codex/latest");
			observedHeaders = new Headers(init.headers);
			return new Response(JSON.stringify({ version: "0.147.0" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
		new AbortController().signal,
	);

	assert.deepEqual(result, { ok: true, value: "0.147.0" });
	assert.equal(observedHeaders?.has("authorization"), false);
});

test("fetchCodexFastModelCatalog sends account-scoped authentication without exposing it in results", async () => {
	const access = createCodexTestAccessToken("account-test");
	let observedUrl: URL | undefined;
	let observedHeaders: Headers | undefined;

	const result = await fetchCodexFastModelCatalog({
		baseUrl: "https://chatgpt.example/backend-api",
		clientVersion: "1.2.3",
		accessToken: createCodexAccessToken(access),
		fetch: async (input, init) => {
			observedUrl = new URL(input);
			observedHeaders = new Headers(init.headers);
			return new Response(
				JSON.stringify({ models: [{ slug: "fast-model", service_tiers: [{ id: "priority" }] }] }),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		},
		signal: new AbortController().signal,
	});

	assert.equal(result.ok, true);
	assert.equal(observedUrl?.pathname, "/backend-api/codex/models");
	assert.equal(observedUrl?.searchParams.get("client_version"), "1.2.3");
	assert.equal(observedHeaders?.get("authorization"), `Bearer ${access}`);
	assert.equal(observedHeaders?.get("chatgpt-account-id"), "account-test");
	assert.equal(JSON.stringify(result).includes(access), false);
});

test("fetchLatestCodexClientVersion classifies remote and malformed responses", async () => {
	const signal = new AbortController().signal;
	const unavailable = await fetchLatestCodexClientVersion(
		async () => new Response("unavailable", { status: 503 }),
		signal,
	);
	const invalidJson = await fetchLatestCodexClientVersion(
		async () => new Response("{", { status: 200 }),
		signal,
	);
	const invalidVersion = await fetchLatestCodexClientVersion(
		async () => new Response(JSON.stringify({ version: "latest" }), { status: 200 }),
		signal,
	);
	const networkFailure = await fetchLatestCodexClientVersion(
		async () => Promise.reject(new Error("registry unavailable")),
		signal,
	);

	for (const result of [unavailable, invalidJson, invalidVersion, networkFailure]) {
		assert.equal(result.ok, false);
		if (!result.ok) assert.equal(result.error.reason, "client-version");
	}
});

test("fetchCodexFastModelCatalog rejects invalid authentication before network I/O", async () => {
	let fetchCalled = false;
	const result = await fetchCodexFastModelCatalog({
		baseUrl: "https://chatgpt.example/backend-api",
		clientVersion: "1.2.3",
		accessToken: createCodexAccessToken("not-a-jwt"),
		fetch: async () => {
			fetchCalled = true;
			return new Response("{}");
		},
		signal: new AbortController().signal,
	});

	assert.equal(result.ok, false);
	if (!result.ok) assert.equal(result.error.reason, "authentication");
	assert.equal(fetchCalled, false);
});

test("fetchCodexFastModelCatalog classifies network, abort, HTTP, and invalid JSON failures", async () => {
	const accessToken = createCodexAccessToken(createCodexTestAccessToken("account-test"));
	const request = {
		baseUrl: "https://chatgpt.example/backend-api",
		clientVersion: "1.2.3",
		accessToken,
		signal: new AbortController().signal,
	};
	const networkFailure = await fetchCodexFastModelCatalog({
		...request,
		fetch: async () => Promise.reject(new Error("network unavailable")),
	});
	const abortFailure = await fetchCodexFastModelCatalog({
		...request,
		fetch: async () => Promise.reject(new DOMException("aborted", "AbortError")),
	});
	const httpFailure = await fetchCodexFastModelCatalog({
		...request,
		fetch: async () => new Response("unauthorized", { status: 401 }),
	});
	const invalidJsonFailure = await fetchCodexFastModelCatalog({
		...request,
		fetch: async () => new Response("{", { status: 200 }),
	});

	for (const result of [networkFailure, abortFailure]) {
		assert.equal(result.ok, false);
		if (!result.ok) assert.equal(result.error.reason, "network");
	}
	assert.equal(httpFailure.ok, false);
	if (!httpFailure.ok) {
		assert.equal(httpFailure.error.reason, "http");
		assert.equal(httpFailure.error.status, 401);
	}
	assert.equal(invalidJsonFailure.ok, false);
	if (!invalidJsonFailure.ok) assert.equal(invalidJsonFailure.error.reason, "invalid-response");
});
