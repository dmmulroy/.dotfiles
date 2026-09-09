import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

/**
 * Native ESM boundary: public Pi exports must resolve without jiti's root-prefix aliases.
 * @satisfies {Record<import("./gateway-api.ts").GatewayApi, import("@earendil-works/pi-ai").ProviderStreams>}
 */
export const NATIVE_GATEWAY_APIS = {
	"anthropic-messages": anthropicMessagesApi(),
	"google-generative-ai": googleGenerativeAIApi(),
	"openai-responses": openAIResponsesApi(),
	"openai-completions": openAICompletionsApi(),
};
