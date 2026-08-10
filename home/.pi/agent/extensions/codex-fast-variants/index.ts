import type { Api, Model } from "@earendil-works/pi-ai";
import { getModels } from "@earendil-works/pi-ai/compat";
import type {
	ExtensionFactory,
	ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";

import { createCodexAccessToken } from "./codex-access-token.ts";
import {
	type CodexFastCatalogFetch,
	fetchCodexFastModelCatalog,
	fetchLatestCodexClientVersion,
} from "./codex-fast-catalog.ts";
import { createCodexFastStream } from "./codex-fast-stream.ts";
import {
	createCodexFastVariantModels,
	restoreCodexFastVariantModels,
} from "./codex-fast-variants.ts";
type CodexModel = Model<"openai-codex-responses">;

/** Runtime dependencies for Codex Fast Mode discovery. */
export interface CodexFastVariantsDependencies {
	/** Fetch implementation used only for official Codex metadata and the authenticated catalog. */
	readonly fetchCatalog: CodexFastCatalogFetch;
}

function isCodexModel(model: Model<Api>): model is CodexModel {
	return model.provider === "openai-codex" && model.api === "openai-codex-responses";
}

function toProviderModelConfig(model: CodexModel): ProviderModelConfig {
	return {
		id: model.id,
		name: model.name,
		api: model.api,
		baseUrl: model.baseUrl,
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		input: [...model.input],
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		compat: model.compat,
	};
}

function buildProviderModelCatalog(
	baseModels: readonly CodexModel[],
	fastVariants: readonly CodexModel[],
): ProviderModelConfig[] {
	return [...baseModels, ...fastVariants].map(toProviderModelConfig);
}

/** Create a Pi extension that discovers and routes selectable Codex `-fast` model variants. */
export function createCodexFastVariantsExtension(
	dependencies: CodexFastVariantsDependencies,
): ExtensionFactory {
	return (pi) => {
		const baseModels = getModels("openai-codex").filter(isCodexModel);
		const baseUrl = baseModels[0]?.baseUrl;
		if (!baseUrl) {
			throw new Error("Codex Fast built-in provider has no base URL");
		}

		pi.registerProvider("openai-codex", {
			api: "openai-codex-responses",
			baseUrl,
			models: buildProviderModelCatalog(baseModels, []),
			streamSimple: createCodexFastStream(baseModels),
			async refreshModels(context) {
				const storedVariants = restoreCodexFastVariantModels(
					baseModels,
					context.stored?.models ?? [],
				);
				const storedCatalog = buildProviderModelCatalog(baseModels, storedVariants);
				if (!context.allowNetwork || context.credential?.type !== "oauth") {
					return storedCatalog;
				}

				const clientVersionResult = await fetchLatestCodexClientVersion(
					dependencies.fetchCatalog,
					context.signal,
				);
				if (!clientVersionResult.ok) return storedCatalog;
				const catalogResult = await fetchCodexFastModelCatalog({
					baseUrl,
					clientVersion: clientVersionResult.value,
					accessToken: createCodexAccessToken(context.credential.access),
					fetch: dependencies.fetchCatalog,
					signal: context.signal,
				});
				if (!catalogResult.ok) return storedCatalog;

				const fastVariants = createCodexFastVariantModels(
					baseModels,
					catalogResult.value.fastCapableModelIds,
				);
				await context.publish({
					persist: { models: fastVariants },
				});
				return buildProviderModelCatalog(baseModels, fastVariants);
			},
		});

	};
}

/** Register Codex Fast Mode variants using Pi's runtime fetch implementation. */
export default function codexFastVariantsExtension(
	pi: Parameters<ExtensionFactory>[0],
): void {
	createCodexFastVariantsExtension({ fetchCatalog: globalThis.fetch })(pi);
}
