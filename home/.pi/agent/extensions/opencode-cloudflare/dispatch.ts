import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	streamSimpleAnthropic,
	streamSimpleOpenAICompletions,
	streamSimpleOpenAIResponses,
	type Model,
	type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import { getCatalog, refreshCatalog, type RouteDescriptor } from "./catalog.ts";
import { PROVIDER_ID, TOKEN_ENV_OVERRIDE } from "./constants.ts";
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

function buildAnthropicDelegatedModel(model: Model<Api>): Model<Api> {
	return {
		...model,
		provider: "github-copilot",
	};
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
			return streamSimpleAnthropic(buildAnthropicDelegatedModel(model) as Model<"anthropic-messages">, context, options);
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
		try {
			const route = await resolveRoute(model);
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
