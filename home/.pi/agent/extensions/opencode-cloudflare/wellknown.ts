import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	DEFAULT_ROUTE_HEADERS,
	DEFAULT_ROUTE_URLS,
	ENABLED_BACKENDS,
	type Backend,
	EXPIRY_SAFETY_BUFFER_MS,
	GATEWAY_ORIGIN,
	LOCAL_CONFIG_ENV,
	TOKEN_ENV_OVERRIDE,
	WELL_KNOWN_CACHE_TTL_MS,
	WELL_KNOWN_URL,
} from "./constants.ts";

export interface GatewayModelLimit {
	context?: number;
	output?: number;
}

export interface GatewayModelModalities {
	input?: string[];
	output?: string[];
}

export interface GatewayModelConfig {
	id?: string;
	name?: string;
	attachment?: boolean;
	reasoning?: boolean;
	tool_call?: boolean;
	temperature?: boolean;
	interleaved?: { field?: string };
	modalities?: GatewayModelModalities;
	limit?: GatewayModelLimit;
	cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
	thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
	compat?: Model<Api>["compat"];
	options?: Record<string, unknown>;
}

export interface GatewayRouteConfig {
	baseUrl: string;
	headers: Record<string, string>;
	models: Record<string, GatewayModelConfig>;
	whitelist?: string[];
	blacklist?: string[];
	/** True only when the gateway itself supplied models before local overlays are merged. */
	hasGatewayModels: boolean;
}

export interface GatewayWellKnownResponse {
	auth?: {
		command?: string | string[];
		env?: string;
	};
	config?: {
		enabled_providers?: string[];
		provider?: Partial<Record<Backend | "cloudflare-workers-ai", {
			name?: string;
			npm?: string;
			whitelist?: string[];
			blacklist?: string[];
			options?: {
				baseURL?: string;
				baseUrl?: string;
				apiKey?: string;
				headers?: Record<string, unknown>;
			};
			models?: Record<string, GatewayModelConfig>;
		}>>;
	};
}

export type GatewayConfigSource = "live" | "fallback";

export interface ResolvedGatewayConfig {
	origin: string;
	source: GatewayConfigSource;
	authEnv: string;
	authCommand?: string | string[];
	enabledBackends: Backend[];
	routes: Record<Backend, GatewayRouteConfig>;
	raw?: GatewayWellKnownResponse;
}

export interface GatewayConfigStatus {
	cacheSource?: GatewayConfigSource;
	cacheExpiresAt?: number;
	lastFetchAt?: number;
	lastFetchError?: string;
}

interface GatewayLocalOverlay {
	provider?: GatewayWellKnownResponse["config"] extends infer Config
		? Config extends { provider?: infer Provider }
			? Provider
			: never
		: never;
	config?: {
		provider?: GatewayWellKnownResponse["config"] extends infer Config
			? Config extends { provider?: infer Provider }
				? Provider
				: never
			: never;
	};
}

let cachedGatewayConfig: { expiresAt: number; value: ResolvedGatewayConfig } | undefined;
let lastGatewayFetch: { attemptedAt: number; error?: string } | undefined;

export function isAllowedGatewayOrigin(input: string): boolean {
	try {
		return new URL(input).origin === new URL(GATEWAY_ORIGIN).origin;
	} catch {
		return false;
	}
}

export function normalizeGatewayOrigin(input: string): string {
	const url = new URL(input);
	url.hash = "";
	url.search = "";
	url.pathname = "";
	return url.origin;
}

/** Map external provider names from the gateway to internal Backend identifiers. */
const PROVIDER_ALIASES: Record<string, Backend> = {
	"cloudflare-workers-ai": "workers-ai",
};

function normalizeProviderName(name: string): string {
	return PROVIDER_ALIASES[name] || name;
}

function normalizeBackendList(enabledProviders: string[] | undefined): Backend[] {
	if (!enabledProviders?.length) return [...ENABLED_BACKENDS];
	const enabled = new Set(enabledProviders.map(normalizeProviderName));
	return ENABLED_BACKENDS.filter((backend) => enabled.has(backend));
}

