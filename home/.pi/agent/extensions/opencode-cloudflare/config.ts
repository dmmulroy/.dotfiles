import type { Api, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import {
	AUTH_ORIGIN,
	BACKENDS,
	DEFAULT_ROUTE_HEADERS,
	DEFAULT_ROUTE_URLS,
	GATEWAY_ORIGIN,
	type Backend,
} from "./constants.ts";
import { failure, type Result, success } from "./result.ts";

/** JSON value accepted in gateway model options. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Parsed model metadata supplied by gateway discovery or a local overlay. */
export interface GatewayModelConfig {
	readonly requestModelId?: string;
	readonly name?: string;
	readonly attachment?: boolean;
	readonly reasoning?: boolean;
	readonly inputModalities?: readonly string[];
	readonly contextWindow?: number;
	readonly maxTokens?: number;
	readonly inputCost?: number;
	readonly outputCost?: number;
	readonly cacheReadCost?: number;
	readonly cacheWriteCost?: number;
	readonly thinkingLevelMap?: ThinkingLevelMap;
	readonly compat?: Model<Api>["compat"];
	readonly options?: Readonly<Record<string, JsonValue>>;
}

/** Parsed backend metadata from gateway discovery. */
export interface GatewayProviderConfig {
	readonly baseUrl?: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly whitelist?: readonly string[];
	readonly blacklist?: readonly string[];
	readonly models: Readonly<Record<string, GatewayModelConfig>>;
}

/** Authenticated remote configuration referenced by gateway discovery. */
export interface GatewayRemoteConfig {
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
}

/** Parsed gateway discovery or remote configuration document. */
export interface GatewayDocument {
	readonly authEnv?: string;
	readonly authCommand?: string | readonly string[];
	readonly remoteConfig?: GatewayRemoteConfig;
	readonly enabledBackends?: readonly Backend[];
	readonly providers: Readonly<Partial<Record<Backend, GatewayProviderConfig>>>;
}

/** Parsed local model overlay. */
export interface GatewayLocalOverlay {
	readonly providers: Readonly<Partial<Record<Backend, GatewayProviderConfig>>>;
}

/** Fully resolved route configuration consumed by catalog and stream adapters. */
export interface GatewayRouteConfig {
	readonly baseUrl: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly models: Readonly<Record<string, GatewayModelConfig>>;
	readonly whitelist?: readonly string[];
	readonly blacklist?: readonly string[];
	readonly hasGatewayModels: boolean;
}

/** Origin of the active gateway configuration. */
export type GatewayConfigSource = "live" | "fallback";

/** Fully resolved gateway configuration. */
export interface GatewayConfig {
	readonly origin: typeof GATEWAY_ORIGIN;
	readonly source: GatewayConfigSource;
	readonly authEnv: string;
	readonly authCommand?: string | readonly string[];
	readonly enabledBackends: readonly Backend[];
	readonly routes: Readonly<Record<Backend, GatewayRouteConfig>>;
}

/** Structured parse failure for gateway or overlay configuration. */
export class GatewayConfigParseError extends Error {
	readonly _tag = "GatewayConfigParseError" as const;

	/**
	 * Create a configuration parse failure.
	 *
	 * @param path - JSON path containing the invalid value.
	 * @param expected - Safe description of the expected shape.
	 */
	constructor(
		readonly path: string,
		readonly expected: string,
	) {
		super(`Invalid gateway configuration at ${path}; expected ${expected}`);
		this.name = "GatewayConfigParseError";
	}
}

const PROVIDER_ALIASES: Readonly<Record<string, Backend>> = {
	"cloudflare-workers-ai": "workers-ai",
};

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const THINKING_FORMATS = [
	"openai",
	"openrouter",
	"deepseek",
	"together",
	"zai",
	"qwen",
	"chat-template",
	"qwen-chat-template",
	"string-thinking",
	"ant-ling",
] as const;

function isRecord(input: unknown): input is Record<string, unknown> {
	return input !== null && typeof input === "object" && !Array.isArray(input);
}

function requireRecord(input: unknown, path: string): Record<string, unknown> {
	if (!isRecord(input)) throw new GatewayConfigParseError(path, "an object");
	return input;
}

function optionalRecord(input: unknown, path: string): Record<string, unknown> | undefined {
	if (input === undefined) return undefined;
	return requireRecord(input, path);
}

function optionalString(input: unknown, path: string): string | undefined {
	if (input === undefined) return undefined;
	if (typeof input !== "string") throw new GatewayConfigParseError(path, "a string");
	const value = input.trim();
	if (!value) throw new GatewayConfigParseError(path, "a non-empty string");
	return value;
}

function optionalTrustedUrl(input: unknown, path: string, trustedOrigin: string): string | undefined {
	const value = optionalString(input, path);
	if (value === undefined) return undefined;
	try {
		const url = new URL(value);
		if (url.origin !== new URL(trustedOrigin).origin) {
			throw new GatewayConfigParseError(path, `a URL on ${trustedOrigin}`);
		}
		return url.toString().replace(/\/$/, "");
	} catch (error) {
		if (Error.isError(error) && error instanceof GatewayConfigParseError) throw error;
		throw new GatewayConfigParseError(path, `a URL on ${trustedOrigin}`);
	}
}

function optionalBoolean(input: unknown, path: string): boolean | undefined {
	if (input === undefined) return undefined;
	if (typeof input !== "boolean") throw new GatewayConfigParseError(path, "a boolean");
	return input;
}

function optionalNonNegativeNumber(input: unknown, path: string): number | undefined {
	if (input === undefined) return undefined;
	if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
		throw new GatewayConfigParseError(path, "a non-negative finite number");
	}
	return input;
}

