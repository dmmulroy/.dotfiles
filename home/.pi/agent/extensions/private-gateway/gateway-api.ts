import { lazyApi, type ProviderStreams, type StreamOptions } from "@earendil-works/pi-ai";

/** Native wire APIs supported by gateway routes. */
export type GatewayApi = "anthropic-messages" | "openai-responses" | "openai-completions" | "google-generative-ai";

function nativeGatewayApi(api: GatewayApi): ProviderStreams {
	// Native ESM resolves public package exports without jiti's root-prefix alias.
	// No package scanning, internal dist paths, or global API registry is used.
	const url = new URL("./gateway-native-apis.mjs", import.meta.url).href;
	return lazyApi(async () => {
		const loaded: typeof import("./gateway-native-apis.mjs") = await import(url);
		return loaded.NATIVE_GATEWAY_APIS[api];
	});
}

function adaptGatewayApi(streams: ProviderStreams, kind: "anthropic" | "google"): ProviderStreams {
	const prepare = (options: StreamOptions | undefined): StreamOptions => {
		const result = { ...options };
		if (kind === "google") result.apiKey = "gateway-authenticated";
		else { delete result.apiKey; result.headers = { ...options?.headers, "x-api-key": null }; }
		return result;
	};
	return {
		...streams,
		stream: (model, context, options) => streams.stream(model, context, prepare(options)),
		streamSimple: (model, context, options) => streams.streamSimple(model, context, prepare(options)),
	};
}

/** Use Pi's native implementations; only Anthropic/Google need Access-token SDK-key adjustments. */
export const GATEWAY_APIS = {
	"anthropic-messages": adaptGatewayApi(nativeGatewayApi("anthropic-messages"), "anthropic"),
	"google-generative-ai": adaptGatewayApi(nativeGatewayApi("google-generative-ai"), "google"),
	"openai-responses": nativeGatewayApi("openai-responses"),
	"openai-completions": nativeGatewayApi("openai-completions"),
} satisfies Record<GatewayApi, ProviderStreams>;