function getLocalConfigPath(): string {
	return process.env[LOCAL_CONFIG_ENV]?.trim() || join(homedir(), ".pi", "agent", "opencode-cloudflare.local.jsonc");
}

/** Strip `//` line comments and trailing commas from JSONC, leaving string literals untouched. */
function stripJsonComments(input: string): string {
	return input
		.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) => (match[0] === '"' ? match : ""))
		.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail: string | undefined) => tail ?? (match[0] === '"' ? match : ""));
}

function readLocalOverlay(): GatewayLocalOverlay | undefined {
	const path = getLocalConfigPath();
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(stripJsonComments(readFileSync(path, "utf8"))) as GatewayLocalOverlay;
	} catch (error) {
		console.warn(`Ignoring invalid ${LOCAL_CONFIG_ENV} file at ${path}: ${error instanceof Error ? error.message : error}`);
		return undefined;
	}
}

function getLocalProviderModels(overlay: GatewayLocalOverlay | undefined) {
	const provider = overlay?.provider || overlay?.config?.provider;
	if (!provider) return [];
	return Object.entries(provider).flatMap(([providerName, providerConfig]) => {
		const backend = normalizeProviderName(providerName);
		if (!ENABLED_BACKENDS.includes(backend as Backend)) return [];
		const models = providerConfig?.models || {};
		return Object.keys(models).length > 0 ? [{ backend: backend as Backend, models }] : [];
	});
}

function mergeLocalOverlay(resolved: ResolvedGatewayConfig): ResolvedGatewayConfig {
	const localProviderModels = getLocalProviderModels(readLocalOverlay());
	for (const { backend, models } of localProviderModels) {
		if (!resolved.enabledBackends.includes(backend)) {
			resolved.enabledBackends.push(backend);
		}
		Object.assign(resolved.routes[backend].models, models);
		if (backend === "workers-ai" && resolved.routes[backend].whitelist?.length) {
			const whitelist = new Set(resolved.routes[backend].whitelist);
			for (const [modelId, config] of Object.entries(models)) {
				whitelist.add(modelId);
				if (config.id) whitelist.add(stripRoutePrefix(config.id, backend));
			}
			resolved.routes[backend].whitelist = Array.from(whitelist);
		}
	}
	return resolved;
}

function normalizeHeaders(headers: Record<string, unknown> | undefined, backend: Backend): Record<string, string> {
	const resolved: Record<string, string> = { ...DEFAULT_ROUTE_HEADERS[backend] };
	for (const [key, value] of Object.entries(headers || {})) {
		if (typeof value === "string" && value.trim()) {
			resolved[key] = value;
		}
	}

	if (backend === "anthropic" && resolved["anthropic-beta"]) {
		const mergedValues = new Set(
			resolved["anthropic-beta"]
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);
		mergedValues.add("interleaved-thinking-2025-05-14");
		mergedValues.add("fine-grained-tool-streaming-2025-05-14");
		resolved["anthropic-beta"] = Array.from(mergedValues).join(",");
	}

	return resolved;
}

function getRouteProviderConfig(raw: GatewayWellKnownResponse["config"], backend: Backend) {
	// Try the canonical internal name first, then check aliases
	const provider = raw?.provider;
	if (!provider) return undefined;
	if (provider[backend]) return provider[backend];
	// Look for an aliased key that maps to this backend
	for (const [alias, target] of Object.entries(PROVIDER_ALIASES)) {
		if (target === backend && provider[alias as keyof typeof provider]) {
			return provider[alias as keyof typeof provider];
		}
	}
	return undefined;
}

function resolveRouteConfig(raw: GatewayWellKnownResponse | undefined, backend: Backend): GatewayRouteConfig {
	const providerConfig = getRouteProviderConfig(raw?.config, backend);
	const options = providerConfig?.options;
	const gatewayModels = providerConfig?.models || {};

	return {
		baseUrl: options?.baseURL || options?.baseUrl || DEFAULT_ROUTE_URLS[backend],
		headers: normalizeHeaders(options?.headers, backend),
		models: gatewayModels,
		whitelist: providerConfig?.whitelist,
		blacklist: providerConfig?.blacklist,
		hasGatewayModels: Object.keys(gatewayModels).length > 0,
	};
}