function optionalPositiveInteger(input: unknown, path: string): number | undefined {
	const value = optionalNonNegativeNumber(input, path);
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0) {
		throw new GatewayConfigParseError(path, "a positive integer");
	}
	return value;
}

function optionalStringArray(input: unknown, path: string): readonly string[] | undefined {
	if (input === undefined) return undefined;
	if (!Array.isArray(input)) throw new GatewayConfigParseError(path, "an array of strings");
	return input.map((value, index) => {
		const parsed = optionalString(value, `${path}[${index}]`);
		if (parsed === undefined) throw new GatewayConfigParseError(`${path}[${index}]`, "a non-empty string");
		return parsed;
	});
}

function parseJsonValue(input: unknown, path: string): JsonValue {
	if (input === null || typeof input === "string" || typeof input === "boolean") return input;
	if (typeof input === "number" && Number.isFinite(input)) return input;
	if (Array.isArray(input)) return input.map((value, index) => parseJsonValue(value, `${path}[${index}]`));
	if (isRecord(input)) {
		return Object.fromEntries(
			Object.entries(input).map(([key, value]) => [key, parseJsonValue(value, `${path}.${key}`)]),
		);
	}
	throw new GatewayConfigParseError(path, "a JSON value");
}

function parseHeaders(input: unknown, path: string): Readonly<Record<string, string>> | undefined {
	const record = optionalRecord(input, path);
	if (!record) return undefined;
	return Object.fromEntries(
		Object.entries(record).map(([name, value]) => {
			const parsed = optionalString(value, `${path}.${name}`);
			if (parsed === undefined) throw new GatewayConfigParseError(`${path}.${name}`, "a non-empty string");
			return [name, parsed];
		}),
	);
}

function parseThinkingLevelMap(input: unknown, path: string): ThinkingLevelMap | undefined {
	const record = optionalRecord(input, path);
	if (!record) return undefined;
	const parsed: ThinkingLevelMap = {};
	for (const level of THINKING_LEVELS) {
		const value = record[level];
		if (value === undefined) continue;
		if (value !== null && typeof value !== "string") {
			throw new GatewayConfigParseError(`${path}.${level}`, "a string or null");
		}
		parsed[level] = value;
	}
	return parsed;
}

