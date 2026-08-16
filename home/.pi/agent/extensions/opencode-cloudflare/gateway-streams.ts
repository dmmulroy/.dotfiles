import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lazyApi, type Api, type Model, type ProviderStreams, type StreamOptions } from "@earendil-works/pi-ai";

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

function findPiAiPackageRoot(): string {
	let directory = dirname(fileURLToPath(import.meta.url));
	while (true) {
		const candidate = join(directory, "node_modules", "@earendil-works", "pi-ai");
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(directory);
		if (parent === directory) {
			throw new Error("Unable to locate the @earendil-works/pi-ai package for native API loading");
		}
		directory = parent;
	}
}

function nativeApi(fileName: string): ProviderStreams {
	// Pi's extension loader aliases `@earendil-works/pi-ai` to compat.js and
	// breaks static `@earendil-works/pi-ai/api/*` imports. Walk to the real
	// installed package and lazy-load the native API file from disk.
	const href = pathToFileURL(join(findPiAiPackageRoot(), "dist", "api", fileName)).href;
	return lazyApi(() => import(href));
}

/**
 * Native mixed-API streamers with the smallest wrappers the work gateway requires.
 *
 * Anthropic must not send `x-api-key`. Google must not put the Access token in
 * the API-key query parameter. Remaining backends use Bearer auth as-is.
 */
export function createGatewayApiStreams(): Partial<Record<Api, ProviderStreams>> {
	return {
		"anthropic-messages": wrapStreams(nativeApi("anthropic-messages.js"), (_model, options) => ({
			...options,
			apiKey: undefined,
			headers: {
				...options?.headers,
				"x-api-key": null,
			},
		})),
		"google-generative-ai": wrapStreams(nativeApi("google-generative-ai.js"), (_model, options) => ({
			...options,
			apiKey: GOOGLE_GATEWAY_API_KEY_SENTINEL,
		})),
		"openai-responses": nativeApi("openai-responses.js"),
		"openai-completions": nativeApi("openai-completions.js"),
	};
}
