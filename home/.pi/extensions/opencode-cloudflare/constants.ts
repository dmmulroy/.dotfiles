export type Backend = "anthropic" | "openai" | "google" | "workers-ai";

export const PROVIDER_ID = "opencode.cloudflare.dev";
export const PROVIDER_NAME = "OpenCode Cloudflare";
export const CUSTOM_API = "opencode-cloudflare";

export const GATEWAY_ORIGIN = "https://opencode.cloudflare.dev";
export const WELL_KNOWN_PATH = "/.well-known/opencode";
export const WELL_KNOWN_URL = `${GATEWAY_ORIGIN}${WELL_KNOWN_PATH}`;

export const OPENCODE_AUTH_FILE_ENV = "OPENCODE_CLOUDFLARE_AUTH_FILE";
export const TOKEN_ENV_OVERRIDE = "OPENCODE_CLOUDFLARE_TOKEN";
export const DEFAULT_TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000;
export const EXPIRY_SAFETY_BUFFER_MS = 5 * 60 * 1000;
export const WELL_KNOWN_CACHE_TTL_MS = 60 * 1000;

export const DEFAULT_ROUTE_URLS: Record<Backend, string> = {
	anthropic: `${GATEWAY_ORIGIN}/anthropic`,
	openai: `${GATEWAY_ORIGIN}/openai`,
	google: `${GATEWAY_ORIGIN}/google-ai-studio/v1beta`,
	"workers-ai": `${GATEWAY_ORIGIN}/compat`,
};

export const DEFAULT_ROUTE_HEADERS: Record<Backend, Record<string, string>> = {
	anthropic: {
		"cf-access-token": "{env:TOKEN}",
		"X-Requested-With": "xmlhttprequest",
		"anthropic-beta": "context-1m-2025-08-07",
	},
	openai: {
		"cf-access-token": "{env:TOKEN}",
		"X-Requested-With": "xmlhttprequest",
	},
	google: {
		"cf-access-token": "{env:TOKEN}",
		"X-Requested-With": "xmlhttprequest",
	},
	"workers-ai": {
		"cf-access-token": "{env:TOKEN}",
		"X-Requested-With": "xmlhttprequest",
	},
};

export const ENABLED_BACKENDS: Backend[] = ["anthropic", "openai", "google", "workers-ai"];
