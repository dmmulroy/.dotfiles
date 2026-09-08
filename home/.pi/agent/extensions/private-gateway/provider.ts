import { createProvider, type Api, type Credential, type Model, type Provider, type RefreshModelsContext } from "@earendil-works/pi-ai";
import {
	createGatewayProviderAuth,
	createProductionOpenCodeAuthSource,
	GatewayToken,
	resolveStoredGatewayToken,
	type OpenCodeAuthSource,
} from "./auth.ts";
import { fetchGatewayConfig } from "./discovery.ts";
import { discoverGatewayCatalogModels } from "./gateway-model-catalog.ts";
import { createGatewayApiStreams } from "./gateway-streams.ts";
import { excludeDuplicateGatewayModels, projectGatewayModels } from "./models.ts";
import { findPrimaryGatewayProfile, type GatewayProfile } from "./private-gateway-profiles.ts";

/** Injectable construction options for a private gateway provider. */
export interface CreatePrivateGatewayProviderOptions {
	/** Private gateway Access application to register. */
	readonly profile: GatewayProfile;
	/** All parsed private gateway profiles, used to omit primary duplicates from secondary. */
	readonly profiles: readonly GatewayProfile[];
	readonly authSource?: OpenCodeAuthSource;
	readonly fetch?: typeof fetch;
	readonly now?: () => number;
	/** Process environment lookup used to resolve the primary gateway token when loading secondary. */
	readonly environment?: (name: string) => string | undefined;
}

function credentialToken(credential: Credential | undefined): ReturnType<typeof GatewayToken.parse> {
	if (credential?.type === "oauth") return GatewayToken.parse(credential.access);
	if (credential?.type === "api_key") return GatewayToken.parse(credential.key);
	return undefined;
}

async function omitPrimaryGatewayDuplicates(
	secondaryModels: readonly Model<Api>[],
	options: {
		readonly primary: GatewayProfile;
		readonly authSource: OpenCodeAuthSource;
		readonly environment: (name: string) => string | undefined;
		readonly fetchImpl: typeof fetch;
		readonly now: number;
		readonly signal?: AbortSignal;
	},
): Promise<readonly Model<Api>[]> {
	options.signal?.throwIfAborted();
	const primaryToken = resolveStoredGatewayToken(
		options.primary,
		options.authSource,
		options.environment,
		options.now,
	);
	if (!primaryToken) return secondaryModels;
	const primaryLoaded = await fetchGatewayConfig({
		profile: options.primary,
		token: primaryToken,
		signal: options.signal,
		fetch: options.fetchImpl,
	});
	options.signal?.throwIfAborted();
	if (!primaryLoaded.ok) return secondaryModels;
	const primaryConfig = await discoverGatewayCatalogModels({
		config: primaryLoaded.value,
		token: primaryToken,
		signal: options.signal,
		fetch: options.fetchImpl,
	});
	return excludeDuplicateGatewayModels(secondaryModels, projectGatewayModels(primaryConfig));
}

/**
 * Create the native Pi provider for a private inference gateway.
 *
 * @param options - Gateway profile plus optional auth-source, fetch, and clock overrides for tests.
 */
export function createPrivateGatewayProvider(
	options: CreatePrivateGatewayProviderOptions,
): Provider {
	const profile = options.profile;
	const authSource = options.authSource ?? createProductionOpenCodeAuthSource(options.profiles.map((item) => item.authOrigin));
	const fetchImpl = options.fetch ?? fetch;
	const now = options.now ?? (() => Date.now());
	const environment = options.environment ?? ((name: string) => process.env[name]);
	const primary = findPrimaryGatewayProfile(options.profiles);

	const fetchModels = async (context: RefreshModelsContext) => {
		const token = credentialToken(context.credential);
		const loaded = await fetchGatewayConfig({
			profile,
			token,
			signal: context.signal,
			fetch: fetchImpl,
		});
		if (!loaded.ok) throw loaded.error;
		const config = await discoverGatewayCatalogModels({
			config: loaded.value,
			token,
			signal: context.signal,
			fetch: fetchImpl,
		});
		let models = projectGatewayModels(config);
		if (profile.slot === "secondary" && primary) {
			models = await omitPrimaryGatewayDuplicates(models, {
				primary,
				authSource,
				environment,
				fetchImpl,
				now: now(),
				signal: context.signal,
			});
		}
		return [...models];
	};

	return createProvider({
		id: profile.id,
		name: profile.name,
		baseUrl: profile.gatewayOrigin,
		auth: createGatewayProviderAuth(profile, authSource, async (signal) => {
			const loaded = await fetchGatewayConfig({ profile, signal, fetch: fetchImpl });
			if (!loaded.ok) throw loaded.error;
			return loaded.value.authCommand;
		}, now),
		models: [],
		fetchModels,
		api: createGatewayApiStreams(),
	});
}