interface ParsedCompatibility {
	supportsStore?: boolean;
	supportsDeveloperRole?: boolean;
	supportsReasoningEffort?: boolean;
	supportsUsageInStreaming?: boolean;
	maxTokensField?: "max_completion_tokens" | "max_tokens";
	requiresToolResultName?: boolean;
	requiresAssistantAfterToolResult?: boolean;
	requiresThinkingAsText?: boolean;
	requiresReasoningContentOnAssistantMessages?: boolean;
	thinkingFormat?: (typeof THINKING_FORMATS)[number];
	zaiToolStream?: boolean;
	supportsStrictMode?: boolean;
	cacheControlFormat?: "anthropic";
	sendSessionAffinityHeaders?: boolean;
	supportsLongCacheRetention?: boolean;
	supportsEagerToolInputStreaming?: boolean;
	supportsCacheControlOnTools?: boolean;
	supportsTemperature?: boolean;
	forceAdaptiveThinking?: boolean;
	supportsStrictTools?: boolean;
	supportsToolReferences?: boolean;
	allowEmptySignature?: boolean;
	sendSessionIdHeader?: boolean;
}

function parseOptionalEnum<Value extends string>(
	input: unknown,
	path: string,
	values: readonly Value[],
): Value | undefined {
	if (input === undefined) return undefined;
	const value = typeof input === "string" ? values.find((candidate) => candidate === input) : undefined;
	if (value === undefined) {
		throw new GatewayConfigParseError(path, `one of ${values.join(", ")}`);
	}
	return value;
}

function compactCompatibility(input: ParsedCompatibility): Model<Api>["compat"] {
	// SAFETY: ParsedCompatibility contains only keys and values admitted by Pi's
	// compatibility union; filtering removes absent properties before projection.
	return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Model<Api>["compat"];
}

function parseCompatibility(input: unknown, path: string): Model<Api>["compat"] | undefined {
	const record = optionalRecord(input, path);
	if (!record) return undefined;
	const parsed: ParsedCompatibility = {
		supportsStore: optionalBoolean(record.supportsStore, `${path}.supportsStore`),
		supportsDeveloperRole: optionalBoolean(record.supportsDeveloperRole, `${path}.supportsDeveloperRole`),
		supportsReasoningEffort: optionalBoolean(record.supportsReasoningEffort, `${path}.supportsReasoningEffort`),
		supportsUsageInStreaming: optionalBoolean(record.supportsUsageInStreaming, `${path}.supportsUsageInStreaming`),
		maxTokensField: parseOptionalEnum(record.maxTokensField, `${path}.maxTokensField`, ["max_completion_tokens", "max_tokens"]),
		requiresToolResultName: optionalBoolean(record.requiresToolResultName, `${path}.requiresToolResultName`),
		requiresAssistantAfterToolResult: optionalBoolean(record.requiresAssistantAfterToolResult, `${path}.requiresAssistantAfterToolResult`),
		requiresThinkingAsText: optionalBoolean(record.requiresThinkingAsText, `${path}.requiresThinkingAsText`),
		requiresReasoningContentOnAssistantMessages: optionalBoolean(
			record.requiresReasoningContentOnAssistantMessages,
			`${path}.requiresReasoningContentOnAssistantMessages`,
		),
		thinkingFormat: parseOptionalEnum(record.thinkingFormat, `${path}.thinkingFormat`, THINKING_FORMATS),
		zaiToolStream: optionalBoolean(record.zaiToolStream, `${path}.zaiToolStream`),
		supportsStrictMode: optionalBoolean(record.supportsStrictMode, `${path}.supportsStrictMode`),
		cacheControlFormat: parseOptionalEnum(record.cacheControlFormat, `${path}.cacheControlFormat`, ["anthropic"]),
		sendSessionAffinityHeaders: optionalBoolean(record.sendSessionAffinityHeaders, `${path}.sendSessionAffinityHeaders`),
		supportsLongCacheRetention: optionalBoolean(record.supportsLongCacheRetention, `${path}.supportsLongCacheRetention`),
		supportsEagerToolInputStreaming: optionalBoolean(record.supportsEagerToolInputStreaming, `${path}.supportsEagerToolInputStreaming`),
		supportsCacheControlOnTools: optionalBoolean(record.supportsCacheControlOnTools, `${path}.supportsCacheControlOnTools`),
		supportsTemperature: optionalBoolean(record.supportsTemperature, `${path}.supportsTemperature`),
		forceAdaptiveThinking: optionalBoolean(record.forceAdaptiveThinking, `${path}.forceAdaptiveThinking`),
		supportsStrictTools: optionalBoolean(record.supportsStrictTools, `${path}.supportsStrictTools`),
		supportsToolReferences: optionalBoolean(record.supportsToolReferences, `${path}.supportsToolReferences`),
		allowEmptySignature: optionalBoolean(record.allowEmptySignature, `${path}.allowEmptySignature`),
		sendSessionIdHeader: optionalBoolean(record.sendSessionIdHeader, `${path}.sendSessionIdHeader`),
	};
	return compactCompatibility(parsed);
}

