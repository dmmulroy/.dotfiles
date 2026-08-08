import assert from "node:assert/strict";
import test from "node:test";

import type { Model, ProviderHeaders } from "@earendil-works/pi-ai";

import {
	createCodexFastVariantModels,
	resolveCodexFastUpstreamModelId,
	restoreCodexFastVariantModels,
} from "./codex-fast-variants.ts";
import {
	addCodexFastRoutingHint,
	rewriteCodexFastRequestPayload,
} from "./codex-fast-request.ts";

function createTestCodexModel(id: string): Model<"openai-codex-responses"> {
	return {
		id,
		name: "Test Codex Model",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.example/backend-api",
		reasoning: true,
		input: ["text"],
		cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_000,
	};
}

test("createCodexFastVariantModels clones only advertised built-in models", () => {
	const models = [createTestCodexModel("model-a"), createTestCodexModel("model-b")];
	const variants = createCodexFastVariantModels(models, new Set(["model-b", "unknown-model"]));

	assert.deepEqual(
		variants.map(({ id, name }) => ({ id, name })),
		[{ id: "model-b-fast", name: "Test Codex Model (Fast)" }],
	);
	assert.equal(resolveCodexFastUpstreamModelId("model-b-fast", models), "model-b");
	assert.equal(resolveCodexFastUpstreamModelId("unknown-model-fast", models), undefined);
});

test("restoreCodexFastVariantModels refreshes cached variants from current base metadata", () => {
	const current = createTestCodexModel("model-a");
	const stale = { ...current, id: "model-a-fast", name: "Stale Name" };
	const restored = restoreCodexFastVariantModels([current], [stale]);

	assert.equal(restored.length, 1);
	assert.equal(restored[0]?.name, "Test Codex Model (Fast)");
});

test("Codex Fast request helpers reproduce official priority request semantics", () => {
	const models = [createTestCodexModel("model-a")];
	const payload = rewriteCodexFastRequestPayload(
		{ model: "model-a-fast", input: "hello" },
		"model-a-fast",
		models,
	);
	const headers: ProviderHeaders = {};
	addCodexFastRoutingHint(headers, "model-a-fast", models);

	assert.deepEqual(payload, {
		model: "model-a",
		input: "hello",
		service_tier: "priority",
	});
	assert.equal(headers["x-codex-routing-hint"], "model=model-a;tier=priority");
});

test("rewriteCodexFastRequestPayload leaves standard requests unchanged", () => {
	const models = [createTestCodexModel("model-a")];
	const payload = { model: "model-a", input: "hello" };

	assert.equal(rewriteCodexFastRequestPayload(payload, "model-a", models), payload);
});

test("rewriteCodexFastRequestPayload rejects an impossible non-object Fast request", () => {
	const models = [createTestCodexModel("model-a")];
	assert.throws(
		() => rewriteCodexFastRequestPayload("invalid", "model-a-fast", models),
		/Codex Fast request payload must be a JSON object/,
	);
});
