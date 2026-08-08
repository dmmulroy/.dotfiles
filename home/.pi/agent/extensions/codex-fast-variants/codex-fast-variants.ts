import type { Api, Model } from "@earendil-works/pi-ai";

const CODEX_FAST_VARIANT_SUFFIX = "-fast";

type CodexModel = Model<"openai-codex-responses">;

/** Create selectable `-fast` variants for built-in Codex models that advertise Fast Mode. */
export function createCodexFastVariantModels(
	baseModels: readonly CodexModel[],
	fastCapableModelIds: ReadonlySet<string>,
): readonly CodexModel[] {
	const baseModelIds = new Set(baseModels.map((model) => model.id));
	return baseModels.flatMap((model) => {
		if (!fastCapableModelIds.has(model.id)) return [];
		const variantId = `${model.id}${CODEX_FAST_VARIANT_SUFFIX}`;
		if (baseModelIds.has(variantId)) return [];
		return [{ ...model, id: variantId, name: `${model.name} (Fast)` }];
	});
}

/** Resolve a visible Fast Mode variant to an exact model in the built-in Codex catalog. */
export function resolveCodexFastUpstreamModelId(
	visibleModelId: string,
	baseModels: readonly Model<Api>[],
): string | undefined {
	if (!visibleModelId.endsWith(CODEX_FAST_VARIANT_SUFFIX)) return undefined;
	const upstreamModelId = visibleModelId.slice(0, -CODEX_FAST_VARIANT_SUFFIX.length);
	return baseModels.some(
		(model) =>
			model.id === upstreamModelId &&
			`${model.id}${CODEX_FAST_VARIANT_SUFFIX}` === visibleModelId,
	)
		? upstreamModelId
		: undefined;
}

/** Rebuild cached Fast Mode variants with metadata from the current built-in Codex catalog. */
export function restoreCodexFastVariantModels(
	baseModels: readonly CodexModel[],
	storedModels: readonly Model<Api>[],
): readonly CodexModel[] {
	const storedUpstreamModelIds = new Set(
		storedModels.flatMap((model) => {
			if (model.provider !== "openai-codex") return [];
			const upstreamModelId = resolveCodexFastUpstreamModelId(model.id, baseModels);
			return upstreamModelId ? [upstreamModelId] : [];
		}),
	);
	return createCodexFastVariantModels(baseModels, storedUpstreamModelIds);
}
