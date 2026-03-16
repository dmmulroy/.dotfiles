import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	streamSimpleAnthropic,
	streamSimpleGoogle,
	streamSimpleOpenAICompletions,
	streamSimpleOpenAIResponses,
	type Model,
	type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import { getCatalog, refreshCatalog, type RouteDescriptor } from "./catalog.ts";
import { PROVIDER_ID, TOKEN_ENV_OVERRIDE } from "./constants.ts";
import { resolveGatewayToken } from "./auth.ts";
import { applyGatewayToken, getGatewayConfig } from "./wellknown.ts";

function normalizeAssistantMessage(message: AssistantMessage, visibleModel: Model<Api>): AssistantMessage {
	return {
		...message,
		api: visibleModel.api,
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

function createErrorMessage(model: Model<Api>, error: unknown): AssistantMessage {
	return {
		role: "assistant",
		content: [],
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

function createDelegatedStream(
	model: Model<Api>,
	route: RouteDescriptor,
	context: Context,
	options: SimpleStreamOptions,
): AssistantMessageEventStream {
	switch (route.api) {
		case "anthropic-messages":
			return streamSimpleAnthropic(model as Model<"anthropic-messages">, context, options);
		case "openai-responses":
			return streamSimpleOpenAIResponses(model as Model<"openai-responses">, context, options);
		case "google-generative-ai":
			return streamSimpleGoogle(model as Model<"google-generative-ai">, context, options);
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

			const innerStream = createDelegatedStream(delegatedModel, route, context, delegatedOptions);
			for await (const event of innerStream) {
				stream.push(normalizeEvent(event, model));
			}
			stream.end();
		} catch (error) {
			stream.push({
				type: "error",
				reason: "error",
				error: createErrorMessage(model, error),
			});
			stream.end();
		}
	})();

	return stream;
}
