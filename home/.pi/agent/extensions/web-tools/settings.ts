import {
	type SearchDepth,
	type SearchProviderName,
	type WebFetchFormat,
	type WebToolsSettings,
} from "./types.ts";

const FETCH_DEFAULT_FORMAT_VALUES = ["markdown", "text", "html"] as const satisfies readonly WebFetchFormat[];
const SEARCH_PROVIDER_VALUES = ["exa"] as const satisfies readonly SearchProviderName[];
const SEARCH_DEFAULT_DEPTH_VALUES = ["auto", "fast", "deep"] as const satisfies readonly SearchDepth[];

const DEFAULTS = {
	fetchDefaultFormat: "markdown",
	fetchTimeoutSeconds: 30,
	fetchMaxResponseMB: 5,
	fetchBlockPrivateHosts: true,
	fetchMaxRedirects: 5,
	fetchFallbackUserAgent: "opencode",
	searchEnabled: true,
	searchProvider: "exa",
	searchEndpoint: "https://m.mulroy.dev/m/e",
	searchTimeoutSeconds: 25,
	searchDefaultMaxResults: 8,
	searchDefaultDepth: "auto",
} as const;

export function parseOnOff(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "on") return true;
	if (normalized === "off") return false;
	return fallback;
}

export function parseIntegerSetting(
	value: string | undefined,
	fallback: number,
	options: { min?: number; max?: number } = {},
): number {
	const parsed = Number.parseInt(value?.trim() ?? "", 10);
	if (!Number.isFinite(parsed)) return fallback;
	if (options.min !== undefined && parsed < options.min) return fallback;
	if (options.max !== undefined && parsed > options.max) return fallback;
	return parsed;
}

export function parseEnumSetting<T extends string>(
	value: string | undefined,
	allowed: readonly T[],
	fallback: T,
): T {
	if (!value) return fallback;
	const normalized = value.trim() as T;
	return allowed.includes(normalized) ? normalized : fallback;
}

export function getWebToolsSettings(): WebToolsSettings {
	const fetchDefaultFormat = parseEnumSetting(undefined, FETCH_DEFAULT_FORMAT_VALUES, DEFAULTS.fetchDefaultFormat);
	const searchProvider = parseEnumSetting(undefined, SEARCH_PROVIDER_VALUES, DEFAULTS.searchProvider);
	const searchDefaultDepth = parseEnumSetting(undefined, SEARCH_DEFAULT_DEPTH_VALUES, DEFAULTS.searchDefaultDepth);

	return {
		fetch: {
			defaultFormat: fetchDefaultFormat,
			timeoutSeconds: DEFAULTS.fetchTimeoutSeconds,
			maxResponseBytes: DEFAULTS.fetchMaxResponseMB * 1024 * 1024,
			blockPrivateHosts: DEFAULTS.fetchBlockPrivateHosts,
			maxRedirects: DEFAULTS.fetchMaxRedirects,
			fallbackUserAgent: DEFAULTS.fetchFallbackUserAgent,
		},
		search: {
			enabled: DEFAULTS.searchEnabled,
			provider: searchProvider,
			endpoint: DEFAULTS.searchEndpoint,
			timeoutSeconds: DEFAULTS.searchTimeoutSeconds,
			defaultMaxResults: DEFAULTS.searchDefaultMaxResults,
			defaultDepth: searchDefaultDepth,
		},
	};
}
