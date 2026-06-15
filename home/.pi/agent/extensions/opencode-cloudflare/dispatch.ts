import Anthropic from "@anthropic-ai/sdk";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	stream as streamByApi,
	streamSimpleOpenAICompletions,
	streamSimpleOpenAIResponses,
	type Model,
	type SimpleStreamOptions,
	type AnthropicOptions,
} from "@earendil-works/pi-ai";
import { getCatalog, refreshCatalog, type ReasoningContext, type ResponseVerbosity, type RouteDescriptor } from "./catalog.ts";
import { PROVIDER_ID, TOKEN_ENV_OVERRIDE } from "./constants.ts";
import { resolveGatewayToken } from "./auth.ts";
import { applyGatewayToken, getGatewayConfig } from "./wellknown.ts";

interface GatewayStructuredError {
	error?: string;
	message?: string;
	status?: number;
}

function getErrorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parseGatewayStructuredError(error: unknown): GatewayStructuredError | undefined {
	const text = getErrorText(error).trim();
	const candidates = [text];
	const objectStart = text.indexOf("{");
	const objectEnd = text.lastIndexOf("}");
	if (objectStart !== -1 && objectEnd > objectStart) {
		candidates.push(text.slice(objectStart, objectEnd + 1));
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate) as GatewayStructuredError;
			if (!parsed || typeof parsed !== "object") continue;
			if (typeof parsed.message !== "string" && typeof parsed.error !== "string" && typeof parsed.status !== "number") continue;
			return parsed;
		} catch {
			// SDKs often prefix HTTP status text before the JSON body; try the next slice.
		}
	}
	return undefined;
}

function formatGatewayErrorMessage(error: unknown): string {
	const raw = getErrorText(error);
	const structured = parseGatewayStructuredError(error);
	if (!structured) return raw;

	const status = typeof structured.status === "number" ? structured.status : undefined;
	const backendMessage = structured.message || structured.error || "Gateway request failed";
	const detail = `${status ? `${status} ` : ""}${structured.error || "Gateway Error"}: ${backendMessage}`;

	if (status === 401 || structured.error === "Unauthorized") {
		return `OpenCode Cloudflare rejected the Access token (${detail}). Run /login ${PROVIDER_ID}, or refresh OpenCode auth and run /opencode-cf-sync-auth.`;
	}
	if (structured.error === "Configuration Error" || backendMessage === "API key not configured") {
		return `OpenCode Cloudflare is misconfigured (${detail}). The gateway service owner needs to restore its AI Gateway API key.`;
	}
	if (status !== undefined && status >= 500) {
		return `OpenCode Cloudflare returned a server error (${detail}). Retry shortly; if it persists, run /opencode-cf-doctor.`;
	}
	return detail;
}

/**
 * Normalize assistant message metadata for display.
 * 
 * IMPORTANT: We preserve message.api from the delegated stream (e.g., "openai-responses")
 * rather than overwriting with the visible model's custom API ("opencode-cloudflare").
 * Pi's thinking block visibility logic gates on known API types, so preserving the real
 * API ensures thinking traces respect the user's visibility settings.
 */
function normalizeAssistantMessage(message: AssistantMessage, visibleModel: Model<Api>): AssistantMessage {
	return {
		...message,
		...(message.errorMessage ? { errorMessage: formatGatewayErrorMessage(message.errorMessage) } : {}),
		// Preserve message.api from delegated stream - do NOT overwrite with visibleModel.api
		provider: visibleModel.provider,
		model: visibleModel.id,
	};
}

function normalizeEvent(event: AssistantMessageEvent, visibleModel: Model<Api>): AssistantMessageEvent {
	switch (event.type) {
		case "done":
			return { ...event, message: normalizeAssistantMessage(event.message, visibleModel) };
		case "error":
			return { ...event, error: normalizeAssistantMessage(event.error, visibleModel) };
		default:
			return { ...event, partial: normalizeAssistantMessage(event.partial, visibleModel) };
	}
}

/**
 * Create an error message with the real API type from the route.
 * Uses routeApi parameter to ensure errors have correct API for pi's handling.
 */
function createErrorMessage(model: Model<Api>, error: unknown, routeApi?: Api): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: routeApi || model.api,
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
		errorMessage: formatGatewayErrorMessage(error),
		timestamp: Date.now(),
	};
}

function buildDelegatedModel(
	visibleModel: Model<Api>,
	route: RouteDescriptor,
	headers: Record<string, string>,
	baseUrl: string,
): Model<Api> {
	return {
		...visibleModel,
		id: route.requestModelId || visibleModel.id,
		api: route.api,
		baseUrl,
		headers,
		compat: route.compat,
	};
}

