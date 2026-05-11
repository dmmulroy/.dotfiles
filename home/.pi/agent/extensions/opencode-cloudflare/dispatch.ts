import Anthropic from "@anthropic-ai/sdk";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	streamSimpleOpenAICompletions,
	streamSimpleOpenAIResponses,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamAnthropic, type AnthropicOptions } from "@earendil-works/pi-ai/anthropic";
import { getCatalog, refreshCatalog, type RouteDescriptor } from "./catalog.ts";
import { PROVIDER_ID, TOKEN_ENV_OVERRIDE, TRACE_ANTHROPIC_ENV } from "./constants.ts";
import { resolveGatewayToken } from "./auth.ts";
import { applyGatewayToken, getGatewayConfig } from "./wellknown.ts";

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
		errorMessage: error instanceof Error ? error.message : String(error),
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

const ANTHROPIC_TRACE_TAIL_BYTES = 12 * 1024;

function isAnthropicTraceEnabled(): boolean {
	const value = process.env[TRACE_ANTHROPIC_ENV];
	return value === "1" || value === "true" || value === "yes";
}

function redactHeaders(headers: Headers): Record<string, string> {
	const redacted: Record<string, string> = {};
	for (const [key, value] of headers.entries()) {
		const lower = key.toLowerCase();
		redacted[key] = lower === "authorization" || lower === "cf-access-token" || lower === "cookie" || lower === "set-cookie"
			? "<redacted>"
			: value;
	}
	return redacted;
}

function summarizeAnthropicPayload(body: BodyInit | null | undefined): Record<string, unknown> {
	if (typeof body !== "string") return { body: typeof body };
	try {
		const payload = JSON.parse(body) as {
			model?: unknown;
			max_tokens?: unknown;
			messages?: unknown;
			tools?: unknown;
			system?: unknown;
		};
		const system = payload.system;
		const systemLength = typeof system === "string"
			? system.length
			: Array.isArray(system)
				? system.reduce((total, part) => total + (typeof part?.text === "string" ? part.text.length : 0), 0)
				: 0;
		return {
			model: payload.model,
			max_tokens: payload.max_tokens,
			message_count: Array.isArray(payload.messages) ? payload.messages.length : 0,
			tool_count: Array.isArray(payload.tools) ? payload.tools.length : 0,
			system_length: systemLength,
		};
	} catch (error) {
		return { body: "unparseable", error: error instanceof Error ? error.message : String(error) };
	}
}

function appendTail(current: string, next: string, limit: number): string {
	const combined = current + next;
	return combined.length > limit ? combined.slice(combined.length - limit) : combined;
}

function nextLineBreakIndex(text: string): number {
	const carriageReturnIndex = text.indexOf("\r");
	const newlineIndex = text.indexOf("\n");
	if (carriageReturnIndex === -1) return newlineIndex;
	if (newlineIndex === -1) return carriageReturnIndex;
	return Math.min(carriageReturnIndex, newlineIndex);
}

function consumeLine(text: string): { line: string; rest: string } | null {
	const lineBreakIndex = nextLineBreakIndex(text);
	if (lineBreakIndex === -1) return null;
	let nextIndex = lineBreakIndex + 1;
	if (text[lineBreakIndex] === "\r" && text[nextIndex] === "\n") nextIndex += 1;
	return { line: text.slice(0, lineBreakIndex), rest: text.slice(nextIndex) };
}

async function traceAnthropicResponse(
	response: Response,
	meta: { url: string; method: string; payload: Record<string, unknown>; startedAt: number },
): Promise<void> {
	const events: string[] = [];
	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	let tail = "";
	let currentEvent: string | undefined;
	let sawMessageStop = false;
	let bytes = 0;

	function consumeSseLine(line: string): void {
		if (line === "") {
			if (currentEvent) {
				events.push(currentEvent);
				if (currentEvent === "message_stop") sawMessageStop = true;
			}
			currentEvent = undefined;
			return;
		}
		if (line.startsWith("event:")) {
			currentEvent = line.slice("event:".length).trim();
		}
	}

	try {
		const reader = response.body?.getReader();
		if (!reader) throw new Error("response body is empty");
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				bytes += value.byteLength;
				const chunk = decoder.decode(value, { stream: true });
				tail = appendTail(tail, chunk, ANTHROPIC_TRACE_TAIL_BYTES);
				buffer += chunk;
				let consumed = consumeLine(buffer);
				while (consumed) {
					buffer = consumed.rest;
					consumeSseLine(consumed.line);
					consumed = consumeLine(buffer);
				}
			}
			const finalChunk = decoder.decode();
			if (finalChunk) {
				tail = appendTail(tail, finalChunk, ANTHROPIC_TRACE_TAIL_BYTES);
				buffer += finalChunk;
			}
			let consumed = consumeLine(buffer);
			while (consumed) {
				buffer = consumed.rest;
				consumeSseLine(consumed.line);
				consumed = consumeLine(buffer);
			}
			if (buffer) consumeSseLine(buffer);
			consumeSseLine("");
		} finally {
			reader.releaseLock();
		}

		console.error(`[${PROVIDER_ID}] Anthropic SSE trace ${JSON.stringify({
			url: meta.url,
			method: meta.method,
			status: response.status,
			statusText: response.statusText,
			duration_ms: Date.now() - meta.startedAt,
			response_headers: redactHeaders(response.headers),
			payload: meta.payload,
			bytes,
			events,
			saw_message_stop: sawMessageStop,
			tail,
		})}`);
	} catch (error) {
		console.error(`[${PROVIDER_ID}] Anthropic SSE trace failed ${JSON.stringify({
			url: meta.url,
			method: meta.method,
			duration_ms: Date.now() - meta.startedAt,
			payload: meta.payload,
			error: error instanceof Error ? error.message : String(error),
		})}`);
	}
}

function createAnthropicTraceFetch(): typeof fetch {
	return async (input: RequestInfo | URL, init?: RequestInit) => {
		const startedAt = Date.now();
		const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
		const method = init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : undefined) || "GET";
		const payload = summarizeAnthropicPayload(init?.body);
		const response = await fetch(input, init);
		void traceAnthropicResponse(response.clone(), { url, method, payload, startedAt });
		return response;
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

function supportsAdaptiveThinking(modelId: string): boolean {
	return modelId.includes("opus-4-6") || modelId.includes("opus-4.6") ||
		modelId.includes("opus-4-7") || modelId.includes("opus-4.7") ||
		modelId.includes("sonnet-4-6") || modelId.includes("sonnet-4.6");
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
	if (supportsAdaptiveThinking(model.id)) {
		return { ...base, thinkingEnabled: true, effort: mapThinkingLevelToEffort(model, options.reasoning) };
	}
	const adjusted = adjustMaxTokensForThinking(base.maxTokens || 0, model.maxTokens, options.reasoning, options.thinkingBudgets);
	return { ...base, maxTokens: adjusted.maxTokens, thinkingEnabled: true, thinkingBudgetTokens: adjusted.thinkingBudget };
}

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
		...(isAnthropicTraceEnabled() ? { fetch: createAnthropicTraceFetch() } : {}),
	});
	return streamAnthropic(model as Model<"anthropic-messages">, context, buildAnthropicOptions(model, options, token, client));
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
					errorMessage: error instanceof Error ? error.message : String(error),
				},
			});
			stream.end();
		}
	})();

	return stream;
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
			const delegatedOptions: SimpleStreamOptions = {
				...options,
				apiKey: token,
			};

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
