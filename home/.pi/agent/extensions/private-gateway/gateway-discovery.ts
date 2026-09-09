import { Type, type Static } from "typebox";
import { Compile } from "typebox/compile";
import type { GatewayAccessToken } from "./gateway-auth.ts";
import { GatewayRequestError, parseGatewayRequestUrl, type GatewayHttp, type GatewayRequestUrl } from "./gateway-http.ts";
import type { GatewayProfile } from "./gateway-profile.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** Gateway route families supported by native Pi APIs. */
export const GATEWAY_BACKENDS = ["anthropic", "openai", "google", "xai", "workers-ai"] as const;
/** Known backend family, separate from a configured profile identity. */
export type GatewayBackend = typeof GATEWAY_BACKENDS[number];
const PositiveInteger = Type.Integer({ minimum: 1 });
const Cost = Type.Number({ minimum: 0 });
const Headers = Type.Record(Type.String(), Type.String());
const ThinkingValue = Type.Union([Type.String(), Type.Null()]);
const Compat = Type.Object({
	supportsStore: Type.Optional(Type.Boolean()),
	supportsDeveloperRole: Type.Optional(Type.Boolean()),
	supportsReasoningEffort: Type.Optional(Type.Boolean()),
	supportsUsageInStreaming: Type.Optional(Type.Boolean()),
	supportsStrictMode: Type.Optional(Type.Boolean()),
	supportsOpenAIGrammarTools: Type.Optional(Type.Boolean()),
	supportsToolSearch: Type.Optional(Type.Boolean()),
	supportsToolReferences: Type.Optional(Type.Boolean()),
	maxTokensField: Type.Optional(Type.Union([Type.Literal("max_tokens"), Type.Literal("max_completion_tokens")])),
	requiresToolResultName: Type.Optional(Type.Boolean()),
	requiresAssistantAfterToolResult: Type.Optional(Type.Boolean()),
	requiresThinkingAsText: Type.Optional(Type.Boolean()),
	requiresReasoningContentOnAssistantMessages: Type.Optional(Type.Boolean()),
	thinkingFormat: Type.Optional(Type.Union(["openai", "openrouter", "deepseek", "together", "zai", "qwen", "qwen-chat-template", "chat-template", "string-thinking", "ant-ling"].map((value) => Type.Literal(value)))),
	cacheControlFormat: Type.Optional(Type.Literal("anthropic")),
	sendSessionAffinityHeaders: Type.Optional(Type.Boolean()),
	supportsEagerToolInputStreaming: Type.Optional(Type.Boolean()),
	supportsCacheControlOnTools: Type.Optional(Type.Boolean()),
	forceAdaptiveThinking: Type.Optional(Type.Boolean()),
	allowEmptySignature: Type.Optional(Type.Boolean()),
	supportsStrictTools: Type.Optional(Type.Boolean()),
	supportsTemperature: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
const Metadata = Type.Object({
	id: Type.Optional(Type.String({ minLength: 1 })),
	name: Type.Optional(Type.String()),
	attachment: Type.Optional(Type.Boolean()),
	reasoning: Type.Optional(Type.Boolean()),
	modalities: Type.Optional(Type.Object({ input: Type.Optional(Type.Array(Type.String())) })),
	limit: Type.Optional(Type.Object({ context: Type.Optional(PositiveInteger), output: Type.Optional(PositiveInteger) })),
	cost: Type.Optional(Type.Object({ input: Type.Optional(Cost), output: Type.Optional(Cost), cache_read: Type.Optional(Cost), cache_write: Type.Optional(Cost) })),
	thinkingLevelMap: Type.Optional(Type.Object({
		off: Type.Optional(ThinkingValue), minimal: Type.Optional(ThinkingValue), low: Type.Optional(ThinkingValue),
		medium: Type.Optional(ThinkingValue), high: Type.Optional(ThinkingValue), xhigh: Type.Optional(ThinkingValue), max: Type.Optional(ThinkingValue),
	}, { additionalProperties: false })),
	compat: Type.Optional(Compat),
});
/** Parsed wire metadata; the catalog adapter alone translates this into Pi Model fields. */
export type GatewayModelMetadata = Static<typeof Metadata>;
const ProviderSchema = Type.Object({
	npm: Type.Optional(Type.String()),
	options: Type.Optional(Type.Object({ baseURL: Type.Optional(Type.String()), headers: Type.Optional(Headers) })),
	models: Type.Optional(Type.Record(Type.String(), Metadata)),
	whitelist: Type.Optional(Type.Array(Type.String())),
	blacklist: Type.Optional(Type.Array(Type.String())),
});
const ConfigSchema = Type.Object({
	enabled_providers: Type.Optional(Type.Array(Type.String())),
	provider: Type.Optional(Type.Record(Type.String(), ProviderSchema)),
});
const DocumentSchema = Type.Object({
	auth: Type.Optional(Type.Object({ env: Type.Optional(Type.String()) })),
	remote_config: Type.Optional(Type.Object({ url: Type.String(), headers: Type.Optional(Headers) })),
	config: Type.Optional(ConfigSchema),
	enabled_providers: Type.Optional(Type.Array(Type.String())),
	provider: Type.Optional(Type.Record(Type.String(), ProviderSchema)),
});
const documentValidator = Compile(DocumentSchema);
type WireDocument = Static<typeof DocumentSchema>;

/** Validated route configuration; model declarations are metadata overlays, whitelists restrict membership. */
export interface GatewayRoute {
	readonly backend: GatewayBackend;
	readonly baseUrl: GatewayRequestUrl;
	readonly headers: Readonly<Record<string, string>>;
	readonly models: Readonly<Record<string, GatewayModelMetadata>> | null;
	readonly include: readonly string[] | undefined;
	readonly exclude: readonly string[] | undefined;
}
/** Fully resolved, authenticated gateway configuration. */
export interface GatewayDiscovery { readonly routes: readonly GatewayRoute[]; readonly warnings?: readonly string[] }

/** Resolve a declared alias to the exact request ID used by both the catalog and selection UI. */
export function gatewayDeclaredRequestId(key: string, metadata: GatewayModelMetadata, backend: GatewayBackend): string {
	return metadata.id ?? (backend === "anthropic" ? key.replace(/^anthropic\//, "") : key);
}
const ROUTE_PATHS: Record<GatewayBackend, string> = {
	anthropic: "/anthropic", openai: "/openai", google: "/google-ai-studio/v1beta", xai: "/grok", "workers-ai": "/compat",
};
function backendName(value: string): GatewayBackend | undefined {
	return value === "cloudflare-workers-ai" ? "workers-ai" : GATEWAY_BACKENDS.find((backend) => backend === value);
}
function documentConfig(document: WireDocument): Static<typeof ConfigSchema> { return document.config ?? document; }
function safeRouteHeaders(headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
	return Object.fromEntries(Object.entries(headers).filter(([key, value]) =>
		!/(authorization|token|api[-_]key|cookie)/i.test(key) && !value.includes("{env:"),
	));
}

/** Implements the current OpenCode well-known wire contract without importing OpenCode credentials or code. */
export class HttpGatewayDiscovery {
	/** Share the bounded JSON transport with model inventory. */
	constructor(private readonly http: GatewayHttp) {}
	/** Resolve authenticated remote overrides before exposing any routes. */
	async loadDiscovery(profile: GatewayProfile, token: GatewayAccessToken, signal: AbortSignal): Promise<GatewayResult<GatewayDiscovery, GatewayRequestError>> {
		const bootstrap = parseGatewayRequestUrl(`${profile.authOrigin}/.well-known/opencode`, profile.authOrigin, "discovery");
		if (!bootstrap.ok) return bootstrap;
		const response = await this.http.getJson(bootstrap.value, "discovery", { signal });
		if (!response.ok) return response;
		if (!documentValidator.Check(response.value)) return gatewayFailure(new GatewayRequestError("document", "discovery"));
		const document = response.value;
		let remote: WireDocument | undefined;
		if (document.remote_config) {
			const url = parseGatewayRequestUrl(document.remote_config.url, profile.authOrigin, "remote-config");
			if (!url.ok) return url;
			const placeholder = `{env:${document.auth?.env ?? "TOKEN"}}`;
			const headers = Object.fromEntries(Object.entries(document.remote_config.headers ?? {}).map(([name, value]) => [name, value.replaceAll(placeholder, token.reveal())]));
			if (Object.values(headers).some((value) => value.includes("{env:"))) return gatewayFailure(new GatewayRequestError("document", "remote-config"));
			const fetched = await this.http.getJson(url.value, "remote-config", { signal, token, headers });
			if (!fetched.ok) return fetched;
			if (!documentValidator.Check(fetched.value)) return gatewayFailure(new GatewayRequestError("document", "remote-config"));
			remote = fetched.value;
		}
		const inline = documentConfig(document);
		const override = remote ? documentConfig(remote) : undefined;
		const enabled = override?.enabled_providers ?? inline.enabled_providers ?? [...GATEWAY_BACKENDS];
		const routes: GatewayRoute[] = [];
		const definitions = enabled.map((name) => {
			const base = inline.provider?.[name], next = override?.provider?.[name];
			const npm = next?.npm ?? base?.npm;
			// Named OpenCode providers declare their native protocol through an SDK package, never executable code.
			const backend = backendName(name) ?? (npm === "@ai-sdk/anthropic" ? "anthropic" : npm === "@ai-sdk/openai" ? "openai" : npm === "@ai-sdk/google" ? "google" : undefined);
			return { backend, base, next };
		});
		for (const backend of GATEWAY_BACKENDS) {
			const definitionsForBackend = definitions.filter((entry) => entry.backend === backend);
			if (!definitionsForBackend.length) continue;
			const configured = definitionsForBackend.filter((entry) => entry.base || entry.next);
			const urls = new Set(configured.flatMap(({ base, next }) => {
				const url = next?.options?.baseURL ?? base?.options?.baseURL;
				return url ? [url.replace(/\/$/, "")] : [];
			}));
			// Different transports must be separate profiles, not ambiguous routes sharing a request ID space.
			if (urls.size > 1) return gatewayFailure(new GatewayRequestError("document", "discovery"));
			const url = parseGatewayRequestUrl([...urls][0] ?? `${profile.inferenceOrigin}${ROUTE_PATHS[backend]}`, profile.inferenceOrigin, "model-list");
			if (!url.ok) return url;
			const models = Object.fromEntries(configured.flatMap(({ base, next }) => Object.entries({ ...base?.models, ...next?.models })));
			const allowlists = configured.map(({ base, next }) => next?.whitelist ?? base?.whitelist);
			routes.push({
				backend, baseUrl: url.value,
				headers: safeRouteHeaders(Object.fromEntries(configured.flatMap(({ base, next }) => Object.entries({ ...base?.options?.headers, ...next?.options?.headers })))),
				models: configured.some(({ base, next }) => base?.models !== undefined || next?.models !== undefined) ? models : null,
				include: allowlists.length && allowlists.every((list) => list !== undefined) ? [...new Set(allowlists.flatMap((list) => list ?? []))] : undefined,
				exclude: configured.flatMap(({ base, next }) => next?.blacklist ?? base?.blacklist ?? []),
			});
		}
		const unsupported = definitions.filter((entry) => entry.backend === undefined).length;
		return gatewaySuccess({ routes, warnings: unsupported ? [`${unsupported} enabled provider definitions have no supported native backend and were ignored`] : [] });
	}
}
