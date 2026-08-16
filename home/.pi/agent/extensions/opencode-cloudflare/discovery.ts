import type { Api, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import {
	AUTH_ORIGIN,
	BACKENDS,
	DEFAULT_ROUTE_URLS,
	DISCOVERY_TIMEOUT_MS,
	GATEWAY_ORIGIN,
	type Backend,
} from "./constants.ts";
import {
	isJsonBoolean,
	isJsonNumber,
	isJsonObject,
	isJsonString,
	parseJsonObject,
	parseJsonValue,
	type JsonObject,
	type JsonValue,
} from "./json-value.ts";
import { Redacted, type Redacted as RedactedValue } from "./redacted.ts";
import { failure, type Result, success } from "./result.ts";

/** Parsed model metadata supplied by gateway discovery. */
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
}

/** Model identifier to parsed model metadata. */
export type GatewayModelConfigMap = { readonly [modelId: string]: GatewayModelConfig };

/** HTTP header name to header value. */
export type GatewayHeaderMap = { readonly [headerName: string]: string };

/** Parsed backend metadata from gateway discovery. */
export interface GatewayProviderConfig {
	readonly baseUrl?: string;
	readonly headers?: GatewayHeaderMap;
	readonly whitelist?: readonly string[];
	readonly blacklist?: readonly string[];
	readonly models: GatewayModelConfigMap;
}

/** Authenticated remote configuration referenced by gateway discovery. */
export interface GatewayRemoteConfig {
	readonly url: string;
	readonly headers: GatewayHeaderMap;
}

/** Parsed gateway discovery or remote configuration document. */
export interface GatewayDocument {
	readonly authEnv?: string;
	readonly authCommand?: string | readonly string[];
	readonly remoteConfig?: GatewayRemoteConfig;
	readonly enabledBackends?: readonly Backend[];
	readonly providers: Readonly<Partial<Record<Backend, GatewayProviderConfig>>>;
}

/** Fully resolved route configuration consumed by model projection. */
export interface GatewayRouteConfig {
	readonly baseUrl: string;
	readonly headers: GatewayHeaderMap;
	readonly models: GatewayModelConfigMap;
	readonly whitelist?: readonly string[];
	readonly blacklist?: readonly string[];
	readonly hasGatewayModels: boolean;
}

/** Fully resolved gateway configuration. */
export interface GatewayConfig {
	readonly origin: typeof GATEWAY_ORIGIN;
	readonly authEnv: string;
	readonly authCommand?: string | readonly string[];
	readonly enabledBackends: readonly Backend[];
	readonly routes: Readonly<Record<Backend, GatewayRouteConfig>>;
}

/** Structured parse failure for gateway configuration. */
export class GatewayConfigParseError extends Error {
	readonly _tag = "GatewayConfigParseError" as const;

	/**
	 * Create a configuration parse failure.
	 *
	 * @param path - JSON path containing the invalid value.
	 * @param expected - Safe description of the expected value.
	 */
	constructor(
		readonly path: string,
		readonly expected: string,
	) {
		super(`Invalid gateway configuration at ${path}; expected ${expected}`);
		this.name = "GatewayConfigParseError";
	}
}

/** Classified configuration loading failure. */
export class GatewayConfigLoadError extends Error {
	readonly _tag = "GatewayConfigLoadError" as const;

	/**
	 * Create a safe configuration loading failure.
	 *
	 * @param reason - Stable failure classification.
	 * @param detail - Safe detail suitable for diagnostics.
	 * @param cause - Original unclassified cause retained internally.
	 */
	constructor(
		readonly reason: "http" | "network" | "remote-auth" | "remote-json" | "remote-document",
		readonly detail: string,
		override readonly cause?: unknown,
	) {
		super(detail);
		this.name = "GatewayConfigLoadError";
	}
}

const PROVIDER_ALIASES = {
	"cloudflare-workers-ai": "workers-ai",
} as const satisfies { readonly [alias: string]: Backend };

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

