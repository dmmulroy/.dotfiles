import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSetting, type SettingDefinition } from "@juanibiapina/pi-extension-settings";
import {
	WEB_TOOLS_EXTENSION_NAME,
	type SearchDepth,
	type SearchProviderName,
	type WebFetchFormat,
	type WebToolsSettings,
} from "./types.ts";

const FETCH_DEFAULT_FORMAT_VALUES = ["markdown", "text", "html"] as const satisfies readonly WebFetchFormat[];
const FETCH_TIMEOUT_VALUES = ["10", "20", "30", "60", "120"] as const;
const FETCH_MAX_RESPONSE_MB_VALUES = ["1", "2", "5", "10"] as const;
const FETCH_BLOCK_PRIVATE_HOST_VALUES = ["on", "off"] as const;
const FETCH_MAX_REDIRECT_VALUES = ["0", "3", "5", "10"] as const;
const SEARCH_ENABLED_VALUES = ["on", "off"] as const;
const SEARCH_PROVIDER_VALUES = ["exa"] as const satisfies readonly SearchProviderName[];
const SEARCH_TIMEOUT_VALUES = ["10", "15", "25", "30", "60"] as const;
const SEARCH_DEFAULT_MAX_RESULTS_VALUES = ["3", "5", "8", "10"] as const;
const SEARCH_DEFAULT_DEPTH_VALUES = ["auto", "fast", "deep"] as const satisfies readonly SearchDepth[];

const DEFAULTS = {
	fetchDefaultFormat: "markdown",
	fetchTimeoutSeconds: "30",
	fetchMaxResponseMB: "5",
	fetchBlockPrivateHosts: "on",
	fetchMaxRedirects: "5",
	fetchUserAgent: "pi-web-tools/1.0",
	searchEnabled: "on",
	searchProvider: "exa",
	searchEndpoint: "https://mcp.exa.ai/mcp",
	searchTimeoutSeconds: "25",
	searchDefaultMaxResults: "8",
	searchDefaultDepth: "auto",
} as const;

export const WEB_TOOLS_SETTING_DEFINITIONS = [
	{
		id: "fetchDefaultFormat",
		label: "Fetch Default Format",
		description: "Default output format for webfetch when no format parameter is provided.",
		defaultValue: DEFAULTS.fetchDefaultFormat,
		values: [...FETCH_DEFAULT_FORMAT_VALUES],
	},
	{
		id: "fetchTimeoutSeconds",
		label: "Fetch Timeout",
		description: "Timeout in seconds for webfetch requests.",
		defaultValue: DEFAULTS.fetchTimeoutSeconds,
		values: [...FETCH_TIMEOUT_VALUES],
	},
	{
		id: "fetchMaxResponseMB",
		label: "Fetch Max Response Size",
		description: "Maximum response size in megabytes before webfetch aborts.",
		defaultValue: DEFAULTS.fetchMaxResponseMB,
		values: [...FETCH_MAX_RESPONSE_MB_VALUES],
	},
	{
		id: "fetchBlockPrivateHosts",
		label: "Block Private Hosts",
		description: "Block localhost, loopback, and private-network targets in webfetch.",
		defaultValue: DEFAULTS.fetchBlockPrivateHosts,
		values: [...FETCH_BLOCK_PRIVATE_HOST_VALUES],
	},
	{
		id: "fetchMaxRedirects",
		label: "Fetch Max Redirects",
		description: "Maximum number of redirects webfetch will follow.",
		defaultValue: DEFAULTS.fetchMaxRedirects,
		values: [...FETCH_MAX_REDIRECT_VALUES],
	},
	{
		id: "fetchUserAgent",
		label: "Fetch User-Agent",
		description: "User-Agent string sent by webfetch requests.",
		defaultValue: DEFAULTS.fetchUserAgent,
	},
	{
		id: "searchEnabled",
		label: "Enable Web Search",
		description: "Register the websearch tool.",
		defaultValue: DEFAULTS.searchEnabled,
		values: [...SEARCH_ENABLED_VALUES],
	},
	{
		id: "searchProvider",
		label: "Search Provider",
		description: "Backend provider used by websearch.",
		defaultValue: DEFAULTS.searchProvider,
		values: [...SEARCH_PROVIDER_VALUES],
	},
	{
		id: "searchEndpoint",
		label: "Search Endpoint",
		description: "Endpoint URL used by the search provider adapter.",
		defaultValue: DEFAULTS.searchEndpoint,
	},
	{
		id: "searchTimeoutSeconds",
		label: "Search Timeout",
		description: "Timeout in seconds for websearch requests.",
		defaultValue: DEFAULTS.searchTimeoutSeconds,
		values: [...SEARCH_TIMEOUT_VALUES],
	},
	{
		id: "searchDefaultMaxResults",
		label: "Search Default Max Results",
		description: "Default number of websearch results when no maxResults parameter is provided.",
		defaultValue: DEFAULTS.searchDefaultMaxResults,
		values: [...SEARCH_DEFAULT_MAX_RESULTS_VALUES],
	},
	{
		id: "searchDefaultDepth",
		label: "Search Default Depth",
		description: "Default search depth for websearch when no depth parameter is provided.",
		defaultValue: DEFAULTS.searchDefaultDepth,
		values: [...SEARCH_DEFAULT_DEPTH_VALUES],
	},
] satisfies SettingDefinition[];

