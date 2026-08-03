import { type Api, type Model } from "@earendil-works/pi-ai";
import { getModels } from "@earendil-works/pi-ai/compat";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { GatewayConfigStore, GatewayConfigLoadError } from "./config-store.ts";
import {
	type GatewayConfig,
	type GatewayModelConfig,
	stripRoutePrefix,
} from "./config.ts";
import type { Backend } from "./constants.ts";
import { failure, type Result, success } from "./result.ts";

/** OpenAI response verbosity accepted by the gateway. */
export type ResponseVerbosity = "low" | "medium" | "high";

/** OpenAI reasoning-context policy accepted by the gateway. */
export type ReasoningContext = "current_turn" | "all_turns";

interface RouteBase {
	readonly baseUrl: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly requestModelId?: string;
	readonly compat?: Model<Api>["compat"];
}

/** Route selected for a visible Pi model. */
export type RouteDescriptor =
	| (RouteBase & { readonly backend: "anthropic"; readonly api: "anthropic-messages" })
	| (RouteBase & {
		readonly backend: "openai";
		readonly api: "openai-responses";
		readonly responseVerbosity?: ResponseVerbosity;
		readonly reasoningContext?: ReasoningContext;
	})
	| (RouteBase & { readonly backend: "google"; readonly api: "google-generative-ai" })
	| (RouteBase & { readonly backend: "xai"; readonly api: "openai-completions" })
	| (RouteBase & { readonly backend: "workers-ai"; readonly api: "openai-completions" });

/** Models and route index produced from one gateway configuration. */
export interface CatalogData {
	readonly models: readonly ProviderModelConfig[];
	readonly routes: ReadonlyMap<string, RouteDescriptor>;
	readonly counts: Readonly<Record<Backend, number>>;
}

/** Route and configuration resolved from one atomic catalog snapshot. */
export interface CatalogRoute {
	readonly route: RouteDescriptor;
	readonly config: GatewayConfig;
}

/** Inputs controlling one catalog refresh. */
export interface CatalogRefreshOptions {
	readonly forceReload?: boolean;
	readonly allowNetwork?: boolean;
	readonly authToken?: string;
	readonly signal?: AbortSignal;
}

/** Catalog construction or lookup failure. */
export class CatalogError extends Error {
	readonly _tag = "CatalogError" as const;

	/**
	 * Create a catalog failure.
	 *
	 * @param reason - Stable failure classification.
	 * @param modelId - Model involved in the failure, when applicable.
	 * @param cause - Configuration loading failure retained for diagnostics.
	 */
	constructor(
		readonly reason: "configuration" | "duplicate-model" | "unknown-model" | "uninitialized",
		readonly modelId?: string,
		override readonly cause?: GatewayConfigLoadError,
	) {
		super(
			reason === "configuration"
				? cause?.message ?? "Gateway configuration failed"
				: reason === "duplicate-model"
					? `Gateway catalog contains duplicate model id: ${modelId ?? "unknown"}`
					: reason === "unknown-model"
						? `Unknown OpenCode Cloudflare model: ${modelId ?? "unknown"}`
						: "Gateway catalog has not been initialized",
		);
		this.name = "CatalogError";
	}
}

/** Instance-owned catalog service. */
export interface CatalogService {
	/** Return the current catalog, or an uninitialized failure. */
	current(): Result<CatalogData, CatalogError>;
	/** Refresh configuration and rebuild the catalog atomically. */
	refresh(options?: CatalogRefreshOptions): Promise<Result<CatalogData, CatalogError>>;
	/** Resolve a model route and configuration from one snapshot. */
	resolveRoute(modelId: string, signal?: AbortSignal): Promise<Result<CatalogRoute, CatalogError>>;
}

