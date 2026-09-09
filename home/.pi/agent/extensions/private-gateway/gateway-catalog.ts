import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { GatewayAccessToken } from "./gateway-auth.ts";
import type { GatewayApi } from "./gateway-api.ts";
import { gatewayDeclaredRequestId, type GatewayBackend, type GatewayDiscovery, type GatewayModelMetadata, type GatewayRoute } from "./gateway-discovery.ts";
import { GatewayRequestError } from "./gateway-http.ts";
import type { HttpGatewayInventory } from "./gateway-inventory.ts";
import type { GatewayProfile } from "./gateway-profile.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** Projection failures omit private model IDs from diagnostic text. */
export class GatewayCatalogError extends Error {
	readonly _tag = "GatewayCatalogError" as const;
	/** Conflicting IDs and missing declared capabilities must not silently become guessed models. */
	constructor(readonly reason: "duplicate-id" | "metadata", readonly backend: GatewayBackend) {
		super(`Private gateway catalog: ${backend}: ${reason}`);
	}
}
/** A raw Pi catalog before local visibility filters, with bounded non-sensitive diagnostic warnings. */
export interface GatewayCatalog {
	readonly models: readonly Model<GatewayApi>[];
	readonly warnings: readonly string[];
}

const DEFAULT_APIS: Record<GatewayBackend, GatewayApi> = {
	anthropic: "anthropic-messages", openai: "openai-responses", google: "google-generative-ai", xai: "openai-completions", "workers-ai": "openai-completions",
};
function supportedApi(api: Api): api is GatewayApi { return api === "anthropic-messages" || api === "openai-responses" || api === "openai-completions" || api === "google-generative-ai"; }
function builtins(backend: GatewayBackend): readonly Model<Api>[] {
	return backend === "workers-ai" ? getBuiltinModels("cloudflare-ai-gateway").filter((model) => model.id.startsWith("workers-ai/")) : getBuiltinModels(backend);
}
function routeAllows(route: GatewayRoute, id: string, key: string): boolean {
	return (route.include === undefined || route.include.includes(id) || route.include.includes(key)) && !route.exclude?.some((value) => value === id || value === key);
}

