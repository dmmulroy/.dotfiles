import {
	parsePublicHttpUrl,
	type PublicHttpUrl,
	type SearchDepth,
	type SearchProviderName,
	type WebFetchFormat,
	type WebToolsSettings,
} from "./types.ts";

export const WEB_FETCH_FORMATS = ["markdown", "text", "html"] as const satisfies readonly WebFetchFormat[];
export const SEARCH_DEPTHS = ["auto", "fast", "deep"] as const satisfies readonly SearchDepth[];
export const SEARCH_PROVIDERS = ["exa"] as const satisfies readonly SearchProviderName[];

export const FETCH_TIMEOUT_SECONDS = {
	default: 30,
	min: 1,
	max: 120,
} as const;

export const SEARCH_TIMEOUT_SECONDS = {
	default: 25,
	min: 1,
	max: 120,
} as const;

export const SEARCH_MAX_RESULTS = {
	default: 8,
	min: 1,
	max: 20,
} as const;

export const FETCH_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 5;

export type ToolInputParseError =
	| { readonly _tag: "InvalidToolInput"; readonly message: string }
	| { readonly _tag: "InvalidToolField"; readonly field: string; readonly message: string }
	| { readonly _tag: "UnknownToolField"; readonly field: string };

const DEFAULTS = {
	fetchDefaultFormat: "markdown",
	fetchTimeoutSeconds: FETCH_TIMEOUT_SECONDS.default,
	fetchMaxResponseBytes: FETCH_MAX_RESPONSE_BYTES,
	fetchBlockPrivateHosts: true,
	fetchMaxRedirects: FETCH_MAX_REDIRECTS,
	fetchFallbackUserAgent: "opencode",
	searchEnabled: true,
	searchProvider: "exa",
	searchEndpoint: "https://m.mulroy.dev/m/e",
	searchTimeoutSeconds: SEARCH_TIMEOUT_SECONDS.default,
	searchDefaultMaxResults: SEARCH_MAX_RESULTS.default,
	searchDefaultDepth: "auto",
} as const;

/** Clamp a finite number to an inclusive integer range. */
export function clampInteger(
	value: number,
	bounds: { readonly min: number; readonly max: number; readonly fallback: number },
): number {
	if (!Number.isFinite(value)) {
		return bounds.fallback;
	}

	return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

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

/** Return hardcoded web-tools settings. */
export function getWebToolsSettings(): WebToolsSettings {
	return {
		fetch: {
			defaultFormat: DEFAULTS.fetchDefaultFormat,
			timeoutSeconds: DEFAULTS.fetchTimeoutSeconds,
			maxResponseBytes: DEFAULTS.fetchMaxResponseBytes,
			blockPrivateHosts: DEFAULTS.fetchBlockPrivateHosts,
			maxRedirects: DEFAULTS.fetchMaxRedirects,
			fallbackUserAgent: DEFAULTS.fetchFallbackUserAgent,
		},
		search: {
			enabled: DEFAULTS.searchEnabled,
			provider: DEFAULTS.searchProvider,
			endpoint: mustParsePublicHttpUrl(DEFAULTS.searchEndpoint),
			timeoutSeconds: DEFAULTS.searchTimeoutSeconds,
			defaultMaxResults: DEFAULTS.searchDefaultMaxResults,
			defaultDepth: DEFAULTS.searchDefaultDepth,
		},
	};
}

function mustParsePublicHttpUrl(input: string): PublicHttpUrl {
	const parsed = parsePublicHttpUrl(input);
	if (parsed._tag === "err") {
		throw new Error("Invalid hardcoded web-tools search endpoint");
	}
	return parsed.value;
}
