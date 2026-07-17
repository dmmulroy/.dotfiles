import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { LOCAL_CONFIG_ENV, WELL_KNOWN_CACHE_TTL_MS, WELL_KNOWN_URL } from "./constants.ts";
import {
	type GatewayConfig,
	type GatewayDocument,
	type GatewayLocalOverlay,
	mergeGatewayDocuments,
	parseGatewayDocument,
	parseGatewayLocalOverlay,
	resolveGatewayConfig,
} from "./config.ts";
import { failure, type Result, success } from "./result.ts";

/** Snapshot of gateway configuration cache and fetch health. */
export interface GatewayConfigStatus {
	readonly cacheSource?: GatewayConfig["source"];
	readonly cacheExpiresAt?: number;
	readonly lastFetchAt?: number;
	readonly lastFetchError?: string;
}

/** Options controlling configuration retrieval. */
export interface GatewayConfigLoadOptions {
	readonly forceReload?: boolean;
	readonly fallbackToDefault?: boolean;
	readonly allowNetwork?: boolean;
	readonly authToken?: string;
	readonly signal?: AbortSignal;
}

/** Dependencies used by the configuration store. */
export interface GatewayConfigStoreDependencies {
	readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
	readonly readTextFile: (path: string) => string | undefined;
	readonly localConfigPath: () => string;
	readonly resolveToken: () => string | undefined;
	readonly now: () => number;
	readonly requestTimeoutMs?: number;
}

/** Runtime configuration store contract. */
export interface GatewayConfigStore {
	/** Load cached, live, or fallback gateway configuration. */
	load(options?: GatewayConfigLoadOptions): Promise<Result<GatewayConfig, GatewayConfigLoadError>>;
	/** Clear only the runtime cache, retaining diagnostics from the last fetch. */
	clear(): void;
	/** Return current cache and fetch diagnostics. */
	status(): GatewayConfigStatus;
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
		readonly reason: "http" | "network" | "remote-auth" | "remote-json" | "remote-shape" | "local-json" | "local-shape",
		readonly detail: string,
		override readonly cause?: unknown,
	) {
		super(detail);
		this.name = "GatewayConfigLoadError";
	}
}

/**
 * Strip line comments and trailing commas from a JSONC document.
 *
 * @param input - Raw JSONC text.
 * @returns JSON text preserving quoted string contents.
 */
export function stripJsonComments(input: string): string {
	return input
		.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) => (match[0] === '"' ? match : ""))
		.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail: string | undefined) => tail ?? (match[0] === '"' ? match : ""));
}

function parseJson(text: string, reason: "remote-json" | "local-json", location: string): Result<unknown, GatewayConfigLoadError> {
	try {
		const value: unknown = JSON.parse(text);
		return success(value);
	} catch (cause) {
		return failure(new GatewayConfigLoadError(reason, `Invalid JSON in ${location}`, cause));
	}
}