function parseModel(input: unknown, path: string): GatewayModelConfig {
	const record = requireRecord(input, path);
	const modalities = optionalRecord(record.modalities, `${path}.modalities`);
	const limit = optionalRecord(record.limit, `${path}.limit`);
	const cost = optionalRecord(record.cost, `${path}.cost`);
	const optionsValue = optionalRecord(record.options, `${path}.options`);
	const options = optionsValue
		? Object.fromEntries(Object.entries(optionsValue).map(([key, value]) => [key, parseJsonValue(value, `${path}.options.${key}`)]))
		: undefined;

	return {
		requestModelId: optionalString(record.id, `${path}.id`),
		name: optionalString(record.name, `${path}.name`),
		attachment: optionalBoolean(record.attachment, `${path}.attachment`),
		reasoning: optionalBoolean(record.reasoning, `${path}.reasoning`),
		inputModalities: optionalStringArray(modalities?.input, `${path}.modalities.input`),
		contextWindow: optionalPositiveInteger(limit?.context, `${path}.limit.context`),
		maxTokens: optionalPositiveInteger(limit?.output, `${path}.limit.output`),
		inputCost: optionalNonNegativeNumber(cost?.input, `${path}.cost.input`),
		outputCost: optionalNonNegativeNumber(cost?.output, `${path}.cost.output`),
		cacheReadCost: optionalNonNegativeNumber(cost?.cache_read, `${path}.cost.cache_read`),
		cacheWriteCost: optionalNonNegativeNumber(cost?.cache_write, `${path}.cost.cache_write`),
		thinkingLevelMap: parseThinkingLevelMap(record.thinkingLevelMap, `${path}.thinkingLevelMap`),
		compat: parseCompatibility(record.compat, `${path}.compat`),
		options,
	};
}

function parseModels(input: unknown, path: string): Readonly<Record<string, GatewayModelConfig>> {
	const record = optionalRecord(input, path);
	if (!record) return {};
	return Object.fromEntries(Object.entries(record).map(([modelId, value]) => [modelId, parseModel(value, `${path}.${modelId}`)]));
}

function parseProvider(input: unknown, path: string): GatewayProviderConfig {
	const record = requireRecord(input, path);
	const options = optionalRecord(record.options, `${path}.options`);
	return {
		baseUrl: optionalTrustedUrl(options?.baseURL ?? options?.baseUrl, `${path}.options.baseURL`, GATEWAY_ORIGIN),
		headers: parseHeaders(options?.headers, `${path}.options.headers`),
		whitelist: optionalStringArray(record.whitelist, `${path}.whitelist`),
		blacklist: optionalStringArray(record.blacklist, `${path}.blacklist`),
		models: parseModels(record.models, `${path}.models`),
	};
}

function normalizeBackend(input: string): Backend | undefined {
	const alias = PROVIDER_ALIASES[input];
	if (alias) return alias;
	return BACKENDS.find((backend) => backend === input);
}

