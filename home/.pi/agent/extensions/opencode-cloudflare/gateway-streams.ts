import type { Api, Model, ProviderStreams, StreamOptions } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";

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