function resolveGatewayConfig(
	raw: GatewayWellKnownResponse | undefined,
	source: GatewayConfigSource = raw ? "live" : "fallback",
): ResolvedGatewayConfig {
	const enabledBackends = normalizeBackendList(raw?.config?.enabled_providers);
	return mergeLocalOverlay({
		origin: GATEWAY_ORIGIN,
		source,
		authEnv: raw?.auth?.env || "TOKEN",
		authCommand: raw?.auth?.command,
		enabledBackends,
		routes: {
			anthropic: resolveRouteConfig(raw, "anthropic"),
			openai: resolveRouteConfig(raw, "openai"),
			google: resolveRouteConfig(raw, "google"),
			"workers-ai": resolveRouteConfig(raw, "workers-ai"),
		},
		raw,
	});
}

export function getDefaultGatewayConfig(): ResolvedGatewayConfig {
	return resolveGatewayConfig(undefined);
}

export function clearGatewayConfigCache(): void {
	cachedGatewayConfig = undefined;
}

export function getGatewayConfigStatus(): GatewayConfigStatus {
	return {
		cacheSource: cachedGatewayConfig?.value.source,
		cacheExpiresAt: cachedGatewayConfig?.expiresAt,
		lastFetchAt: lastGatewayFetch?.attemptedAt,
		lastFetchError: lastGatewayFetch?.error,
	};
}

export async function getGatewayConfig(options?: {
	forceReload?: boolean;
	fallbackToDefault?: boolean;
}): Promise<ResolvedGatewayConfig> {
	const forceReload = options?.forceReload === true;
	const fallbackToDefault = options?.fallbackToDefault !== false;
	const now = Date.now();

	if (!forceReload && cachedGatewayConfig && cachedGatewayConfig.expiresAt > now) {
		return cachedGatewayConfig.value;
	}

	try {
		const response = await fetch(WELL_KNOWN_URL, {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			throw new Error(`Gateway well-known request failed: ${response.status} ${response.statusText}`);
		}

		const raw = (await response.json()) as GatewayWellKnownResponse;
		const resolved = resolveGatewayConfig(raw, "live");
		lastGatewayFetch = { attemptedAt: now };
		cachedGatewayConfig = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value: resolved };
		return resolved;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		lastGatewayFetch = { attemptedAt: now, error: message };
		if (!fallbackToDefault) {
			throw error;
		}
		const fallback = getDefaultGatewayConfig();
		cachedGatewayConfig = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value: fallback };
		return fallback;
	}
}

export function stripRoutePrefix(modelId: string, backend: Backend): string {
	switch (backend) {
		case "anthropic":
			return modelId.replace(/^anthropic\//, "");
		case "workers-ai":
			return modelId.replace(/^workers-ai\//, "");
		default:
			return modelId;
	}
}

export function applyGatewayToken(
	headers: Record<string, string> | undefined,
	authEnv: string,
	token: string,
): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers || {})) {
		resolved[key] = value.replace(new RegExp(`\\{env:${escapeRegExp(authEnv)}\\}`, "g"), token);
	}
	if (!resolved["cf-access-token"]) {
		resolved["cf-access-token"] = token;
	}
	if (!resolved["X-Requested-With"]) {
		resolved["X-Requested-With"] = "xmlhttprequest";
	}
	return resolved;
}

export function resolvePreferredToken(passedApiKey?: string): string | undefined {
	if (passedApiKey?.trim()) return passedApiKey.trim();
	if (process.env[TOKEN_ENV_OVERRIDE]?.trim()) return process.env[TOKEN_ENV_OVERRIDE]?.trim();
	return undefined;
}

export function getGatewayTokenExpiry(token: string): number | undefined {
	const parts = token.split(".");
	if (parts.length < 2) return undefined;
	try {
		const payload = JSON.parse(Buffer.from(base64UrlToBase64(parts[1] || ""), "base64").toString("utf8")) as {
			exp?: number;
		};
		if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
			return payload.exp * 1000 - EXPIRY_SAFETY_BUFFER_MS;
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function base64UrlToBase64(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const remainder = normalized.length % 4;
	if (remainder === 0) return normalized;
	return normalized.padEnd(normalized.length + (4 - remainder), "=");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