function parseLocalOverlay(dependencies: GatewayConfigStoreDependencies): Result<GatewayLocalOverlay | undefined, GatewayConfigLoadError> {
	const path = dependencies.localConfigPath();
	let contents: string | undefined;
	try {
		contents = dependencies.readTextFile(path);
	} catch (cause) {
		return failure(new GatewayConfigLoadError("local-json", `Unable to read local gateway overlay at ${path}`, cause));
	}
	if (contents === undefined) return success(undefined);
	const decoded = parseJson(stripJsonComments(contents), "local-json", path);
	if (!decoded.ok) return decoded;
	const parsed = parseGatewayLocalOverlay(decoded.value);
	return parsed.ok
		? success(parsed.value)
		: failure(new GatewayConfigLoadError("local-shape", parsed.error.message, parsed.error));
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchJson(
	dependencies: GatewayConfigStoreDependencies,
	url: string,
	headers: Readonly<Record<string, string>>,
	signal: AbortSignal | undefined,
): Promise<Result<unknown, GatewayConfigLoadError>> {
	try {
		const response = await dependencies.fetch(url, {
			method: "GET",
			headers: { Accept: "application/json", ...headers },
			signal: createRequestSignal(signal, dependencies.requestTimeoutMs ?? 10_000),
		});
		if (!response.ok) {
			return failure(new GatewayConfigLoadError(
				"http",
				`Gateway configuration request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
			));
		}
		try {
			const value: unknown = await response.json();
			return success(value);
		} catch (cause) {
			return failure(new GatewayConfigLoadError("remote-json", "Gateway configuration returned invalid JSON", cause));
		}
	} catch (cause) {
		return failure(new GatewayConfigLoadError("network", "Gateway configuration request failed", cause));
	}
}

function resolveRemoteHeaders(
	document: GatewayDocument,
	resolveToken: () => string | undefined,
): Result<Readonly<Record<string, string>>, GatewayConfigLoadError> {
	const remote = document.remoteConfig;
	if (!remote) return success({});
	const placeholder = `{env:${document.authEnv ?? "TOKEN"}}`;
	const needsToken = Object.values(remote.headers).some((value) => value.includes(placeholder));
	const token = needsToken ? resolveToken() : undefined;
	if (needsToken && !token) {
		return failure(new GatewayConfigLoadError("remote-auth", "Gateway remote configuration requires authentication"));
	}
	return success(Object.fromEntries(
		Object.entries(remote.headers).map(([name, value]) => [name, token ? value.replaceAll(placeholder, token) : value]),
	));
}

function fallbackDocument(discovery: GatewayDocument | undefined): GatewayDocument | undefined {
	if (!discovery) return undefined;
	return {
		authEnv: discovery.authEnv,
		authCommand: discovery.authCommand,
		providers: {},
	};
}

/**
 * Create an isolated gateway configuration store.
 *
 * @param dependencies - Explicit network, filesystem, token, and clock capabilities.
 * @returns Store with instance-owned cache state.
 */
export function createGatewayConfigStore(dependencies: GatewayConfigStoreDependencies): GatewayConfigStore {
	let cache: { readonly expiresAt: number; readonly value: GatewayConfig } | undefined;
	let lastFetch: { readonly attemptedAt: number; readonly error?: string } | undefined;

	return {
		async load(options = {}) {
			const now = dependencies.now();
			if (
				!options.forceReload
				&& cache
				&& cache.expiresAt > now
				&& (options.allowNetwork !== true || cache.value.source === "live")
			) return success(cache.value);
			const overlay = parseLocalOverlay(dependencies);
			if (!overlay.ok) return overlay;
			if (options.allowNetwork === false) {
				if (cache) return success(cache.value);
				const value = resolveGatewayConfig(undefined, overlay.value, "fallback");
				cache = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value };
				return success(value);
			}

			let discovery: GatewayDocument | undefined;
			let liveDocument: GatewayDocument | undefined;
			let fetchError: GatewayConfigLoadError | undefined;
			const discoveryResponse = await fetchJson(dependencies, WELL_KNOWN_URL, {}, options.signal);
			if (!discoveryResponse.ok) {
				fetchError = discoveryResponse.error;
			} else {
				const parsedDiscovery = parseGatewayDocument(discoveryResponse.value);
				if (!parsedDiscovery.ok) {
					fetchError = new GatewayConfigLoadError("remote-shape", parsedDiscovery.error.message, parsedDiscovery.error);
				} else {
					discovery = parsedDiscovery.value;
					liveDocument = discovery;
					if (discovery.remoteConfig) {
						const headers = resolveRemoteHeaders(discovery, () => options.authToken ?? dependencies.resolveToken());
						if (!headers.ok) {
							fetchError = headers.error;
						} else {
							const remoteResponse = await fetchJson(dependencies, discovery.remoteConfig.url, headers.value, options.signal);
							if (!remoteResponse.ok) {
								fetchError = remoteResponse.error;
							} else {
								const parsedRemote = parseGatewayDocument(remoteResponse.value);
								if (!parsedRemote.ok) {
									fetchError = new GatewayConfigLoadError("remote-shape", parsedRemote.error.message, parsedRemote.error);
								} else {
									liveDocument = mergeGatewayDocuments(discovery, parsedRemote.value);
								}
							}
						}
					}
				}
			}

			lastFetch = fetchError ? { attemptedAt: now, error: fetchError.message } : { attemptedAt: now };
			if (fetchError && options.fallbackToDefault === false) return failure(fetchError);
			if (fetchError && cache?.value.source === "live") {
				cache = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value: cache.value };
				return success(cache.value);
			}
			const value = resolveGatewayConfig(
				fetchError ? fallbackDocument(discovery) : liveDocument,
				overlay.value,
				fetchError ? "fallback" : "live",
			);
			cache = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value };
			return success(value);
		},
		clear() {
			cache = undefined;
		},
		status() {
			return {
				cacheSource: cache?.value.source,
				cacheExpiresAt: cache?.expiresAt,
				lastFetchAt: lastFetch?.attemptedAt,
				lastFetchError: lastFetch?.error,
			};
		},
	};
}

/**
 * Create the production configuration store using Node and global fetch capabilities.
 *
 * @param resolveToken - Returns a gateway token only at the authenticated remote-config boundary.
 * @returns Isolated store for one extension runtime.
 */
export function createProductionGatewayConfigStore(resolveToken: () => string | undefined): GatewayConfigStore {
	return createGatewayConfigStore({
		fetch: (url, init) => fetch(url, init),
		readTextFile: (path) => existsSync(path) ? readFileSync(path, "utf8") : undefined,
		localConfigPath: () => process.env[LOCAL_CONFIG_ENV]?.trim() || join(getAgentDir(), "opencode-cloudflare.local.jsonc"),
		resolveToken,
		now: () => Date.now(),
	});
}
