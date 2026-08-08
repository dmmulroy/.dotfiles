import assert from "node:assert/strict";
import test from "node:test";

import type { ModelsPublication, OAuthCredential } from "@earendil-works/pi-ai";
import { getModels } from "@earendil-works/pi-ai/compat";
import type {
	ExtensionAPI,
	ProviderConfig,
	ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";

import { createCodexTestAccessToken } from "./codex-fast-test-fixtures.ts";
import { createCodexFastVariantsExtension } from "./index.ts";

type RegisteredHandler = (event: unknown, context: unknown) => unknown;

function requireHandler(
	handlers: ReadonlyMap<string, unknown>,
	eventName: string,
): RegisteredHandler {
	const handler = handlers.get(eventName);
	assert.equal(typeof handler, "function");
	// SAFETY: The recording ExtensionAPI stores handlers unchanged, and the assertion above proves this value is callable. Tests supply the event/context shape registered for eventName.
	return handler as RegisteredHandler;
}

function requireFastModel(
	catalog: readonly ProviderModelConfig[],
	baseModelId: string,
): ProviderModelConfig {
	const fastModel = catalog.find((model) => model.id === `${baseModelId}-fast`);
	assert.ok(fastModel);
	return fastModel;
}

test("extension routes discovered Fast variants and preserves cached variants across discovery failures", async () => {
	let registeredProviderName: string | undefined;
	let registeredProviderConfig: ProviderConfig | undefined;
	const handlers = new Map<string, unknown>();
	const recordingApi = {
		registerProvider(providerName: string, providerConfig: ProviderConfig) {
			registeredProviderName = providerName;
			registeredProviderConfig = providerConfig;
		},
		on(eventName: string, handler: unknown) {
			handlers.set(eventName, handler);
		},
	};
	// SAFETY: createCodexFastVariantsExtension uses only registerProvider and on; recordingApi faithfully implements those ExtensionAPI operations for this integration test.
	const pi = recordingApi as unknown as ExtensionAPI;
	const builtInModel = getModels("openai-codex")[0];
	assert.ok(builtInModel);

	let discoveryFailure: "none" | "client-version" | "catalog" = "none";
	createCodexFastVariantsExtension({
		fetchCatalog: async (input) => {
			if (input.toString() === "https://registry.npmjs.org/@openai/codex/latest") {
				return discoveryFailure === "client-version"
					? new Response("unavailable", { status: 503 })
					: new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 });
			}
			return discoveryFailure === "catalog"
				? new Response("unavailable", { status: 503 })
				: new Response(
						JSON.stringify({
							models: [
								{ slug: builtInModel.id, service_tiers: [{ id: "priority" }] },
							],
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					);
		},
	})(pi);

	assert.equal(registeredProviderName, "openai-codex");
	assert.ok(registeredProviderConfig?.refreshModels);
	const credential: OAuthCredential = {
		type: "oauth",
		access: createCodexTestAccessToken("account-test"),
		refresh: "refresh-secret",
		expires: Date.now() + 60_000,
	};
	let persisted: ModelsPublication["persist"];
	const refreshedCatalog = await registeredProviderConfig.refreshModels({
		credential,
		allowNetwork: true,
		signal: new AbortController().signal,
		async publish(publication) {
			persisted = publication.persist;
			publication.update?.();
			return true;
		},
	});

	const fastModelConfig = requireFastModel(refreshedCatalog, builtInModel.id);
	assert.equal(persisted && persisted !== null ? persisted.models.length : 0, 1);

	discoveryFailure = "client-version";
	assert.ok(persisted && persisted !== null);
	const cachedCatalog = await registeredProviderConfig.refreshModels({
		credential,
		stored: persisted,
		allowNetwork: true,
		signal: new AbortController().signal,
		async publish(publication) {
			publication.update?.();
			return true;
		},
	});
	assert.equal(requireFastModel(cachedCatalog, builtInModel.id).id, fastModelConfig.id);

	discoveryFailure = "catalog";
	const catalogFailureFallback = await registeredProviderConfig.refreshModels({
		credential,
		stored: persisted,
		allowNetwork: true,
		signal: new AbortController().signal,
		async publish(publication) {
			publication.update?.();
			return true;
		},
	});
	assert.equal(requireFastModel(catalogFailureFallback, builtInModel.id).id, fastModelConfig.id);

	const authenticationFailureFallback = await registeredProviderConfig.refreshModels({
		credential: { ...credential, access: "not-a-jwt" },
		stored: persisted,
		allowNetwork: true,
		signal: new AbortController().signal,
		async publish(publication) {
			publication.update?.();
			return true;
		},
	});
	assert.equal(requireFastModel(authenticationFailureFallback, builtInModel.id).id, fastModelConfig.id);

	const fastModel = {
		...fastModelConfig,
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: builtInModel.baseUrl,
	};
	const rewriteRequest = requireHandler(handlers, "before_provider_request");
	const rewrittenPayload = await rewriteRequest(
		{ type: "before_provider_request", payload: { model: fastModel.id } },
		{ model: fastModel },
	);
	assert.deepEqual(rewrittenPayload, {
		model: builtInModel.id,
		service_tier: "priority",
	});

	const addHeaders = requireHandler(handlers, "before_provider_headers");
	const headers: Record<string, string> = {};
	await addHeaders(
		{ type: "before_provider_headers", headers },
		{ model: fastModel },
	);
	assert.equal(
		headers["x-codex-routing-hint"],
		`model=${builtInModel.id};tier=priority`,
	);

});