let hasRegisteredSettings = false;

export function registerWebToolsSettings(pi: ExtensionAPI): void {
	if (hasRegisteredSettings) return;
	hasRegisteredSettings = true;
	pi.events.emit("pi-extension-settings:register", {
		name: WEB_TOOLS_EXTENSION_NAME,
		settings: WEB_TOOLS_SETTING_DEFINITIONS,
	});
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

export function readRawSetting(settingId: string, fallback?: string): string | undefined {
	return getSetting(WEB_TOOLS_EXTENSION_NAME, settingId, fallback);
}

export function getWebToolsSettings(): WebToolsSettings {
	const fetchDefaultFormat = parseEnumSetting(
		readRawSetting("fetchDefaultFormat", DEFAULTS.fetchDefaultFormat),
		FETCH_DEFAULT_FORMAT_VALUES,
		DEFAULTS.fetchDefaultFormat,
	);
	const fetchTimeoutSeconds = parseIntegerSetting(
		readRawSetting("fetchTimeoutSeconds", DEFAULTS.fetchTimeoutSeconds),
		Number.parseInt(DEFAULTS.fetchTimeoutSeconds, 10),
		{ min: 1, max: 120 },
	);
	const fetchMaxResponseMB = parseIntegerSetting(
		readRawSetting("fetchMaxResponseMB", DEFAULTS.fetchMaxResponseMB),
		Number.parseInt(DEFAULTS.fetchMaxResponseMB, 10),
		{ min: 1, max: 100 },
	);
	const fetchBlockPrivateHosts = parseOnOff(
		readRawSetting("fetchBlockPrivateHosts", DEFAULTS.fetchBlockPrivateHosts),
		DEFAULTS.fetchBlockPrivateHosts === "on",
	);
	const fetchMaxRedirects = parseIntegerSetting(
		readRawSetting("fetchMaxRedirects", DEFAULTS.fetchMaxRedirects),
		Number.parseInt(DEFAULTS.fetchMaxRedirects, 10),
		{ min: 0, max: 10 },
	);
	const fetchUserAgent = readRawSetting("fetchUserAgent", DEFAULTS.fetchUserAgent)?.trim() || DEFAULTS.fetchUserAgent;

	const searchEnabled = parseOnOff(readRawSetting("searchEnabled", DEFAULTS.searchEnabled), DEFAULTS.searchEnabled === "on");
	const searchProvider = parseEnumSetting(
		readRawSetting("searchProvider", DEFAULTS.searchProvider),
		SEARCH_PROVIDER_VALUES,
		DEFAULTS.searchProvider,
	);
	const searchEndpoint = readRawSetting("searchEndpoint", DEFAULTS.searchEndpoint)?.trim() || DEFAULTS.searchEndpoint;
	const searchTimeoutSeconds = parseIntegerSetting(
		readRawSetting("searchTimeoutSeconds", DEFAULTS.searchTimeoutSeconds),
		Number.parseInt(DEFAULTS.searchTimeoutSeconds, 10),
		{ min: 1, max: 120 },
	);
	const searchDefaultMaxResults = parseIntegerSetting(
		readRawSetting("searchDefaultMaxResults", DEFAULTS.searchDefaultMaxResults),
		Number.parseInt(DEFAULTS.searchDefaultMaxResults, 10),
		{ min: 1, max: 20 },
	);
	const searchDefaultDepth = parseEnumSetting(
		readRawSetting("searchDefaultDepth", DEFAULTS.searchDefaultDepth),
		SEARCH_DEFAULT_DEPTH_VALUES,
		DEFAULTS.searchDefaultDepth,
	);

	return {
		fetch: {
			defaultFormat: fetchDefaultFormat,
			timeoutSeconds: fetchTimeoutSeconds,
			maxResponseBytes: fetchMaxResponseMB * 1024 * 1024,
			blockPrivateHosts: fetchBlockPrivateHosts,
			maxRedirects: fetchMaxRedirects,
			userAgent: fetchUserAgent,
		},
		search: {
			enabled: searchEnabled,
			provider: searchProvider,
			endpoint: searchEndpoint,
			timeoutSeconds: searchTimeoutSeconds,
			defaultMaxResults: searchDefaultMaxResults,
			defaultDepth: searchDefaultDepth,
		},
	};
}
