import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	hasApi,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamSimple as streamSimpleByApi } from "@earendil-works/pi-ai/compat";
import type { GatewayAuthService, GatewayToken } from "./auth.ts";
import type { CatalogService, ReasoningContext, ResponseVerbosity, RouteDescriptor } from "./catalog.ts";
import { PROVIDER_ID, TOKEN_ENV_OVERRIDE } from "./constants.ts";
import { Redacted } from "./redacted.ts";

const GOOGLE_GATEWAY_API_KEY_SENTINEL = "gateway-authenticated";
type ProviderHeaders = Record<string, string | null>;

interface GatewayStructuredError {
	readonly error?: string;
	readonly message?: string;
	readonly status?: number;
}

/** Dependencies required by the custom Pi stream adapter. */
export interface GatewayStreamDependencies {
	readonly auth: GatewayAuthService;
	readonly catalog: CatalogService;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return input !== null && typeof input === "object" && !Array.isArray(input);
}

function errorText(error: unknown, secrets: readonly GatewayToken[]): string {
	let text = Error.isError(error) ? error.message : String(error);
	for (const secret of secrets) {
		const value = Redacted.value(secret);
		if (value) text = text.replaceAll(value, String(secret));
	}
	return text.length <= 2048 ? text : `${text.slice(0, 2048)}…`;
}

function parseStructuredErrorCandidate(input: string): GatewayStructuredError | undefined {
	try {
		const decoded: unknown = JSON.parse(input);
		if (!isRecord(decoded)) return undefined;
		const error = typeof decoded.error === "string" ? decoded.error : undefined;
		const message = typeof decoded.message === "string" ? decoded.message : undefined;
		const status = typeof decoded.status === "number" && Number.isFinite(decoded.status) ? decoded.status : undefined;
		return error || message || status !== undefined ? { error, message, status } : undefined;
	} catch {
		return undefined;
	}
}

function parseGatewayStructuredError(error: unknown, secrets: readonly GatewayToken[]): GatewayStructuredError | undefined {
	const text = errorText(error, secrets).trim();
	const direct = parseStructuredErrorCandidate(text);
	if (direct) return direct;
	const objectStart = text.indexOf("{");
	const objectEnd = text.lastIndexOf("}");
	return objectStart >= 0 && objectEnd > objectStart
		? parseStructuredErrorCandidate(text.slice(objectStart, objectEnd + 1))
		: undefined;
}

/**
 * Translate gateway failures into actionable, safe messages.
 *
 * @param error - Unknown provider or transport failure.
 * @param secrets - Redacted secrets to remove if the upstream error reflects them.
 * @returns User-facing error message.
 */
export function formatGatewayErrorMessage(error: unknown, secrets: readonly GatewayToken[] = []): string {
	const structured = parseGatewayStructuredError(error, secrets);
	if (!structured) return errorText(error, secrets);
	const backendMessage = structured.message ?? structured.error ?? "Gateway request failed";
	const label = structured.error ?? "Gateway Error";
	const detail = `${structured.status === undefined ? "" : `${structured.status} `}${label}: ${backendMessage}`;
	if (structured.status === 401 || structured.error === "Unauthorized") {
		return `OpenCode Cloudflare rejected the Access token (${detail}). Refresh OpenCode auth, then run /login ${PROVIDER_ID}.`;
	}
	if (structured.error === "Configuration Error" || backendMessage === "API key not configured") {
		return `OpenCode Cloudflare is misconfigured (${detail}). The gateway service owner needs to restore its upstream API key.`;
	}
	if (structured.status !== undefined && structured.status >= 500) {
		return `OpenCode Cloudflare returned a server error (${detail}). Retry shortly; if it persists, run /opencode-cf-doctor.`;
	}
	return detail;
}

function normalizeAssistantMessage(
	message: AssistantMessage,
	visibleModel: Model<Api>,
	secrets: readonly GatewayToken[],
): AssistantMessage {
	return {
		...message,
		provider: visibleModel.provider,
		model: visibleModel.id,
		...(message.errorMessage ? { errorMessage: formatGatewayErrorMessage(message.errorMessage, secrets) } : {}),
	};
}

function normalizeEvent(
	event: AssistantMessageEvent,
	visibleModel: Model<Api>,
	secrets: readonly GatewayToken[],
): AssistantMessageEvent {
	switch (event.type) {
		case "done":
			return { ...event, message: normalizeAssistantMessage(event.message, visibleModel, secrets) };
		case "error":
			return { ...event, error: normalizeAssistantMessage(event.error, visibleModel, secrets) };
		case "start":
		case "text_start":
		case "text_delta":
		case "text_end":
		case "thinking_start":
		case "thinking_delta":
		case "thinking_end":
		case "toolcall_start":
		case "toolcall_delta":
		case "toolcall_end":
			return { ...event, partial: normalizeAssistantMessage(event.partial, visibleModel, secrets) };
	}
}

function createErrorMessage(model: Model<Api>, error: unknown, api: Api, secrets: readonly GatewayToken[]): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		errorMessage: formatGatewayErrorMessage(error, secrets),
		timestamp: Date.now(),
	};
}

function resolveHeaders(
	headers: Readonly<Record<string, string>>,
	authEnv: string,
	token: GatewayToken,
): Record<string, string> {
	const value = Redacted.value(token);
	const escapedAuthEnv = authEnv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const placeholder = new RegExp(`\\{env:${escapedAuthEnv}\\}`, "g");
	const resolved = Object.fromEntries(Object.entries(headers).map(([name, header]) => [name, header.replace(placeholder, value)]));
	return {
		...resolved,
		...(resolved["cf-access-token"] ? {} : { "cf-access-token": value }),
		...(resolved["X-Requested-With"] ? {} : { "X-Requested-With": "xmlhttprequest" }),
	};
}