function parseProviders(input: unknown, path: string): Readonly<Partial<Record<Backend, GatewayProviderConfig>>> {
	const record = optionalRecord(input, path);
	if (!record) return {};
	const providers: Partial<Record<Backend, GatewayProviderConfig>> = {};
	for (const [providerName, value] of Object.entries(record)) {
		const backend = normalizeBackend(providerName);
		if (!backend) continue;
		if (providers[backend]) {
			throw new GatewayConfigParseError(`${path}.${providerName}`, `a unique configuration for ${backend}`);
		}
		providers[backend] = parseProvider(value, `${path}.${providerName}`);
	}
	return providers;
}

function parseEnabledBackends(input: unknown, path: string): readonly Backend[] | undefined {
	const providers = optionalStringArray(input, path);
	if (!providers) return undefined;
	const enabled = new Set<Backend>();
	for (const provider of providers) {
		const backend = normalizeBackend(provider);
		if (backend) enabled.add(backend);
	}
	return BACKENDS.filter((backend) => enabled.has(backend));
}

function parseAuthCommand(input: unknown, path: string): string | readonly string[] | undefined {
	if (input === undefined) return undefined;
	if (typeof input === "string") return optionalString(input, path);
	return optionalStringArray(input, path);
}

/**
 * Parse an untrusted gateway discovery payload.
 *
 * @param input - Decoded JSON value from the gateway.
 * @returns Parsed document or a path-specific failure.
 */
export function parseGatewayDocument(input: unknown): Result<GatewayDocument, GatewayConfigParseError> {
	try {
		const root = requireRecord(input, "$");
		const auth = optionalRecord(root.auth, "$.auth");
		const remoteConfig = optionalRecord(root.remote_config, "$.remote_config");
		const nestedConfig = optionalRecord(root.config, "$.config");
		const config = nestedConfig ?? root;
		const configPath = nestedConfig ? "$.config" : "$";
		const remoteUrl = optionalTrustedUrl(remoteConfig?.url, "$.remote_config.url", AUTH_ORIGIN);
		return success({
			authEnv: optionalString(auth?.env, "$.auth.env"),
			authCommand: parseAuthCommand(auth?.command, "$.auth.command"),
			remoteConfig: remoteUrl ? {
				url: remoteUrl,
				headers: parseHeaders(remoteConfig?.headers, "$.remote_config.headers") ?? {},
			} : undefined,
			enabledBackends: parseEnabledBackends(config.enabled_providers, `${configPath}.enabled_providers`),
			providers: parseProviders(config.provider, `${configPath}.provider`),
		});
	} catch (error) {
		if (Error.isError(error) && error instanceof GatewayConfigParseError) return failure(error);
		throw error;
	}
}

/**
 * Merge authenticated remote configuration over inline well-known configuration.
 *
 * @param discovery - Parsed well-known bootstrap document.
 * @param remote - Parsed authenticated remote OpenCode configuration.
 * @returns One document preserving auth metadata and OpenCode merge precedence.
 */
export function mergeGatewayDocuments(discovery: GatewayDocument, remote: GatewayDocument): GatewayDocument {
	const providers: Partial<Record<Backend, GatewayProviderConfig>> = {};
	for (const backend of BACKENDS) {
		const base = discovery.providers[backend];
		const override = remote.providers[backend];
		if (!base && !override) continue;
		providers[backend] = {
			baseUrl: override?.baseUrl ?? base?.baseUrl,
			headers: { ...base?.headers, ...override?.headers },
			whitelist: override?.whitelist ?? base?.whitelist,
			blacklist: override?.blacklist ?? base?.blacklist,
			models: { ...base?.models, ...override?.models },
		};
	}
	return {
		authEnv: discovery.authEnv,
		authCommand: discovery.authCommand,
		enabledBackends: remote.enabledBackends ?? discovery.enabledBackends,
		providers,
	};
}

/**
 * Parse an untrusted local overlay payload.
 *
 * @param input - Decoded JSON or JSONC value from the local file.
 * @returns Parsed overlay or a path-specific failure.
 */