const DEFAULT_WORKERS_MODELS: Readonly<Record<string, GatewayModelConfig>> = {
	"@cf/moonshotai/kimi-k2.5": {
		requestModelId: "workers-ai/@cf/moonshotai/kimi-k2.5",
		name: "Kimi K2.5",
		attachment: true,
		reasoning: true,
		inputModalities: ["text", "image"],
		inputCost: 0.6,
		cacheReadCost: 0.1,
		outputCost: 3,
		contextWindow: 256000,
		maxTokens: 32000,
	},
	"@cf/moonshotai/kimi-k2.6": {
		requestModelId: "workers-ai/@cf/moonshotai/kimi-k2.6",
		name: "Kimi K2.6",
		attachment: true,
		reasoning: true,
		inputModalities: ["text", "image"],
		inputCost: 0.95,
		cacheReadCost: 0.16,
		outputCost: 4,
		contextWindow: 262144,
		maxTokens: 32000,
	},
	"@cf/zai-org/glm-4.7-flash": {
		requestModelId: "workers-ai/@cf/zai-org/glm-4.7-flash",
		name: "GLM-4.7-Flash",
		attachment: true,
		reasoning: true,
		inputCost: 0.06,
		outputCost: 0.4,
		contextWindow: 131072,
		maxTokens: 32000,
	},
	"@cf/nvidia/nemotron-3-120b-a12b": {
		requestModelId: "workers-ai/@cf/nvidia/nemotron-3-120b-a12b",
		name: "Nemotron 3 Super 120B",
		reasoning: true,
		inputModalities: ["text"],
		inputCost: 0.5,
		outputCost: 1.5,
		contextWindow: 256000,
		maxTokens: 32000,
	},
	"@cf/google/gemma-4-26b-a4b-it": {
		requestModelId: "workers-ai/@cf/google/gemma-4-26b-a4b-it",
		name: "Gemma 4 26B A4B IT",
		attachment: true,
		reasoning: true,
		inputModalities: ["text", "image"],
		inputCost: 0.1,
		outputCost: 0.3,
	},
	"@cf/zai-org/glm-5.1": {
		requestModelId: "workers-ai/@cf/zai-org/glm-5.1",
		name: "GLM 5.1",
		reasoning: true,
		inputModalities: ["text"],
		inputCost: 1.4,
		cacheReadCost: 0.26,
		outputCost: 4.4,
		contextWindow: 200000,
		maxTokens: 32000,
	},
};

const DEFAULT_XAI_MODELS: Readonly<Record<string, GatewayModelConfig>> = {
	"grok-4.5": {
		name: "Grok 4.5",
		attachment: true,
		reasoning: true,
		inputModalities: ["text", "image"],
		inputCost: 2,
		cacheReadCost: 0.5,
		outputCost: 6,
		contextWindow: 500000,
		maxTokens: 500000,
	},
};

const OPENAI_COMPLETIONS_COMPAT: NonNullable<Model<Api>["compat"]> = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
};

const WORKERS_COMPAT: NonNullable<Model<Api>["compat"]> = {
	...OPENAI_COMPLETIONS_COMPAT,
	maxTokensField: "max_tokens",
};

function normalizeInputModalities(config: GatewayModelConfig): ("text" | "image")[] {
	const input = config.inputModalities?.filter((value): value is "text" | "image" => value === "text" || value === "image");
	if (input?.length) return [...input];
	return config.attachment ? ["text", "image"] : ["text"];
}

function isJsonRecord(input: unknown): input is Readonly<Record<string, unknown>> {
	return input !== null && typeof input === "object" && !Array.isArray(input);
}

