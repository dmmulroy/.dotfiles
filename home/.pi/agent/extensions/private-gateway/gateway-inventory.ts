import { Type } from "typebox";
import { Compile } from "typebox/compile";
import type { GatewayAccessToken } from "./gateway-auth.ts";
import { GATEWAY_BACKENDS, gatewayDeclaredRequestId, type GatewayBackend, type GatewayDiscovery, type GatewayModelMetadata, type GatewayRoute } from "./gateway-discovery.ts";
import { GatewayRequestError, parseGatewayRequestUrl, type GatewayHttp } from "./gateway-http.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** A live listed model, with backend identity and any authoritative capability metadata. */
export interface GatewayInventoryModel {
	readonly backend: GatewayBackend;
	readonly id: string;
	readonly name: string;
	readonly metadata: GatewayModelMetadata;
}
/** Failed listings are unknown; disabled routes and successful empty lists are distinct states. */
export type GatewayBackendInventory =
	| { readonly backend: GatewayBackend; readonly status: "listed"; readonly models: readonly GatewayInventoryModel[] }
	| { readonly backend: GatewayBackend; readonly status: "disabled" }
	| { readonly backend: GatewayBackend; readonly status: "unavailable"; readonly error: GatewayRequestError };
const CapabilitySchema = Type.Object({ supported: Type.Optional(Type.Boolean()) });
const RecordSchema = Type.Object({
	id: Type.Optional(Type.String({ minLength: 1 })), name: Type.Optional(Type.String({ minLength: 1 })),
	display_name: Type.Optional(Type.String()), displayName: Type.Optional(Type.String()),
	max_input_tokens: Type.Optional(Type.Integer({ minimum: 1 })), max_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
	inputTokenLimit: Type.Optional(Type.Integer({ minimum: 1 })), outputTokenLimit: Type.Optional(Type.Integer({ minimum: 1 })),
	capabilities: Type.Optional(Type.Object({
		image_input: Type.Optional(CapabilitySchema),
		thinking: Type.Optional(Type.Object({ ...CapabilitySchema.properties, types: Type.Optional(Type.Object({
			adaptive: Type.Optional(CapabilitySchema), enabled: Type.Optional(CapabilitySchema),
		})) })),
		effort: Type.Optional(Type.Object({ ...CapabilitySchema.properties,
			low: Type.Optional(CapabilitySchema), medium: Type.Optional(CapabilitySchema), high: Type.Optional(CapabilitySchema),
			xhigh: Type.Optional(CapabilitySchema), max: Type.Optional(CapabilitySchema),
		})),
	})),
});
const PageSchema = Type.Object({
	data: Type.Optional(Type.Array(RecordSchema)), models: Type.Optional(Type.Array(RecordSchema)),
	has_more: Type.Optional(Type.Boolean()), last_id: Type.Optional(Type.String()), nextPageToken: Type.Optional(Type.String()),
});
const pageValidator = Compile(PageSchema);
/** Model-list HTTP adapter that preserves unknown coverage instead of inventing exclusivity. */
export class HttpGatewayInventory {
	/** Share the same trusted JSON reader used by well-known discovery. */
	constructor(private readonly http: GatewayHttp) {}
	/** Follow Anthropic after_id and Google pageToken without following remote URLs. */
	async listRoute(route: GatewayRoute, token: GatewayAccessToken, signal: AbortSignal): Promise<Exclude<GatewayBackendInventory, { status: "disabled" }>> {
		const endpoint = new URL(`${route.baseUrl.replace(/\/$/, "")}${route.backend === "anthropic" ? "/v1/models" : "/models"}`);
		const models = new Map<string, GatewayInventoryModel>();
		const seen = new Set<string>();
		const headers = { ...route.headers };
		if (route.backend === "anthropic") headers["anthropic-version"] = "2023-06-01";
		for (let page = 0; page < 100; page += 1) {
			const url = parseGatewayRequestUrl(endpoint.toString(), new URL(route.baseUrl).origin, "model-list");
			if (!url.ok) return { backend: route.backend, status: "unavailable", error: url.error };
			const fetched = await this.http.getJson(url.value, "model-list", { token, signal, headers });
			if (!fetched.ok) return { backend: route.backend, status: "unavailable", error: fetched.error };
			const parsed = this.parsePage(fetched.value, route);
			if (!parsed.ok) return { backend: route.backend, status: "unavailable", error: parsed.error };
			for (const model of parsed.value.models) models.set(model.id, model);
			const cursor = parsed.value.cursor;
			if (!cursor) return { backend: route.backend, status: "listed", models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)) };
			if (seen.has(cursor.value)) break;
			seen.add(cursor.value);
			endpoint.searchParams.set(cursor.parameter, cursor.value);
		}
		return { backend: route.backend, status: "unavailable", error: new GatewayRequestError("pagination", "model-list") };
	}
	/** Disabled backends remain explicit so comparisons can distinguish absent routes from errors. */
	async listGateway(discovery: GatewayDiscovery, token: GatewayAccessToken, signal: AbortSignal, backend?: GatewayBackend): Promise<readonly GatewayBackendInventory[]> {
		return Promise.all((backend ? [backend] : GATEWAY_BACKENDS).map((backend): Promise<GatewayBackendInventory> => {
			const route = discovery.routes.find((route) => route.backend === backend);
			return route ? this.listRoute(route, token, signal) : Promise.resolve({ backend, status: "disabled" });
		}));
	}
	private parsePage(input: unknown, route: GatewayRoute): GatewayResult<{
		models: GatewayInventoryModel[];
		cursor?: { parameter: string; value: string };
	}, GatewayRequestError> {
		const backend = route.backend;
		if (!pageValidator.Check(input)) return gatewayFailure(new GatewayRequestError("document", "model-list"));
		const entries = backend === "google" ? input.models : input.data;
		if (!entries) return gatewayFailure(new GatewayRequestError("document", "model-list"));
		const models: GatewayInventoryModel[] = [];
		for (const entry of entries) {
			const raw = entry.id ?? entry.name;
			const id = backend === "google" ? raw?.replace(/^models\//, "") : raw;
			if (!id || /[\s\x00-\x1f\x7f]/.test(id)) return gatewayFailure(new GatewayRequestError("document", "model-list"));
			if (backend === "workers-ai" && new URL(route.baseUrl).pathname.endsWith("/compat") && !id.startsWith("workers-ai/")) continue;
			const name = entry.display_name ?? entry.displayName ?? id;
			const metadata: GatewayModelMetadata = { name };
			if (backend === "anthropic") {
				const capabilities = entry.capabilities;
				if (capabilities?.image_input?.supported) metadata.modalities = { input: ["text", "image"] };
				if (capabilities?.thinking !== undefined) metadata.reasoning = capabilities.thinking.supported === true;
				const types = capabilities?.thinking?.types;
				if (types?.adaptive?.supported && !types.enabled?.supported) metadata.compat = { forceAdaptiveThinking: true };
				if (capabilities?.effort?.supported) {
					metadata.thinkingLevelMap = { off: null, minimal: null };
					for (const level of ["low", "medium", "high", "xhigh", "max"] as const) metadata.thinkingLevelMap[level] = capabilities.effort[level]?.supported ? level : null;
				}
			}
			if (backend === "anthropic" || backend === "google") {
				const context = backend === "anthropic" ? entry.max_input_tokens : entry.inputTokenLimit;
				const output = backend === "anthropic" ? entry.max_tokens : entry.outputTokenLimit;
				metadata.limit = {};
				if (context !== undefined) metadata.limit.context = context;
				if (output !== undefined) metadata.limit.output = output;
			}
			models.push({ backend, id, name, metadata });
		}
		if (input.has_more) {
			if (backend !== "anthropic" || !input.last_id) return gatewayFailure(new GatewayRequestError("pagination", "model-list"));
			return gatewaySuccess({ models, cursor: { parameter: "after_id", value: input.last_id } });
		}
		if (input.nextPageToken) {
			if (backend !== "google") return gatewayFailure(new GatewayRequestError("pagination", "model-list"));
			return gatewaySuccess({ models, cursor: { parameter: "pageToken", value: input.nextPageToken } });
		}
		return gatewaySuccess({ models });
	}
}

