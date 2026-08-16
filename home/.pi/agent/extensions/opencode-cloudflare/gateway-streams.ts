import type { Api, Model, ProviderStreams, StreamOptions } from "@earendil-works/pi-ai";
// Pi's extension loader aliases `@earendil-works/pi-ai` to the compat entry and
// breaks `@earendil-works/pi-ai/api/*` subpaths. Compat re-exports the same lazy
// factories; this is not the legacy streamSimple/getModels API.
import {
	anthropicMessagesApi,
	googleGenerativeAIApi,
	openAICompletionsApi,
	openAIResponsesApi,
} from "@earendil-works/pi-ai/compat";

const GOOGLE_GATEWAY_API_KEY_SENTINEL = "gateway-authenticated";

function wrapStreams(
	streams: ProviderStreams,
	adapt: (model: Model<Api>, options: StreamOptions | undefined) => StreamOptions | undefined,
): ProviderStreams {
	return {
		stream(model, context, options) {
			return streams.stream(model, context, adapt(model, options));
		},
		streamSimple(model, context, options) {
			return streams.streamSimple(model, context, adapt(model, options));
		},
	};
}

/**
 * Native mixed-API streamers with the smallest wrappers the work gateway requires.
 *
 * Anthropic must not send `x-api-key`. Google must not put the Access token in
 * the API-key query parameter. Remaining backends use Bearer auth as-is.
 */
export function createGatewayApiStreams(): Partial<Record<Api, ProviderStreams>> {
	return {
		"anthropic-messages": wrapStreams(anthropicMessagesApi(), (_model, options) => ({
			...options,
			apiKey: undefined,
			headers: {
				...options?.headers,
				"x-api-key": null,
			},
		})),
		"google-generative-ai": wrapStreams(googleGenerativeAIApi(), (_model, options) => ({
			...options,
			apiKey: GOOGLE_GATEWAY_API_KEY_SENTINEL,
		})),
		"openai-responses": openAIResponsesApi(),
		"openai-completions": openAICompletionsApi(),
	};
}