function getOptionNumber(config: GatewayModelConfig, key: string): number | undefined {
	const value = config.options?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getNestedOption(config: GatewayModelConfig | undefined, group: string, key: string): unknown {
	const value = config?.options?.[group];
	return isJsonRecord(value) ? value[key] : undefined;
}

function getResponseVerbosity(config: GatewayModelConfig | undefined): ResponseVerbosity | undefined {
	const value = getNestedOption(config, "text", "verbosity");
	return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function getReasoningContext(config: GatewayModelConfig | undefined): ReasoningContext | undefined {
	const value = getNestedOption(config, "reasoning", "context");
	return value === "current_turn" || value === "all_turns" ? value : undefined;
}

function toProviderModelConfig(model: Model<Api>): ProviderModelConfig {
	return {
		id: model.id,
		name: model.name,
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		input: [...model.input],
		cost: { ...model.cost },
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		compat: model.compat,
	};
}

function toProviderModelConfigFromGateway(modelId: string, config: GatewayModelConfig): ProviderModelConfig {
	return {
		id: modelId,
		name: config.name ?? modelId,
		reasoning: config.reasoning ?? true,
		thinkingLevelMap: config.thinkingLevelMap,
		input: normalizeInputModalities(config),
		cost: {
			input: config.inputCost ?? 0,
			output: config.outputCost ?? 0,
			cacheRead: config.cacheReadCost ?? 0,
			cacheWrite: config.cacheWriteCost ?? 0,
		},
		contextWindow: config.contextWindow ?? 222000,
		maxTokens: config.maxTokens ?? getOptionNumber(config, "max_tokens") ?? 16384,
		compat: config.compat,
	};
}

function applyGatewayOverrides(model: Model<Api>, config: GatewayModelConfig | undefined): Model<Api> {
	if (!config) return model;
	return {
		...model,
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

function resolveGatewayModelConfig(
	modelId: string,
	models: Readonly<Record<string, GatewayModelConfig>>,
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

function buildBuiltInModels(
	backend: Exclude<Backend, "workers-ai">,
	config: GatewayConfig,
): readonly Model<Api>[] {
	const route = config.routes[backend];
	const provider = backend === "google" ? "google" : backend;
	let models: Model<Api>[] = [...getModels(provider)];
	if (backend === "xai") {
		const known = new Set(models.map((model) => model.id));
		for (const [modelId, modelConfig] of Object.entries(DEFAULT_XAI_MODELS)) {
			if (known.has(modelId)) continue;
			const model = toProviderModelConfigFromGateway(modelId, modelConfig);
			models.push({
				...model,
				api: "openai-completions",
				provider: backend,
				baseUrl: route.baseUrl,
				compat: OPENAI_COMPLETIONS_COMPAT,
			});
		}
	}
	if (backend === "openai" && route.hasGatewayModels) {
		const allowlist = new Set(Object.keys(route.models).map((id) => stripRoutePrefix(id, backend)));
		models = models.filter((model) => allowlist.has(model.id));
	}
	return models
		.filter((model) => !isBlacklistedModel(model.id, backend, route.blacklist, resolveGatewayModelConfig(model.id, route.models, backend)))
		.map((model) => applyGatewayOverrides(model, resolveGatewayModelConfig(model.id, route.models, backend)));
}

function getBackendApi(
	backend: Exclude<Backend, "workers-ai">,
): "anthropic-messages" | "openai-responses" | "google-generative-ai" | "openai-completions" {
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

function createRoute(
	backend: Exclude<Backend, "workers-ai">,
	config: GatewayConfig,
	model: Model<Api>,
	gatewayModel: GatewayModelConfig | undefined,
): RouteDescriptor {
	const route = config.routes[backend];
	const base = {
		baseUrl: route.baseUrl,
		headers: route.headers,
		requestModelId: gatewayModel?.requestModelId,
		compat: model.compat,
	};
	switch (backend) {
		case "anthropic":
			return { ...base, backend, api: "anthropic-messages" };
		case "openai":
			return {
				...base,
				backend,
				api: "openai-responses",
				responseVerbosity: getResponseVerbosity(gatewayModel),
				reasoningContext: getReasoningContext(gatewayModel),
			};
		case "google":
			return { ...base, backend, api: "google-generative-ai" };
		case "xai":
			return { ...base, backend, api: "openai-completions" };
	}
}

function addModel(
	models: ProviderModelConfig[],
	routes: Map<string, RouteDescriptor>,
	model: ProviderModelConfig,
	route: RouteDescriptor,
): Result<void, CatalogError> {
	if (routes.has(model.id)) return failure(new CatalogError("duplicate-model", model.id));
	models.push(model);
	routes.set(model.id, route);
	return success(undefined);
}

/**
 * Build a deterministic model catalog from resolved gateway configuration.
 *
 * @param config - Resolved gateway configuration.
 * @returns Catalog or duplicate-model failure.
 */
export function buildCatalog(config: GatewayConfig): Result<CatalogData, CatalogError> {
	const models: ProviderModelConfig[] = [];
	const routes = new Map<string, RouteDescriptor>();
	const counts: Record<Backend, number> = { anthropic: 0, openai: 0, google: 0, xai: 0, "workers-ai": 0 };

	for (const backend of config.enabledBackends) {
		const route = config.routes[backend];
		if (backend === "workers-ai") {
			const source = Object.keys(route.models).length > 0 ? route.models : DEFAULT_WORKERS_MODELS;
			const whitelist = route.whitelist?.length ? new Set(route.whitelist) : undefined;
			for (const [fullModelId, modelConfig] of Object.entries(source)) {
				const modelId = stripRoutePrefix(fullModelId, backend);
				if (whitelist && !whitelist.has(fullModelId) && !whitelist.has(modelId)) continue;
				if (isBlacklistedModel(fullModelId, backend, route.blacklist, modelConfig)) continue;
				const model = toProviderModelConfigFromGateway(modelId, modelConfig);
				model.name = `${fullModelId} (${modelConfig.name ?? modelId})`;
				model.compat = WORKERS_COMPAT;
				const added = addModel(models, routes, model, {
					backend,
					api: "openai-completions",
					baseUrl: route.baseUrl,
					headers: route.headers,
					requestModelId: modelConfig.requestModelId ?? fullModelId,
					compat: WORKERS_COMPAT,
				});
				if (!added.ok) return added;
				counts[backend] += 1;
			}
			continue;
		}

		const builtIns = buildBuiltInModels(backend, config);
		const seen = new Set<string>();
		for (const model of builtIns) {
			const gatewayModel = resolveGatewayModelConfig(model.id, route.models, backend);
			const added = addModel(models, routes, toProviderModelConfig(model), createRoute(backend, config, model, gatewayModel));
			if (!added.ok) return added;
			seen.add(model.id);
		}
		for (const [fullModelId, modelConfig] of Object.entries(route.models)) {
			const modelId = stripRoutePrefix(fullModelId, backend);
			if (seen.has(modelId) || isBlacklistedModel(fullModelId, backend, route.blacklist, modelConfig)) continue;
			const model = toProviderModelConfigFromGateway(modelId, modelConfig);
			const routeModel: Model<Api> = {
				...model,
				api: getBackendApi(backend),
				provider: backend,
				baseUrl: route.baseUrl,
			};
			const added = addModel(models, routes, model, createRoute(backend, config, routeModel, modelConfig));
			if (!added.ok) return added;
			seen.add(modelId);
		}
		counts[backend] = seen.size;
	}
	return success({ models, routes, counts });
}

/**
 * Render compact backend model counts.
 *
 * @param catalog - Catalog to summarize.
 * @returns One-line backend count summary.
 */
export function summarizeCatalog(catalog: CatalogData): string {
	return `anthropic=${catalog.counts.anthropic}, openai=${catalog.counts.openai}, google=${catalog.counts.google}, xai=${catalog.counts.xai}, workers-ai=${catalog.counts["workers-ai"]}`;
}

/**
 * Create an instance-owned catalog service.
 *
 * @param configStore - Configuration source owned by the same extension runtime.
 * @returns Catalog service.
 */
export function createCatalogService(configStore: GatewayConfigStore): CatalogService {
	let active: CatalogData | undefined;
	let activeConfig: GatewayConfig | undefined;

	const refresh = async (options: CatalogRefreshOptions = {}): Promise<Result<CatalogData, CatalogError>> => {
		const loaded = await configStore.load({
			forceReload: options.forceReload,
			fallbackToDefault: true,
			allowNetwork: options.allowNetwork,
			authToken: options.authToken,
			signal: options.signal,
		});
		if (!loaded.ok) return failure(new CatalogError("configuration", undefined, loaded.error));
		if (!options.forceReload && active && activeConfig === loaded.value) return success(active);
		const built = buildCatalog(loaded.value);
		if (!built.ok) return built;
		active = built.value;
		activeConfig = loaded.value;
		return success(active);
	};

	return {
		current() {
			return active ? success(active) : failure(new CatalogError("uninitialized"));
		},
		refresh,
		async resolveRoute(modelId, signal) {
			const refreshed = await refresh({ allowNetwork: false, signal });
			if (!refreshed.ok) return refreshed;
			const route = refreshed.value.routes.get(modelId);
			return route && activeConfig
				? success({ route, config: activeConfig })
				: failure(new CatalogError("unknown-model", modelId));
		},
	};
}
