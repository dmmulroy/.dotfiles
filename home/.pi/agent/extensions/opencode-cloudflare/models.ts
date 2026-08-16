import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { PROVIDER_ID, type Backend } from "./constants.ts";
import {
	type GatewayConfig,
	type GatewayHeaderMap,
	type GatewayModelConfig,
	type GatewayModelConfigMap,
	stripRoutePrefix,
} from "./discovery.ts";

const WORKERS_COMPAT: NonNullable<Model<"openai-completions">["compat"]> = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens",
};

const OPENAI_COMPLETIONS_COMPAT: NonNullable<Model<"openai-completions">["compat"]> = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
};

/** Catalog construction failure. */
export class GatewayCatalogError extends Error {
	readonly _tag = "GatewayCatalogError" as const;

	/**
	 * Create a catalog failure.
	 *
	 * @param reason - Stable failure classification.
	 * @param modelId - Model involved in the failure, when applicable.
	 */
	constructor(
		readonly reason: "duplicate-model",
		readonly modelId?: string,
	) {
		super(`Gateway catalog contains duplicate model id: ${modelId ?? "unknown"}`);
		this.name = "GatewayCatalogError";
	}
}

function normalizeInputModalities(config: GatewayModelConfig): ("text" | "image")[] {
	const input = config.inputModalities?.filter((value): value is "text" | "image" => value === "text" || value === "image");
	if (input?.length) return [...input];
	return config.attachment ? ["text", "image"] : ["text"];
}

function resolveGatewayModelConfig(
	modelId: string,
	models: GatewayModelConfigMap,
	backend: Backend,
): GatewayModelConfig | undefined {
	return models[modelId] ?? models[`${backend}/${modelId}`] ?? models[`anthropic/${modelId}`];
}

function isBlacklistedModel(
	modelId: string,
	backend: Backend,
	blacklist: readonly string[] | undefined,
	config?: GatewayModelConfig,
): boolean {
	if (!blacklist?.length) return false;
	const denied = new Set(blacklist.flatMap((id) => [id, stripRoutePrefix(id, backend)]));
	const candidates = [modelId, stripRoutePrefix(modelId, backend)];
	if (config?.requestModelId) {
		candidates.push(config.requestModelId, stripRoutePrefix(config.requestModelId, backend));
	}
	return candidates.some((candidate) => denied.has(candidate));
}

const AUTH_HEADER_NAMES = new Set(["authorization", "cf-access-token", "x-api-key"]);