/** Compare well-known declarations separately from live lists; aliases need not be advertised by /models. */
export function gatewayDeclaredInventory(discovery: GatewayDiscovery): readonly GatewayBackendInventory[] {
	return GATEWAY_BACKENDS.map((backend): GatewayBackendInventory => {
		const route = discovery.routes.find((route) => route.backend === backend);
		if (!route) return { backend, status: "disabled" };
		return { backend, status: "listed", models: Object.entries(route.models ?? {}).map(([key, metadata]) => {
			const id = gatewayDeclaredRequestId(key, metadata, backend);
			return { backend, id, name: metadata.name ?? id, metadata };
		}) };
	});
}

/** Model IDs are compared within a backend; differences over failed coverage are deliberately omitted. */
export interface GatewayModelDelta {
	readonly onlyFrom: readonly GatewayInventoryModel[];
	readonly onlyTo: readonly GatewayInventoryModel[];
	readonly shared: readonly GatewayInventoryModel[];
	readonly unknownBackends: readonly GatewayBackend[];
}
/** Compute a symmetric set delta without making claims about gateway policy or inference permission. */
export function diffGatewayInventories(from: readonly GatewayBackendInventory[], to: readonly GatewayBackendInventory[]): GatewayModelDelta {
	const onlyFrom: GatewayInventoryModel[] = [], onlyTo: GatewayInventoryModel[] = [], shared: GatewayInventoryModel[] = [];
	const unknownBackends: GatewayBackend[] = [];
	for (const backend of GATEWAY_BACKENDS) {
		const a = from.find((entry) => entry.backend === backend), b = to.find((entry) => entry.backend === backend);
		if (!a && !b) continue;
		if (!a || !b || a.status === "unavailable" || b.status === "unavailable") { unknownBackends.push(backend); continue; }
		const left = a.status === "listed" ? a.models : [], right = b.status === "listed" ? b.models : [];
		const leftIds = new Set(left.map((model) => model.id)), rightIds = new Set(right.map((model) => model.id));
		for (const model of left) (rightIds.has(model.id) ? shared : onlyFrom).push(model);
		for (const model of right) if (!leftIds.has(model.id)) onlyTo.push(model);
	}
	const sorted = (models: GatewayInventoryModel[]) => models.sort((a, b) => a.backend.localeCompare(b.backend) || a.id.localeCompare(b.id));
	return { onlyFrom: sorted(onlyFrom), onlyTo: sorted(onlyTo), shared: sorted(shared), unknownBackends };
}
