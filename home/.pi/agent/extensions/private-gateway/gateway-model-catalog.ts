import type { ThinkingLevel, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { type GatewayToken } from "./auth.ts";
import { type Backend } from "./constants.ts";
import {
	type GatewayConfig,
	type GatewayModelConfig,
	type GatewayModelConfigMap,
	type GatewayRouteConfig,
	stripRoutePrefix,
} from "./discovery.ts";
import {
	isJsonNumber,
	isJsonObject,
	isJsonString,
	parseJsonObject,
	type JsonObject,
	type JsonValue,
	type JsonValueParseError,
} from "./json-value.ts";
import { Redacted } from "./redacted.ts";
import { failure, type Result, success } from "./result.ts";

/** Per-backend request budget; a slow model-list endpoint must not stall Pi's catalog refresh. */
const GATEWAY_MODEL_CATALOG_TIMEOUT_MS = 2_000;

/** Anthropic Messages API version sent to `/v1/models`; the endpoint rejects requests without it. */
const ANTHROPIC_VERSION = "2023-06-01";

const ANTHROPIC_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const satisfies readonly ThinkingLevel[];

/**
 * Public OpenAI model metadata for models the OpenAI `/models` endpoint lists but Pi's built-in
 * catalog does not know. That endpoint returns only ids, so limits and pricing come from OpenAI's
 * published model page.
 */
const PUBLIC_OPENAI_MODEL_METADATA: ReadonlyMap<string, GatewayModelConfig> = new Map([
	[
		"gpt-6-astra",
		{
			name: "GPT-6 Astra",
			reasoning: true,
			inputModalities: ["text", "image"],
			contextWindow: 1_050_000,
			maxTokens: 128_000,
			inputCost: 10,
			outputCost: 50,
			cacheReadCost: 1,
			cacheWriteCost: 12.5,
			thinkingLevelMap: {
				off: null,
				minimal: null,
				low: "low",
				medium: "medium",
				high: "high",
				xhigh: "xhigh",
				max: "max",
			},
		},
	],
]);

/** Mutable builder view of {@link GatewayModelConfig}; fields are assigned only when the source record has them. */
type GatewayModelConfigBuilder = { -readonly [K in keyof GatewayModelConfig]: GatewayModelConfig[K] };

/** Backend model-list request or response failure; callers keep the discovery/built-in catalog. */
class GatewayModelCatalogError extends Error {
	readonly _tag = "GatewayModelCatalogError" as const;

	constructor(
		readonly reason: "http" | "network" | "response",
		readonly backend: Backend,
		override readonly cause?: unknown,
	) {
		super(`Gateway model catalog unavailable for ${backend}`);
		this.name = "GatewayModelCatalogError";
	}
}

/** One model record from a backend model-list endpoint, reduced to the metadata the gateway config understands. */
interface GatewayCatalogModel {
	readonly id: string;
	readonly config: GatewayModelConfig;
}

function jsonString(object: JsonObject, key: string): string | undefined {
	const value = object[key];
	return value !== undefined && isJsonString(value) ? value : undefined;
}

function jsonNumber(object: JsonObject, key: string): number | undefined {
	const value = object[key];
	return value !== undefined && isJsonNumber(value) ? value : undefined;
}

function jsonObject(object: JsonObject | undefined, key: string): JsonObject | undefined {
	const value = object?.[key];
	return value !== undefined && isJsonObject(value) ? value : undefined;
}

/** Anthropic capability records are `{ supported: boolean, ... }`. */
function isSupportedCapability(capabilities: JsonObject | undefined, name: string): boolean {
	return jsonObject(capabilities, name)?.supported === true;
}

function parseAnthropicThinkingLevelMap(capabilities: JsonObject | undefined): ThinkingLevelMap | undefined {
	if (!isSupportedCapability(capabilities, "effort")) return undefined;
	const effort = jsonObject(capabilities, "effort");
	const map: ThinkingLevelMap = { off: null, minimal: null };
	for (const level of ANTHROPIC_EFFORT_LEVELS) {
		map[level] = isSupportedCapability(effort, level) ? level : null;
	}
	return map;
}

/**
 * Translate an Anthropic `/v1/models` record into gateway model metadata.
 *
 * Adaptive-only thinking is mapped to `compat.forceAdaptiveThinking`; Pi needs that flag for
 * models outside its built-in catalog or thinking requests are rejected.
 */
function parseAnthropicCatalogConfig(record: JsonObject): GatewayModelConfig {
	const capabilities = jsonObject(record, "capabilities");
	const thinking = jsonObject(capabilities, "thinking");
	const thinkingTypes = jsonObject(thinking, "types");
	const adaptiveOnly =
		isSupportedCapability(thinkingTypes, "adaptive") && !isSupportedCapability(thinkingTypes, "enabled");
	const name = jsonString(record, "display_name");
	const contextWindow = jsonNumber(record, "max_input_tokens");
	const maxTokens = jsonNumber(record, "max_tokens");
	const thinkingLevelMap = parseAnthropicThinkingLevelMap(capabilities);
	const config: GatewayModelConfigBuilder = {};
	if (name !== undefined) config.name = name;
	if (contextWindow !== undefined) config.contextWindow = contextWindow;
	if (maxTokens !== undefined) config.maxTokens = maxTokens;
	if (isSupportedCapability(capabilities, "image_input")) config.inputModalities = ["text", "image"];
	if (isSupportedCapability(capabilities, "thinking")) config.reasoning = true;
	if (thinkingLevelMap !== undefined) config.thinkingLevelMap = thinkingLevelMap;
	if (adaptiveOnly) config.compat = { forceAdaptiveThinking: true };
	return config;
}

function parseCatalogModelId(record: JsonObject, backend: Backend): string | undefined {
	const candidate = jsonString(record, "id") ?? jsonString(record, "name");
	if (candidate === undefined) return undefined;
	// Google lists models as `models/<id>`; the request id is the bare `<id>`.
	const id = (backend === "google" ? candidate.replace(/^models\//, "") : candidate).trim();
	return id || undefined;
}

function parseCatalogModelConfig(record: JsonObject, id: string, backend: Backend): GatewayModelConfig {
	switch (backend) {
		case "anthropic":
			return parseAnthropicCatalogConfig(record);
		case "openai":
			return PUBLIC_OPENAI_MODEL_METADATA.get(id) ?? {};
		case "workers-ai":
			// Workers AI ids carry the route prefix; the visible id drops it but the request keeps it.
			return { requestModelId: id };
		case "google":
		case "xai":
			return {};
	}
}

function parseGatewayCatalogModel(value: JsonValue, backend: Backend): GatewayCatalogModel | undefined {
	if (!isJsonObject(value)) return undefined;
	const id = parseCatalogModelId(value, backend);
	if (id === undefined) return undefined;
	return { id, config: parseCatalogModelConfig(value, id, backend) };
}

/** Accepts both the OpenAI-style `{ data: [...] }` and Google-style `{ models: [...] }` list formats. */
function parseGatewayCatalogModels(
	body: JsonObject,
	backend: Backend,
): Result<readonly GatewayCatalogModel[], GatewayModelCatalogError> {
	const collection = body.data ?? body.models;
	if (!Array.isArray(collection)) return failure(new GatewayModelCatalogError("response", backend));
	const byId = new Map<string, GatewayCatalogModel>();
	for (const value of collection) {
		const model = parseGatewayCatalogModel(value, backend);
		if (model && !byId.has(model.id)) byId.set(model.id, model);
	}
	return success([...byId.values()]);
}

function gatewayModelCatalogUrl(route: GatewayRouteConfig, backend: Backend): string {
	const suffix = backend === "anthropic" ? "/v1/models" : "/models";
	return `${route.baseUrl.replace(/\/$/, "")}${suffix}`;
}

function gatewayCatalogHeaders(token: GatewayToken, backend: Backend): Readonly<Record<string, string>> {
	const value = Redacted.value(token);
	const headers = {
		Accept: "application/json",
		Authorization: `Bearer ${value}`,
		"cf-access-token": value,
		"X-Requested-With": "xmlhttprequest",
	};
	return backend === "anthropic" ? { ...headers, "anthropic-version": ANTHROPIC_VERSION } : headers;
}

function createGatewayCatalogSignal(signal: AbortSignal | undefined): AbortSignal {
	const timeout = AbortSignal.timeout(GATEWAY_MODEL_CATALOG_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchGatewayBackendModels(options: {
	readonly backend: Backend;
	readonly route: GatewayRouteConfig;
	readonly token: GatewayToken;
	readonly signal: AbortSignal | undefined;
	readonly fetch: typeof fetch;
}): Promise<Result<readonly GatewayCatalogModel[], GatewayModelCatalogError>> {
	let response: Response;
	try {
		response = await options.fetch(gatewayModelCatalogUrl(options.route, options.backend), {
			method: "GET",
			headers: gatewayCatalogHeaders(options.token, options.backend),
			signal: createGatewayCatalogSignal(options.signal),
		});
	} catch (cause) {
		return failure(new GatewayModelCatalogError("network", options.backend, cause));
	}
	if (!response.ok) return failure(new GatewayModelCatalogError("http", options.backend));
	let body: Result<JsonObject, JsonValueParseError>;
	try {
		body = parseJsonObject(await response.json());
	} catch (cause) {
		return failure(new GatewayModelCatalogError("response", options.backend, cause));
	}
	if (!body.ok) return failure(new GatewayModelCatalogError("response", options.backend, body.error));
	return parseGatewayCatalogModels(body.value, options.backend);
}

function isAllowedCatalogModel(modelId: string, backend: Backend, route: GatewayRouteConfig): boolean {
	// The Workers AI compat endpoint lists every upstream provider; only `workers-ai/` ids route there.
	if (backend === "workers-ai" && !modelId.startsWith("workers-ai/")) return false;
	if (!route.whitelist?.length) return true;
	return route.whitelist.includes(modelId) || route.whitelist.includes(stripRoutePrefix(modelId, backend));
}

function toGatewayModelConfigMap(
	models: readonly GatewayCatalogModel[],
	backend: Backend,
	route: GatewayRouteConfig,
): GatewayModelConfigMap {
	return Object.fromEntries(
		models
			.filter((model) => isAllowedCatalogModel(model.id, backend, route))
			.map((model) => [stripRoutePrefix(model.id, backend), model.config] as const),
	);
}

/**
 * Discover models from each enabled backend's live model-list endpoint when the gateway discovery
 * document declares no models for that backend.
 *
 * A backend whose model-list endpoint is unavailable keeps its discovery/Pi built-in catalog.
 * Without a token nothing is fetched and the config is returned unchanged.
 *
 * @param options.config - Resolved gateway configuration from discovery.
 * @param options.token - Gateway access token used for the model-list requests.
 * @param options.signal - Caller cancellation; aborting rethrows instead of falling back.
 */
export async function discoverGatewayCatalogModels(options: {
	readonly config: GatewayConfig;
	readonly token: GatewayToken | undefined;
	readonly signal?: AbortSignal;
	readonly fetch?: typeof fetch;
}): Promise<GatewayConfig> {
	const token = options.token;
	if (!token) return options.config;
	const fetchImpl = options.fetch ?? fetch;
	const pending = options.config.enabledBackends
		.filter((backend) => !options.config.routes[backend].hasGatewayModels)
		.map(async (backend) => {
			const route = options.config.routes[backend];
			const fetched = await fetchGatewayBackendModels({ backend, route, token, signal: options.signal, fetch: fetchImpl });
			options.signal?.throwIfAborted();
			return fetched.ok ? ([backend, toGatewayModelConfigMap(fetched.value, backend, route)] as const) : undefined;
		});
	const routes: Record<Backend, GatewayRouteConfig> = { ...options.config.routes };
	for (const discovered of await Promise.all(pending)) {
		if (!discovered) continue;
		const [backend, models] = discovered;
		if (Object.keys(models).length === 0) continue;
		routes[backend] = { ...routes[backend], models, hasGatewayModels: true };
	}
	return { ...options.config, routes };
}
