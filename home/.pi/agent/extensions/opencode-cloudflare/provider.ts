import { createProvider, type Credential, type Provider, type RefreshModelsContext } from "@earendil-works/pi-ai";
import {
	createGatewayProviderAuth,
	createProductionOpenCodeAuthSource,
	GatewayToken,
	type OpenCodeAuthSource,
} from "./auth.ts";
import { GATEWAY_ORIGIN, PROVIDER_ID, PROVIDER_NAME } from "./constants.ts";
import { fetchGatewayConfig } from "./discovery.ts";
import { createGatewayApiStreams } from "./gateway-streams.ts";
import { projectGatewayModels } from "./models.ts";

/** Injectable construction options for the OpenCode Cloudflare provider. */
export interface CreateOpencodeCloudflareProviderOptions {
	readonly authSource?: OpenCodeAuthSource;
	readonly fetch?: typeof fetch;
	readonly now?: () => number;
}

function credentialToken(credential: Credential | undefined): ReturnType<typeof GatewayToken.parse> {
	if (credential?.type === "oauth") return GatewayToken.parse(credential.access);
	if (credential?.type === "api_key") return GatewayToken.parse(credential.key);
	return undefined;
}

/**
 * Create the native Pi provider for the work OpenCode Cloudflare gateway.
 *
 * @param options - Optional auth-source, fetch, and clock overrides for tests.
 */
export function createOpencodeCloudflareProvider(
	options: CreateOpencodeCloudflareProviderOptions = {},
): Provider {
	const authSource = options.authSource ?? createProductionOpenCodeAuthSource();
	const fetchImpl = options.fetch ?? fetch;
	const now = options.now ?? (() => Date.now());

	const fetchModels = async (context: RefreshModelsContext) => {
		const loaded = await fetchGatewayConfig({
			token: credentialToken(context.credential),
			signal: context.signal,
			fetch: fetchImpl,
		});
		if (!loaded.ok) throw loaded.error;
		return [...projectGatewayModels(loaded.value)];
	};

	return createProvider({
		id: PROVIDER_ID,
		name: PROVIDER_NAME,
		baseUrl: GATEWAY_ORIGIN,
		auth: createGatewayProviderAuth(authSource, async (signal) => {
			const loaded = await fetchGatewayConfig({ signal, fetch: fetchImpl });
			if (!loaded.ok) throw loaded.error;
			return loaded.value.authCommand;
		}, now),
		models: [],
		fetchModels,
		api: createGatewayApiStreams(),
	});
}
