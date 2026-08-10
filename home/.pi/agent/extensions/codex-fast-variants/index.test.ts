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

function requireFastModel(
	catalog: readonly ProviderModelConfig[],
	baseModelId: string,
): ProviderModelConfig {
	const fastModel = catalog.find((model) => model.id === `${baseModelId}-fast`);
	assert.ok(fastModel);
	return fastModel;
}

test("extension discovers Fast variants and preserves cached variants across discovery failures", async () => {
	let registeredProviderName: string | undefined;
	let registeredProviderConfig: ProviderConfig | undefined;
	const recordingApi = {
		registerProvider(providerName: string, providerConfig: ProviderConfig) {
			registeredProviderName = providerName;
			registeredProviderConfig = providerConfig;
		},
	};
	// SAFETY: createCodexFastVariantsExtension uses only registerProvider; recordingApi faithfully implements that ExtensionAPI operation for this integration test.
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

});