function mergeHeaders(...sources: Array<Record<string, string | null | undefined> | undefined>): Record<string, string | null> {
	const merged: Record<string, string | null> = {};
	for (const source of sources) {
		for (const [key, value] of Object.entries(source || {})) {
			if (value !== undefined) merged[key] = value;
		}
	}
	return merged;
}

function supportsAdaptiveThinking(model: Model<Api>): boolean {
	const forced = (model.compat as { forceAdaptiveThinking?: boolean } | undefined)?.forceAdaptiveThinking;
	if (forced !== undefined) return forced;
	return model.id.includes("opus-4-6") || model.id.includes("opus-4.6") ||
		model.id.includes("opus-4-7") || model.id.includes("opus-4.7") ||
		model.id.includes("opus-4-8") || model.id.includes("opus-4.8") ||
		model.id.includes("sonnet-4-6") || model.id.includes("sonnet-4.6");
}

function mapThinkingLevelToEffort(model: Model<Api>, level: SimpleStreamOptions["reasoning"]): AnthropicOptions["effort"] {
	const mapped = level ? model.thinkingLevelMap?.[level] : undefined;
	if (typeof mapped === "string") return mapped as AnthropicOptions["effort"];
	switch (level) {
		case "minimal":
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
		default:
			return "high";
	}
}

function adjustMaxTokensForThinking(baseMaxTokens: number, modelMaxTokens: number, reasoningLevel: NonNullable<SimpleStreamOptions["reasoning"]>, customBudgets?: SimpleStreamOptions["thinkingBudgets"]): { maxTokens: number; thinkingBudget: number } {
	const budgets = { minimal: 1024, low: 2048, medium: 8192, high: 16384, ...customBudgets };
	const level = reasoningLevel === "xhigh" ? "high" : reasoningLevel;
	let thinkingBudget = budgets[level] || 1024;
	const maxTokens = Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);
	if (maxTokens <= thinkingBudget) {
		thinkingBudget = Math.max(0, maxTokens - 1024);
	}
	return { maxTokens, thinkingBudget };
}

function rewriteAnthropicAdaptiveThinkingPayload(payload: unknown, effort: AnthropicOptions["effort"]): unknown {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	const body = payload as Record<string, unknown>;
	const existingThinking = body.thinking && typeof body.thinking === "object" && !Array.isArray(body.thinking)
		? body.thinking as Record<string, unknown>
		: {};
	const display = typeof existingThinking.display === "string" ? existingThinking.display : "summarized";
	return {
		...body,
		thinking: { type: "adaptive", display },
		...(effort ? { output_config: { ...(body.output_config && typeof body.output_config === "object" && !Array.isArray(body.output_config) ? body.output_config : {}), effort } } : {}),
	};
}

function buildAnthropicOptions(model: Model<Api>, options: SimpleStreamOptions | undefined, token: string, client: Anthropic): AnthropicOptions {
	const base: AnthropicOptions = {
		temperature: options?.temperature,
		maxTokens: options?.maxTokens ?? (model.maxTokens > 0 ? Math.min(model.maxTokens, 32000) : undefined),
		signal: options?.signal,
		apiKey: token,
		transport: options?.transport,
		cacheRetention: options?.cacheRetention,
		sessionId: options?.sessionId,
		headers: options?.headers,
		onPayload: options?.onPayload,
		onResponse: options?.onResponse,
		timeoutMs: options?.timeoutMs,
		maxRetries: options?.maxRetries,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		metadata: options?.metadata,
		// The extension imports the same SDK version as pi-ai, but TypeScript can
		// still see two physical module paths under npm's install layout. Cast the
		// client through AnthropicOptions so runtime construction stays explicit
		// without reintroducing provider-specific auth hacks.
		client: client as unknown as AnthropicOptions["client"],
	};
	if (!options?.reasoning) return { ...base, thinkingEnabled: false };
	if (supportsAdaptiveThinking(model)) {
		const effort = mapThinkingLevelToEffort(model, options.reasoning);
		const onPayload = async (payload: unknown, payloadModel: Model<Api>) => {
			const rewritten = rewriteAnthropicAdaptiveThinkingPayload(payload, effort);
			return (await options.onPayload?.(rewritten, payloadModel)) ?? rewritten;
		};
		return { ...base, thinkingEnabled: true, effort, onPayload };
	}
	const adjusted = adjustMaxTokensForThinking(base.maxTokens || 0, model.maxTokens, options.reasoning, options.thinkingBudgets);
	return { ...base, maxTokens: adjusted.maxTokens, thinkingEnabled: true, thinkingBudgetTokens: adjusted.thinkingBudget };
}