function modelHeaders(headers: GatewayHeaderMap): GatewayHeaderMap | undefined {
	const filtered = Object.fromEntries(
		Object.entries(headers).filter(([name, value]) => {
			if (AUTH_HEADER_NAMES.has(name.toLowerCase())) return false;
			return !value.includes("{env:");
		}),
	);
	return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function applyGatewayOverrides(model: Model<Api>, config: GatewayModelConfig | undefined): Model<Api> {
	if (!config) return model;
	return {
		...model,
		id: config.requestModelId ?? model.id,
		name: config.name ?? model.name,
		reasoning: config.reasoning ?? model.reasoning,
		thinkingLevelMap: config.thinkingLevelMap ?? model.thinkingLevelMap,
		input: config.inputModalities || config.attachment !== undefined ? normalizeInputModalities(config) : model.input,
		cost: {
			input: config.inputCost ?? model.cost.input,
			output: config.outputCost ?? model.cost.output,
			cacheRead: config.cacheReadCost ?? model.cost.cacheRead,
			cacheWrite: config.cacheWriteCost ?? model.cost.cacheWrite,
		},
		contextWindow: config.contextWindow ?? model.contextWindow,
		maxTokens: config.maxTokens ?? model.maxTokens,
		compat: config.compat ? { ...model.compat, ...config.compat } : model.compat,
	};
}

function toModelFromGateway(
	modelId: string,
	config: GatewayModelConfig,
	api: Api,
	baseUrl: string,
	headers?: GatewayHeaderMap,
	compat?: Model<Api>["compat"],
): Model<Api> {
	return {
		id: config.requestModelId ?? modelId,
		name: config.name ?? modelId,
		api,
		provider: PROVIDER_ID,
		baseUrl,
		reasoning: config.reasoning ?? true,
		thinkingLevelMap: config.thinkingLevelMap,
		input: normalizeInputModalities(config),
		cost: {
			input: config.inputCost ?? 0,
			output: config.outputCost ?? 0,
			cacheRead: config.cacheReadCost ?? 0,
			cacheWrite: config.cacheWriteCost ?? 0,
		},
		contextWindow: config.contextWindow ?? 128000,
		maxTokens: config.maxTokens ?? 16384,
		headers: modelHeaders(headers ?? {}),
		compat: config.compat ?? compat,
	};
}

function projectBuiltInModel(
	model: Model<Api>,
	baseUrl: string,
	headers: GatewayHeaderMap,
	config: GatewayModelConfig | undefined,
): Model<Api> {
	return applyGatewayOverrides({
		...model,
		provider: PROVIDER_ID,
		baseUrl,
		headers: modelHeaders(headers),
	}, config);
}

function getBackendApi(backend: Exclude<Backend, "workers-ai">): Api {
	switch (backend) {
		case "anthropic":
			return "anthropic-messages";
		case "openai":
			return "openai-responses";
		case "google":
			return "google-generative-ai";
		case "xai":
			return "openai-completions";
	}
}

function builtinCatalog(backend: Exclude<Backend, "workers-ai">): readonly Model<Api>[] {
	switch (backend) {
		case "anthropic":
			return getBuiltinModels("anthropic");
		case "openai":
			return getBuiltinModels("openai");
		case "google":
			return getBuiltinModels("google");
		case "xai":
			return getBuiltinModels("xai");
	}
}

/**
 * Project gateway policy onto Pi models with final api, baseUrl, and request IDs.
 *
 * @param config - Resolved gateway configuration.
 * @returns Final Pi models ready for native mixed-API dispatch.
 */
export function projectGatewayModels(config: GatewayConfig): readonly Model<Api>[] {
	const models: Model<Api>[] = [];
	const seen = new Set<string>();

	const add = (model: Model<Api>): void => {
		if (seen.has(model.id)) {
			throw new GatewayCatalogError("duplicate-model", model.id);
		}
		seen.add(model.id);
		models.push(model);
	};

	for (const backend of config.enabledBackends) {
		const route = config.routes[backend];
		if (backend === "workers-ai") {
			const whitelist = route.whitelist?.length ? new Set(route.whitelist) : undefined;
			for (const [fullModelId, modelConfig] of Object.entries(route.models)) {
				const modelId = stripRoutePrefix(fullModelId, backend);
				if (whitelist && !whitelist.has(fullModelId) && !whitelist.has(modelId)) continue;
				if (isBlacklistedModel(fullModelId, backend, route.blacklist, modelConfig)) continue;
				const model = toModelFromGateway(
					modelId,
					modelConfig,
					"openai-completions",
					route.baseUrl,
					route.headers,
					WORKERS_COMPAT,
				);
				model.name = `${fullModelId} (${modelConfig.name ?? modelId})`;
				model.compat = { ...WORKERS_COMPAT, ...modelConfig.compat };
				add(model);
			}
			continue;
		}

		let builtIns = [...builtinCatalog(backend)];
		if (backend === "openai" && route.hasGatewayModels) {
			const allowlist = new Set(Object.keys(route.models).map((id) => stripRoutePrefix(id, backend)));
			builtIns = builtIns.filter((model) => allowlist.has(model.id));
		}
		const used = new Set<string>();
		for (const builtIn of builtIns) {
			const gatewayModel = resolveGatewayModelConfig(builtIn.id, route.models, backend);
			if (isBlacklistedModel(builtIn.id, backend, route.blacklist, gatewayModel)) continue;
			add(projectBuiltInModel(builtIn, route.baseUrl, route.headers, gatewayModel));
			used.add(builtIn.id);
		}
		for (const [fullModelId, modelConfig] of Object.entries(route.models)) {
			const modelId = stripRoutePrefix(fullModelId, backend);
			if (used.has(modelId) || isBlacklistedModel(fullModelId, backend, route.blacklist, modelConfig)) continue;
			const api = getBackendApi(backend);
			const compat = api === "openai-completions" ? OPENAI_COMPLETIONS_COMPAT : undefined;
			add(toModelFromGateway(modelId, modelConfig, api, route.baseUrl, route.headers, compat));
		}
	}
	return models;
}

function backendFromBaseUrl(baseUrl: string): Backend | undefined {
	if (baseUrl.includes("/anthropic")) return "anthropic";
	if (baseUrl.includes("/openai")) return "openai";
	if (baseUrl.includes("/google")) return "google";
	if (baseUrl.includes("/grok")) return "xai";
	if (baseUrl.includes("/compat")) return "workers-ai";
	return undefined;
}

/**
 * Render compact backend model counts.
 *
 * @param models - Projected gateway models.
 */
export function summarizeGatewayModels(models: readonly Model<Api>[]): string {
	const counts = { anthropic: 0, openai: 0, google: 0, xai: 0, "workers-ai": 0 } satisfies Record<Backend, number>;
	for (const model of models) {
		const backend = backendFromBaseUrl(model.baseUrl);
		if (backend) counts[backend] += 1;
	}
	return `anthropic=${counts.anthropic}, openai=${counts.openai}, google=${counts.google}, xai=${counts.xai}, workers-ai=${counts["workers-ai"]}`;
}