function requireObject(input: JsonValue, path: string): JsonObject {
	if (!isJsonObject(input)) throw new GatewayConfigParseError(path, "an object");
	return input;
}

function optionalObject(input: JsonValue | undefined, path: string): JsonObject | undefined {
	if (input === undefined) return undefined;
	return requireObject(input, path);
}

function optionalString(input: JsonValue | undefined, path: string): string | undefined {
	if (input === undefined) return undefined;
	if (!isJsonString(input)) throw new GatewayConfigParseError(path, "a string");
	const value = input.trim();
	if (!value) throw new GatewayConfigParseError(path, "a non-empty string");
	return value;
}

function optionalTrustedUrl(input: JsonValue | undefined, path: string, trustedOrigin: string): string | undefined {
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

function optionalBoolean(input: JsonValue | undefined, path: string): boolean | undefined {
	if (input === undefined) return undefined;
	if (!isJsonBoolean(input)) throw new GatewayConfigParseError(path, "a boolean");
	return input;
}

function optionalNonNegativeNumber(input: JsonValue | undefined, path: string): number | undefined {
	if (input === undefined) return undefined;
	if (!isJsonNumber(input) || input < 0) {
		throw new GatewayConfigParseError(path, "a non-negative finite number");
	}
	return input;
}

function optionalPositiveInteger(input: JsonValue | undefined, path: string): number | undefined {
	const value = optionalNonNegativeNumber(input, path);
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0) {
		throw new GatewayConfigParseError(path, "a positive integer");
	}
	return value;
}

function optionalStringArray(input: JsonValue | undefined, path: string): readonly string[] | undefined {
	if (input === undefined) return undefined;
	if (!Array.isArray(input)) throw new GatewayConfigParseError(path, "an array of strings");
	return input.map((value, index) => {
		const parsed = optionalString(value, `${path}[${index}]`);
		if (parsed === undefined) throw new GatewayConfigParseError(`${path}[${index}]`, "a non-empty string");
		return parsed;
	});
}

function parseHeaders(input: JsonValue | undefined, path: string): GatewayHeaderMap | undefined {
	const record = optionalObject(input, path);
	if (!record) return undefined;
	const headers: { [headerName: string]: string } = {};
	for (const [name, value] of Object.entries(record)) {
		const parsed = optionalString(value, `${path}.${name}`);
		if (parsed === undefined) throw new GatewayConfigParseError(`${path}.${name}`, "a non-empty string");
		headers[name] = parsed;
	}
	return headers;
}

function parseThinkingLevelMap(input: JsonValue | undefined, path: string): ThinkingLevelMap | undefined {
	const record = optionalObject(input, path);
	if (!record) return undefined;
	const parsed: ThinkingLevelMap = {};
	for (const level of THINKING_LEVELS) {
		const value = record[level];
		if (value === undefined) continue;
		if (value !== null && !isJsonString(value)) {
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
}

function parseOptionalEnum<Value extends string>(
	input: JsonValue | undefined,
	path: string,
	values: readonly Value[],
): Value | undefined {
	if (input === undefined) return undefined;
	const value = isJsonString(input) ? values.find((candidate) => candidate === input) : undefined;
	if (value === undefined) {
		throw new GatewayConfigParseError(path, `one of ${values.join(", ")}`);
	}
	return value;
}

function compactCompatibility(input: ParsedCompatibility): Model<Api>["compat"] {
	const entries = Object.entries(input).filter(([, value]) => value !== undefined);
	// SAFETY: ParsedCompatibility contains only keys and values admitted by Pi's
	// compatibility union; filtering removes absent properties before projection.
	return Object.fromEntries(entries) as Model<Api>["compat"];
}

function parseCompatibility(input: JsonValue | undefined, path: string): Model<Api>["compat"] | undefined {
	const record = optionalObject(input, path);
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
	};
	return compactCompatibility(parsed);
}

function parseModel(input: JsonValue, path: string): GatewayModelConfig {
	const record = requireObject(input, path);
	const modalities = optionalObject(record.modalities, `${path}.modalities`);
	const limit = optionalObject(record.limit, `${path}.limit`);
	const cost = optionalObject(record.cost, `${path}.cost`);
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
	};
}