function projectModel(profile: GatewayProfile, route: GatewayRoute, id: string, metadata: GatewayModelMetadata, builtin: Model<Api> | undefined): Model<GatewayApi> | undefined {
	const contextWindow = metadata.limit?.context ?? builtin?.contextWindow;
	const maxTokens = metadata.limit?.output ?? builtin?.maxTokens;
	if (!contextWindow || !maxTokens) return undefined;
	const input: ("text" | "image")[] = metadata.modalities?.input
		? metadata.modalities.input.filter((value): value is "text" | "image" => value === "text" || value === "image")
		: metadata.attachment !== undefined ? metadata.attachment ? ["text", "image"] : ["text"] : builtin?.input ?? ["text"];
	const thinkingLevelMap = metadata.thinkingLevelMap ?? builtin?.thinkingLevelMap;
	return {
		...(builtin ?? {}),
		id, name: metadata.name ?? builtin?.name ?? id,
		provider: profile.id, api: builtin && supportedApi(builtin.api) ? builtin.api : DEFAULT_APIS[route.backend],
		baseUrl: route.baseUrl,
		input: input.length ? input : ["text"], reasoning: metadata.reasoning ?? builtin?.reasoning ?? false,
		contextWindow, maxTokens,
		cost: {
			...builtin?.cost,
			input: metadata.cost?.input ?? builtin?.cost.input ?? 0,
			output: metadata.cost?.output ?? builtin?.cost.output ?? 0,
			cacheRead: metadata.cost?.cache_read ?? builtin?.cost.cacheRead ?? 0,
			cacheWrite: metadata.cost?.cache_write ?? builtin?.cost.cacheWrite ?? 0,
		},
		headers: { ...route.headers },
		...(thinkingLevelMap ? { thinkingLevelMap } : {}),
		compat: {
			...(route.backend === "workers-ai" ? { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" as const } : {}),
			...builtin?.compat,
			...metadata.compat,
		},
	};
}

/** Projects server membership onto Pi metadata; never promotes a failed listing to an empty catalog. */
export class NativeGatewayCatalog {
	/** Inventory is reusable independently by the model editor and CLI. */
	constructor(private readonly inventory: HttpGatewayInventory) {}
	/** Server whitelists restrict membership; model declarations supply overrides and explicit aliases. */
	async loadCatalog(profile: GatewayProfile, discovery: GatewayDiscovery, token: GatewayAccessToken, signal: AbortSignal): Promise<GatewayResult<GatewayCatalog, GatewayRequestError | GatewayCatalogError>> {
		const models: Model<GatewayApi>[] = [];
		const warnings: string[] = [...discovery.warnings ?? []];
		const seen = new Set<string>();
		const requested = profile.models.include;
		const prepared = discovery.routes.map((route) => {
			const catalog = new Map(builtins(route.backend).map((model) => [model.id, model]));
			const declarations = new Map(Object.entries(route.models ?? {}).map(([key, metadata]) => [key, {
				key, metadata, id: gatewayDeclaredRequestId(key, metadata, route.backend),
			}]));
			const byRequestId = new Map<string, (typeof declarations extends Map<string, infer Entry> ? Entry : never)[]>();
			for (const entry of declarations.values()) byRequestId.set(entry.id, [...byRequestId.get(entry.id) ?? [], entry]);
			return { route, catalog, declarations, byRequestId, knownIds: new Set([...catalog.keys(), ...byRequestId.keys()]) };
		});
		const allKnownIds = new Set(prepared.flatMap(({ knownIds }) => [...knownIds]));
		const hasUnknownRequest = requested?.some((id) => !allKnownIds.has(id)) ?? false;
		for (const { route, catalog, declarations, byRequestId, knownIds } of prepared) {
			// An explicit allowlist must not depend on unrelated, unauthorized gateway backends.
			if (requested && !hasUnknownRequest && !requested.some((id) => knownIds.has(id))) continue;
			if (signal.aborted) return gatewayFailure(new GatewayRequestError("cancelled", "model-list"));
			const entries = new Map<string, { key: string; metadata: GatewayModelMetadata }>();
			if (route.include !== undefined) {
				for (const id of route.include) {
					const resolved = byRequestId.get(id) ?? [];
					if (!declarations.has(id) && resolved.length > 1) return gatewayFailure(new GatewayCatalogError("duplicate-id", route.backend));
					const entry = declarations.get(id) ?? resolved[0] ?? { id, key: id, metadata: {} };
					if (entries.has(entry.id) && entries.get(entry.id)?.key !== entry.key) return gatewayFailure(new GatewayCatalogError("duplicate-id", route.backend));
					entries.set(entry.id, entry);
				}
			} else {
				const listed = await this.inventory.listRoute(route, token, signal);
				if (listed.status === "listed") {
					for (const model of listed.models) entries.set(model.id, { key: model.id, metadata: model.metadata });
				} else if (listed.error.reason === "http" && [404, 405, 501].includes(listed.error.status ?? 0)) {
					for (const id of catalog.keys()) entries.set(id, { key: id, metadata: {} });
					warnings.push(`${route.backend}: model-list unsupported; using filtered Pi built-ins`);
				} else return gatewayFailure(listed.error);
				const merged = new Set<string>();
				for (const { id, key, metadata } of declarations.values()) {
					if (!routeAllows(route, id, key)) continue;
					if (merged.has(id)) return gatewayFailure(new GatewayCatalogError("duplicate-id", route.backend));
					merged.add(id);
					const live = entries.get(id)?.metadata;
					entries.set(id, { key, metadata: {
						...live, ...metadata, limit: { ...live?.limit, ...metadata.limit }, compat: { ...live?.compat, ...metadata.compat },
					} });
				}
			}
			let skipped = 0;
			for (const [id, { key, metadata }] of entries) {
				if (!id || /[\s\x00-\x1f\x7f]/.test(id)) return gatewayFailure(new GatewayCatalogError("metadata", route.backend));
				if (!routeAllows(route, id, key)) continue;
				const builtin = catalog.get(id) ?? catalog.get(key);
				const model = projectModel(profile, route, id, metadata, builtin);
				if (!model) {
					if (profile.models.include?.includes(id)) return gatewayFailure(new GatewayCatalogError("metadata", route.backend));
					skipped += 1;
					continue;
				}
				if (seen.has(id)) return gatewayFailure(new GatewayCatalogError("duplicate-id", route.backend));
				seen.add(id);
				models.push(model);
			}
			if (skipped) warnings.push(`${route.backend}: ${skipped} listed IDs lack Pi or gateway token-limit metadata; not exposed for inference`);
		}
		return gatewaySuccess({ models, warnings });
	}
}
