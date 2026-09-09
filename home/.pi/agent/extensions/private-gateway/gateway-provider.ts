import { createProvider, lazyStream, type Model, type Provider } from "@earendil-works/pi-ai";
import { createGatewayAccessAuth, gatewayCredentialToken, type GatewayAccessToken } from "./gateway-auth.ts";
import { GATEWAY_APIS, type GatewayApi } from "./gateway-api.ts";
import type { NativeGatewayCatalog } from "./gateway-catalog.ts";
import type { HttpGatewayDiscovery } from "./gateway-discovery.ts";
import { gatewayModelIncluded, type GatewayModelFilter, type GatewayProfile } from "./gateway-profile.ts";

/** Per-profile runtime control; catalog persistence and credential storage remain Pi-owned. */
export interface GatewayProviderHandle {
	readonly provider: Provider<GatewayApi>;
	/** Change visibility immediately, including cached models; no inference or network refresh required. */
	setModelFilter(filter: GatewayModelFilter): void;
	/** Safe catalog warnings, plus unmatched explicit include count. */
	getWarnings(): readonly string[];
	/** Best-effort finalized-error redaction using recently resolved credentials, without refreshing auth. */
	sanitizeError(text: string): string;
}

/** Assemble native Pi provider behavior; profiles never read each other's credentials or catalogs. */
export function buildGatewayProvider(profile: GatewayProfile, dependencies: {
	readonly discovery: HttpGatewayDiscovery;
	readonly catalog: NativeGatewayCatalog;
	readonly now: () => number;
}): GatewayProviderHandle {
	let filter = profile.models;
	let warnings: readonly string[] = [];
	const secrets: GatewayAccessToken[] = [];
	const remember = (token: GatewayAccessToken) => {
		if (!secrets.some((existing) => existing.equals(token))) secrets.push(token);
		if (secrets.length > 32) secrets.shift();
	};
	const trusted = (model: Model<GatewayApi>): boolean => {
		try {
			const url = new URL(model.baseUrl);
			return url.origin === profile.inferenceOrigin && !url.username && !url.password;
		} catch { return false; }
	};
	const native = createProvider<GatewayApi>({
		id: profile.id, name: profile.name, baseUrl: profile.inferenceOrigin, models: [],
		auth: createGatewayAccessAuth(profile, { now: dependencies.now, remember }),
		api: GATEWAY_APIS,
		async fetchModels(context) {
			const token = gatewayCredentialToken(context.credential, dependencies.now());
			if (!token.ok) throw token.error;
			remember(token.value);
			const discovery = await dependencies.discovery.loadDiscovery(profile, token.value, context.signal);
			if (!discovery.ok) throw discovery.error;
			const catalog = await dependencies.catalog.loadCatalog({ ...profile, models: filter }, discovery.value, token.value, context.signal);
			if (!catalog.ok) throw catalog.error;
			warnings = catalog.value.warnings;
			return catalog.value.models;
		},
	});
	const provider: Provider<GatewayApi> = {
		...native,
		getModels: () => native.getModels().filter((model) => trusted(model) && gatewayModelIncluded(model.id, filter)),
		stream: (model, context, options) => trusted(model) ? native.stream(model, context, options) : lazyStream(model, async () => { throw new Error("Private gateway inference rejected: untrusted model origin"); }),
		streamSimple: (model, context, options) => trusted(model) ? native.streamSimple(model, context, options) : lazyStream(model, async () => { throw new Error("Private gateway inference rejected: untrusted model origin"); }),
	};
	return {
		provider,
		setModelFilter(next) { filter = next; },
		getWarnings() {
			const ids = new Set(native.getModels().values().filter(trusted).map((model) => model.id));
			const unmatched = filter.include?.filter((id) => !ids.has(id)).length ?? 0;
			return unmatched ? [...warnings, `${unmatched} included IDs are unavailable in the inference catalog`] : warnings;
		},
		sanitizeError(text) { return secrets.reduce((text, token) => token.redact(text), text); },
	};
}