export function parseGatewayLocalOverlay(input: unknown): Result<GatewayLocalOverlay, GatewayConfigParseError> {
	try {
		const root = requireRecord(input, "$");
		const nestedConfig = optionalRecord(root.config, "$.config");
		return success({ providers: parseProviders(root.provider ?? nestedConfig?.provider, "$.provider") });
	} catch (error) {
		if (Error.isError(error) && error instanceof GatewayConfigParseError) return failure(error);
		throw error;
	}
}

function normalizeHeaders(headers: Readonly<Record<string, string>> | undefined, backend: Backend): Readonly<Record<string, string>> {
	const resolved: Record<string, string> = { ...DEFAULT_ROUTE_HEADERS[backend], ...headers };
	if (backend === "anthropic" && resolved["anthropic-beta"]) {
		const values = new Set(resolved["anthropic-beta"].split(",").map((value) => value.trim()).filter(Boolean));
		values.add("interleaved-thinking-2025-05-14");
		values.add("fine-grained-tool-streaming-2025-05-14");
		resolved["anthropic-beta"] = Array.from(values).join(",");
	}
	return resolved;
}

function resolveRoute(
	backend: Backend,
	document: GatewayDocument | undefined,
	overlay: GatewayLocalOverlay | undefined,
): GatewayRouteConfig {
	const gatewayProvider = document?.providers[backend];
	const localProvider = overlay?.providers[backend];
	const gatewayModels = gatewayProvider?.models ?? {};
	const localModels = localProvider?.models ?? {};
	let whitelist = gatewayProvider?.whitelist;
	if (backend === "workers-ai" && whitelist && Object.keys(localModels).length > 0) {
		const allowed = new Set(whitelist);
		for (const [modelId, model] of Object.entries(localModels)) {
			allowed.add(modelId);
			if (model.requestModelId) allowed.add(stripRoutePrefix(model.requestModelId, backend));
		}
		whitelist = Array.from(allowed);
	}
	return {
		baseUrl: localProvider?.baseUrl ?? gatewayProvider?.baseUrl ?? DEFAULT_ROUTE_URLS[backend],
		headers: normalizeHeaders({ ...gatewayProvider?.headers, ...localProvider?.headers }, backend),
		models: { ...gatewayModels, ...localModels },
		whitelist,
		blacklist: localProvider?.blacklist ?? gatewayProvider?.blacklist,
		hasGatewayModels: Object.keys(gatewayModels).length > 0,
	};
}

/**
 * Resolve parsed discovery and overlay data into an immutable runtime configuration.
 *
 * @param document - Parsed live discovery document, or undefined for fallback defaults.
 * @param overlay - Optional parsed local model overlay.
 * @returns Runtime gateway configuration.
 */
export function resolveGatewayConfig(
	document: GatewayDocument | undefined,
	overlay?: GatewayLocalOverlay,
	source: GatewayConfigSource = document ? "live" : "fallback",
): GatewayConfig {
	const enabled = new Set<Backend>(document?.enabledBackends ?? BACKENDS);
	for (const backend of BACKENDS) {
		if (overlay?.providers[backend]) enabled.add(backend);
	}
	return {
		origin: GATEWAY_ORIGIN,
		source,
		authEnv: document?.authEnv ?? "TOKEN",
		authCommand: document?.authCommand,
		enabledBackends: BACKENDS.filter((backend) => enabled.has(backend)),
		routes: {
			anthropic: resolveRoute("anthropic", document, overlay),
			openai: resolveRoute("openai", document, overlay),
			google: resolveRoute("google", document, overlay),
			xai: resolveRoute("xai", document, overlay),
			"workers-ai": resolveRoute("workers-ai", document, overlay),
		},
	};
}

/**
 * Remove gateway transport prefixes from visible model identifiers.
 *
 * @param modelId - Gateway or visible model identifier.
 * @param backend - Backend owning the identifier.
 * @returns Visible Pi model identifier.
 */
export function stripRoutePrefix(modelId: string, backend: Backend): string {
	switch (backend) {
		case "anthropic":
			return modelId.replace(/^anthropic\//, "");
		case "workers-ai":
			return modelId.replace(/^workers-ai\//, "");
		case "openai":
		case "google":
		case "xai":
			return modelId;
	}
}