// Use stream() from the main pi-ai entry (available as a jiti virtual module)
// instead of importing streamAnthropic from the "/anthropic" subpath, which is
// NOT registered in pi's virtual modules map and fails jiti filesystem fallback.
// stream() dispatches via the API provider registry; for "anthropic-messages" it
// lazy-loads the real streamAnthropic which accepts AnthropicOptions.client.
function streamAnthropicViaGateway(model: Model<Api>, context: Context, options: SimpleStreamOptions | undefined, token: string): AssistantMessageEventStream {
	const client = new Anthropic({
		apiKey: null,
		authToken: token,
		baseURL: model.baseUrl,
		dangerouslyAllowBrowser: true,
		defaultHeaders: mergeHeaders({
			accept: "application/json",
			"anthropic-dangerous-direct-browser-access": "true",
			"x-api-key": null,
		}, model.headers, options?.headers),
	});
	return streamByApi(model as Model<"anthropic-messages">, context, buildAnthropicOptions(model, options, token, client) as any);
}

function createGooglePayload(model: Model<Api>, context: Context, options: SimpleStreamOptions | undefined): Record<string, unknown> {
	const userParts = context.messages.flatMap((message) => {
		if (message.role !== "user") return [];
		if (typeof message.content === "string") {
			return [{ text: message.content }];
		}
		return message.content
			.filter((part) => part.type === "text")
			.map((part) => ({ text: part.text }));
	});

	const payload: Record<string, unknown> = {
		contents: [{ role: "user", parts: userParts.length > 0 ? userParts : [{ text: "" }] }],
	};

	if (context.systemPrompt) {
		payload.systemInstruction = { parts: [{ text: context.systemPrompt }] };
	}

	if (options?.temperature !== undefined || options?.maxTokens !== undefined) {
		const generationConfig: Record<string, unknown> = {};
		if (options?.temperature !== undefined) generationConfig.temperature = options.temperature;
		if (options?.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
		payload.generationConfig = generationConfig;
	}

	return payload;
}

async function* parseGoogleSse(response: Response): AsyncGenerator<Record<string, unknown>> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("Google gateway response body is empty");
	}

	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	const delimiters = ["\n\n", "\r\r", "\r\n\r\n"] as const;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			while (true) {
				let delimiterIndex = -1;
				let delimiterLength = 0;
				for (const delimiter of delimiters) {
					const index = buffer.indexOf(delimiter);
					if (index !== -1 && (delimiterIndex === -1 || index < delimiterIndex)) {
						delimiterIndex = index;
						delimiterLength = delimiter.length;
					}
				}
				if (delimiterIndex === -1) break;

				const event = buffer.slice(0, delimiterIndex).trim();
				buffer = buffer.slice(delimiterIndex + delimiterLength);
				if (!event) continue;

				const dataLines = event
					.split(/\r?\n/)
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trim())
					.filter(Boolean);
				if (dataLines.length === 0) continue;

				const json = dataLines.join("\n");
				if (json === "[DONE]") continue;
				yield JSON.parse(json) as Record<string, unknown>;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

function createGoogleTextMessage(model: Model<Api>, text: string, timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: text ? [{ type: "text", text }] : [],
		api: model.api,
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
		stopReason: "stop",
		timestamp,
	};
}

function streamGoogleViaGateway(
	model: Model<Api>,
	context: Context,
	options: SimpleStreamOptions | undefined,
	token: string,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		const timestamp = Date.now();
		const output = createGoogleTextMessage(model, "", timestamp);

		try {
			const payload = createGooglePayload(model, context, options);
			const headers = {
				"Content-Type": "application/json",
				...(model.headers || {}),
				...(options?.headers || {}),
				Authorization: `Bearer ${token}`,
			};
			const response = await fetch(`${model.baseUrl}/models/${model.id}:streamGenerateContent?alt=sse`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				signal: options?.signal,
			});
			if (!response.ok) {
				throw new Error(await response.text());
			}

			stream.push({ type: "start", partial: output });
			let started = false;
			let text = "";

			for await (const chunk of parseGoogleSse(response)) {
				const candidate = Array.isArray(chunk.candidates) ? chunk.candidates[0] : undefined;
				const parts = candidate && typeof candidate === "object" && Array.isArray(candidate.content?.parts)
					? candidate.content.parts
					: [];
				for (const part of parts) {
					if (!part || typeof part !== "object" || typeof part.text !== "string") continue;
					if (!started) {
						started = true;
						output.content = [{ type: "text", text: "" }];
						stream.push({ type: "text_start", contentIndex: 0, partial: output });
					}
					text += part.text;
					(output.content[0] as { type: "text"; text: string }).text = text;
					stream.push({ type: "text_delta", contentIndex: 0, delta: part.text, partial: output });
				}
				if (chunk.usageMetadata && typeof chunk.usageMetadata === "object") {
					const usage = chunk.usageMetadata as {
						promptTokenCount?: number;
						candidatesTokenCount?: number;
						cachedContentTokenCount?: number;
						totalTokenCount?: number;
					};
					output.usage.input = usage.promptTokenCount || 0;
					output.usage.output = usage.candidatesTokenCount || 0;
					output.usage.cacheRead = usage.cachedContentTokenCount || 0;
					output.usage.totalTokens = usage.totalTokenCount || (output.usage.input + output.usage.output + output.usage.cacheRead);
				}
			}

			if (started) {
				stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
			}
			stream.push({ type: "done", reason: "stop", message: output });
			stream.end();
		} catch (error) {
			stream.push({
				type: "error",
				reason: options?.signal?.aborted ? "aborted" : "error",
				error: {
					...output,
					stopReason: options?.signal?.aborted ? "aborted" : "error",
					errorMessage: formatGatewayErrorMessage(error),
				},
			});
			stream.end();
		}
	})();

	return stream;
}