function buildDelegatedModel(
	visibleModel: Model<Api>,
	route: RouteDescriptor,
	baseUrl: string,
	headers: Record<string, string>,
): Model<Api> {
	return {
		...visibleModel,
		id: route.requestModelId ?? visibleModel.id,
		api: route.api,
		baseUrl,
		headers,
		compat: route.compat,
	};
}

function mergeHeaders(...sources: readonly (ProviderHeaders | Readonly<Record<string, string>> | undefined)[]): ProviderHeaders {
	const merged: ProviderHeaders = {};
	for (const source of sources) {
		for (const [name, value] of Object.entries(source ?? {})) merged[name] = value;
	}
	return merged;
}

function applyOpenAIResponsesPayloadOptions(
	payload: unknown,
	options: { readonly responseVerbosity?: ResponseVerbosity; readonly reasoningContext?: ReasoningContext },
): unknown {
	if (!isRecord(payload)) return payload;
	let body = payload;
	if (options.responseVerbosity) {
		const text = isRecord(body.text) ? body.text : {};
		body = { ...body, text: { ...text, verbosity: options.responseVerbosity } };
	}
	if (options.reasoningContext) {
		const reasoning = isRecord(body.reasoning) ? body.reasoning : {};
		body = { ...body, reasoning: { ...reasoning, context: options.reasoningContext } };
	}
	return body;
}

function applyRouteOptions(options: SimpleStreamOptions, route: RouteDescriptor): SimpleStreamOptions {
	if (route.backend !== "openai" || (!route.responseVerbosity && !route.reasoningContext)) return options;
	const onPayload = options.onPayload;
	return {
		...options,
		onPayload: async (payload, model) => {
			const configured = applyOpenAIResponsesPayloadOptions(payload, route);
			return (await onPayload?.(configured, model)) ?? configured;
		},
	};
}

function createDelegatedStream(
	model: Model<Api>,
	route: RouteDescriptor,
	context: Context,
	options: SimpleStreamOptions,
	token: GatewayToken,
): AssistantMessageEventStream {
	const value = Redacted.value(token);
	switch (route.backend) {
		case "anthropic":
			if (!hasApi(model, "anthropic-messages")) throw new Error("Anthropic route produced an invalid delegated model");
			return streamSimpleByApi(model, context, {
				...options,
				apiKey: undefined,
				headers: mergeHeaders(options.headers, {
					Authorization: `Bearer ${value}`,
					"x-api-key": null,
				}),
			});
		case "google":
			if (!hasApi(model, "google-generative-ai")) throw new Error("Google route produced an invalid delegated model");
			return streamSimpleByApi(model, context, {
				...options,
				apiKey: GOOGLE_GATEWAY_API_KEY_SENTINEL,
				headers: mergeHeaders(options.headers, { Authorization: `Bearer ${value}` }),
			});
		case "openai":
			if (!hasApi(model, "openai-responses")) throw new Error("OpenAI route produced an invalid delegated model");
			return streamSimpleByApi(model, context, { ...options, apiKey: value });
		case "xai":
			if (!hasApi(model, "openai-completions")) throw new Error("xAI route produced an invalid delegated model");
			return streamSimpleByApi(model, context, { ...options, apiKey: value });
		case "workers-ai":
			if (!hasApi(model, "openai-completions")) throw new Error("Workers AI route produced an invalid delegated model");
			return streamSimpleByApi(model, context, { ...options, apiKey: value });
	}
}

/**
 * Create the custom Pi stream function for one extension runtime.
 *
 * @param dependencies - Auth and atomic catalog services.
 * @returns Pi-compatible simple stream function.
 */
export function createGatewayStream(dependencies: GatewayStreamDependencies) {
	return (model: Model<Api>, context: Context, options: SimpleStreamOptions = {}): AssistantMessageEventStream => {
		const stream = createAssistantMessageEventStream();
		void (async () => {
			let route: RouteDescriptor | undefined;
			let token: GatewayToken | undefined;
			try {
				const resolvedRoute = await dependencies.catalog.resolveRoute(model.id, options.signal);
				if (!resolvedRoute.ok) throw resolvedRoute.error;
				route = resolvedRoute.value.route;
				const config = resolvedRoute.value.config;

				const resolvedToken = dependencies.auth.resolveToken(options.apiKey);
				if (!resolvedToken.ok) throw resolvedToken.error;
				if (!resolvedToken.value) {
					throw new Error(
						`No token available for ${PROVIDER_ID}. Run /login ${PROVIDER_ID}, set ${TOKEN_ENV_OVERRIDE}, or import OpenCode auth by logging in there and then running /login ${PROVIDER_ID}.`,
					);
				}
				token = resolvedToken.value;
				const latestRoute = config.routes[route.backend];
				const headers = resolveHeaders(latestRoute.headers, config.authEnv, token);
				const delegatedModel = buildDelegatedModel(model, route, latestRoute.baseUrl, headers);
				const delegatedOptions = applyRouteOptions(options, route);
				for await (const event of createDelegatedStream(delegatedModel, route, context, delegatedOptions, token)) {
					stream.push(normalizeEvent(event, model, [token]));
				}
				stream.end();
			} catch (error) {
				const aborted = options.signal?.aborted === true;
				stream.push({
					type: "error",
					reason: aborted ? "aborted" : "error",
					error: {
						...createErrorMessage(model, error, route?.api ?? model.api, token ? [token] : []),
						stopReason: aborted ? "aborted" : "error",
					},
				});
				stream.end();
			}
		})();
		return stream;
	};
}