function parseModels(input: JsonValue | undefined, path: string): GatewayModelConfigMap {
	const record = optionalObject(input, path);
	if (!record) return {};
	const models: { [modelId: string]: GatewayModelConfig } = {};
	for (const [modelId, value] of Object.entries(record)) {
		models[modelId] = parseModel(value, `${path}.${modelId}`);
	}
	return models;
}

function parseProvider(input: JsonValue, path: string): GatewayProviderConfig {
	const record = requireObject(input, path);
	const options = optionalObject(record.options, `${path}.options`);
	return {
		baseUrl: optionalTrustedUrl(options?.baseURL ?? options?.baseUrl, `${path}.options.baseURL`, GATEWAY_ORIGIN),
		headers: parseHeaders(options?.headers, `${path}.options.headers`),
		whitelist: optionalStringArray(record.whitelist, `${path}.whitelist`),
		blacklist: optionalStringArray(record.blacklist, `${path}.blacklist`),
		models: parseModels(record.models, `${path}.models`),
	};
}

function normalizeBackend(input: string): Backend | undefined {
	if (input === "cloudflare-workers-ai") return PROVIDER_ALIASES[input];
	return BACKENDS.find((backend) => backend === input);
}

function parseProviders(input: JsonValue | undefined, path: string): Readonly<Partial<Record<Backend, GatewayProviderConfig>>> {
	const record = optionalObject(input, path);
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

function parseEnabledBackends(input: JsonValue | undefined, path: string): readonly Backend[] | undefined {
	const providers = optionalStringArray(input, path);
	if (!providers) return undefined;
	const enabled = new Set<Backend>();
	for (const provider of providers) {
		const backend = normalizeBackend(provider);
		if (backend) enabled.add(backend);
	}
	return BACKENDS.filter((backend) => enabled.has(backend));
}

function parseAuthCommand(input: JsonValue | undefined, path: string): string | readonly string[] | undefined {
	if (input === undefined) return undefined;
	if (isJsonString(input)) return optionalString(input, path);
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
		const decoded = parseJsonObject(input, "$");
		if (!decoded.ok) {
			return failure(new GatewayConfigParseError(decoded.error.path, decoded.error.expected));
		}
		const root = decoded.value;
		const auth = optionalObject(root.auth, "$.auth");
		const remoteConfig = optionalObject(root.remote_config, "$.remote_config");
		const nestedConfig = optionalObject(root.config, "$.config");
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

function resolveRoute(backend: Backend, document: GatewayDocument): GatewayRouteConfig {
	const provider = document.providers[backend];
	const models = provider?.models ?? {};
	return {
		baseUrl: provider?.baseUrl ?? DEFAULT_ROUTE_URLS[backend],
		headers: provider?.headers ?? {},
		models,
		whitelist: provider?.whitelist,
		blacklist: provider?.blacklist,
		hasGatewayModels: Object.keys(models).length > 0,
	};
}

/**
 * Resolve a parsed discovery document into an immutable runtime configuration.
 *
 * @param document - Parsed live discovery document.
 * @returns Runtime gateway configuration.
 */
export function resolveGatewayConfig(document: GatewayDocument): GatewayConfig {
	const enabled = new Set<Backend>(document.enabledBackends ?? BACKENDS);
	return {
		origin: GATEWAY_ORIGIN,
		authEnv: document.authEnv ?? "TOKEN",
		authCommand: document.authCommand,
		enabledBackends: BACKENDS.filter((backend) => enabled.has(backend)),
		routes: {
			anthropic: resolveRoute("anthropic", document),
			openai: resolveRoute("openai", document),
			google: resolveRoute("google", document),
			xai: resolveRoute("xai", document),
			"workers-ai": resolveRoute("workers-ai", document),
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

function createRequestSignal(signal: AbortSignal | undefined): AbortSignal {
	const timeout = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchJson(
	url: string,
	headers: GatewayHeaderMap,
	signal: AbortSignal | undefined,
	fetchImpl: typeof fetch,
): Promise<Result<JsonValue, GatewayConfigLoadError>> {
	try {
		const response = await fetchImpl(url, {
			method: "GET",
			headers: { Accept: "application/json", ...headers },
			signal: createRequestSignal(signal),
		});
		if (!response.ok) {
			return failure(new GatewayConfigLoadError(
				"http",
				`Gateway configuration request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
			));
		}
		try {
			const parsed = parseJsonValue(await response.json());
			return parsed.ok
				? success(parsed.value)
				: failure(new GatewayConfigLoadError("remote-json", "Gateway configuration returned invalid JSON", parsed.error));
		} catch (cause) {
			return failure(new GatewayConfigLoadError("remote-json", "Gateway configuration returned invalid JSON", cause));
		}
	} catch (cause) {
		return failure(new GatewayConfigLoadError("network", "Gateway configuration request failed", cause));
	}
}

function resolveRemoteHeaders(
	document: GatewayDocument,
	token: RedactedValue<string> | undefined,
): Result<GatewayHeaderMap, GatewayConfigLoadError> {
	const remote = document.remoteConfig;
	if (!remote) return success({});
	const placeholder = `{env:${document.authEnv ?? "TOKEN"}}`;
	const needsToken = Object.values(remote.headers).some((value) => value.includes(placeholder));
	if (needsToken && !token) {
		return failure(new GatewayConfigLoadError("remote-auth", "Gateway remote configuration requires authentication"));
	}
	const value = token ? Redacted.value(token) : undefined;
	const headers: { [headerName: string]: string } = {};
	for (const [name, header] of Object.entries(remote.headers)) {
		headers[name] = value ? header.replaceAll(placeholder, value) : header;
	}
	return success(headers);
}

/**
 * Fetch and validate the trusted discovery document and optional authenticated remote config.
 *
 * @param options - Network, token, and cancellation inputs.
 * @returns Resolved gateway configuration or a classified load failure.
 */
export async function fetchGatewayConfig(options: {
	readonly token?: RedactedValue<string>;
	readonly signal?: AbortSignal;
	readonly fetch?: typeof fetch;
	readonly wellKnownUrl?: string;
}): Promise<Result<GatewayConfig, GatewayConfigLoadError>> {
	const fetchImpl = options.fetch ?? fetch;
	const wellKnownUrl = options.wellKnownUrl ?? `${AUTH_ORIGIN}/.well-known/opencode`;
	const discoveryResponse = await fetchJson(wellKnownUrl, {}, options.signal, fetchImpl);
	if (!discoveryResponse.ok) return discoveryResponse;
	const parsedDiscovery = parseGatewayDocument(discoveryResponse.value);
	if (!parsedDiscovery.ok) {
		return failure(new GatewayConfigLoadError("remote-document", parsedDiscovery.error.message, parsedDiscovery.error));
	}
	let document = parsedDiscovery.value;
	if (document.remoteConfig) {
		const headers = resolveRemoteHeaders(document, options.token);
		if (!headers.ok) return headers;
		const remoteResponse = await fetchJson(document.remoteConfig.url, headers.value, options.signal, fetchImpl);
		if (!remoteResponse.ok) return remoteResponse;
		const parsedRemote = parseGatewayDocument(remoteResponse.value);
		if (!parsedRemote.ok) {
			return failure(new GatewayConfigLoadError("remote-document", parsedRemote.error.message, parsedRemote.error));
		}
		document = mergeGatewayDocuments(document, parsedRemote.value);
	}
	return success(resolveGatewayConfig(document));
}
