/** Gateway backend identifiers supported by the work gateway. */
export const BACKENDS = ["anthropic", "openai", "google", "xai", "workers-ai"] as const;

/** Gateway backend identifier. */
export type Backend = (typeof BACKENDS)[number];

/** Pi provider identifier registered by the extension. */
export const PROVIDER_ID = "opencode.cloudflare.dev";

/** Human-readable provider name. */
export const PROVIDER_NAME = "OpenCode Cloudflare";

/** Trusted OpenCode authentication and discovery origin. */
export const AUTH_ORIGIN = "https://opencode.cloudflare.dev";

/** Trusted AI Gateway inference origin. */
export const GATEWAY_ORIGIN = "https://gateway.opencode.cloudflare.dev";

/** Gateway discovery document path. */
export const WELL_KNOWN_PATH = "/.well-known/opencode";

/** Gateway discovery document URL. */
export const WELL_KNOWN_URL = `${AUTH_ORIGIN}${WELL_KNOWN_PATH}`;

/** Environment variable overriding the OpenCode auth file path. */
export const OPENCODE_AUTH_FILE_ENV = "OPENCODE_CLOUDFLARE_AUTH_FILE";

/** Environment variable supplying an explicit gateway token. */
export const TOKEN_ENV_OVERRIDE = "OPENCODE_CLOUDFLARE_TOKEN";

/** Fallback lifetime for opaque tokens without a JWT expiry. */
export const DEFAULT_TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000;

/** Safety margin subtracted from JWT expiry timestamps. */
export const EXPIRY_SAFETY_BUFFER_MS = 5 * 60 * 1000;

/** Discovery and remote-config request timeout. */
export const DISCOVERY_TIMEOUT_MS = 10_000;

/** Backend URLs used when the discovery document omits a route. */
export const DEFAULT_ROUTE_URLS: Readonly<Record<Backend, string>> = {
	anthropic: `${GATEWAY_ORIGIN}/anthropic`,
	openai: `${GATEWAY_ORIGIN}/openai`,
	google: `${GATEWAY_ORIGIN}/google-ai-studio/v1beta`,
	xai: `${GATEWAY_ORIGIN}/grok`,
	"workers-ai": `${GATEWAY_ORIGIN}/compat`,
};