function applyOpenAIResponsesPayloadOptions(
	payload: unknown,
	options: { responseVerbosity?: ResponseVerbosity; reasoningContext?: ReasoningContext },
): unknown {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	let body = payload as Record<string, unknown>;

	if (options.responseVerbosity) {
		const existingText = body.text;
		const text = existingText && typeof existingText === "object" && !Array.isArray(existingText)
			? existingText as Record<string, unknown>
			: {};
		body = { ...body, text: { ...text, verbosity: options.responseVerbosity } };
	}

	if (options.reasoningContext) {
		const existingReasoning = body.reasoning;
		const reasoning = existingReasoning && typeof existingReasoning === "object" && !Array.isArray(existingReasoning)
			? existingReasoning as Record<string, unknown>
			: {};
		body = { ...body, reasoning: { ...reasoning, context: options.reasoningContext } };
	}

	return body;
}

function applyRoutePayloadOptions(options: SimpleStreamOptions, route: RouteDescriptor): SimpleStreamOptions {
	if (route.api !== "openai-responses" || (!route.responseVerbosity && !route.reasoningContext)) return options;
	const onPayload = options.onPayload;
	return {
		...options,
		onPayload: async (payload, model) => {
			const configuredPayload = applyOpenAIResponsesPayloadOptions(payload, route);
			return (await onPayload?.(configuredPayload, model)) ?? configuredPayload;
		},
	};
}

function createDelegatedStream(
	model: Model<Api>,
	route: RouteDescriptor,
	context: Context,
	options: SimpleStreamOptions,
	token: string,
): AssistantMessageEventStream {
	switch (route.api) {
		case "anthropic-messages":
			return streamAnthropicViaGateway(model, context, options, token);
		case "openai-responses":
			return streamSimpleOpenAIResponses(model as Model<"openai-responses">, context, options);
		case "google-generative-ai":
			return streamGoogleViaGateway(model as Model<"google-generative-ai">, context, options, token);
		case "openai-completions":
			return streamSimpleOpenAICompletions(model as Model<"openai-completions">, context, options);
		default:
			throw new Error(`Unsupported delegated API for ${PROVIDER_ID}: ${route.api}`);
	}
}

async function resolveRoute(model: Model<Api>): Promise<RouteDescriptor> {
	let route = getCatalog().routes.get(model.id);
	if (route) return route;
	const refreshed = await refreshCatalog(true);
	route = refreshed.routes.get(model.id);
	if (!route) {
		throw new Error(`Unknown ${PROVIDER_ID} model: ${model.id}`);
	}
	return route;
}

export function streamOpencodeCloudflare(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		let route: RouteDescriptor | undefined;
		try {
			route = await resolveRoute(model);
			const token = resolveGatewayToken(options?.apiKey);
			if (!token) {
				throw new Error(
					`No token available for ${PROVIDER_ID}. Run /login ${PROVIDER_ID}, set ${TOKEN_ENV_OVERRIDE}, or run \`opencode auth login https://opencode.cloudflare.dev\`.`,
				);
			}

			const gateway = await getGatewayConfig({ fallbackToDefault: true });
			const latestRoute = gateway.routes[route.backend];
			const delegatedHeaders = applyGatewayToken(latestRoute?.headers || route.headers, gateway.authEnv, token);
			const delegatedModel = buildDelegatedModel(
				model,
				route,
				delegatedHeaders,
				latestRoute?.baseUrl || route.baseUrl,
			);
			const delegatedOptions = applyRoutePayloadOptions({
				...options,
				apiKey: token,
			}, route);

			const innerStream = createDelegatedStream(delegatedModel, route, context, delegatedOptions, token);
			for await (const event of innerStream) {
				stream.push(normalizeEvent(event, model));
			}
			stream.end();
		} catch (error) {
			// Use route.api if available so errors have the real API type
			const routeApi = route?.api;
			stream.push({
				type: "error",
				reason: "error",
				error: createErrorMessage(model, error, routeApi),
			});
			stream.end();
		}
	})();

	return stream;
}
