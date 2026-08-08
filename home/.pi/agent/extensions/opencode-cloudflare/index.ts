import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	createProductionGatewayAuthService,
	createProductionGatewayCredentialReader,
	createProductionGatewayTokenSource,
	describeTokenState,
	type GatewayAuthService,
} from "./auth.ts";
import {
	createCatalogService,
	summarizeCatalog,
	type CatalogData,
	type CatalogService,
} from "./catalog.ts";
import {
	createProductionGatewayConfigStore,
	type GatewayConfigStore,
} from "./config-store.ts";
import {
	CUSTOM_API,
	GATEWAY_ORIGIN,
	PROVIDER_ID,
	PROVIDER_NAME,
	TOKEN_ENV_OVERRIDE,
} from "./constants.ts";
import { Redacted } from "./redacted.ts";
import { createGatewayStream } from "./stream.ts";

interface ExtensionServices {
	readonly auth: GatewayAuthService;
	readonly catalog: CatalogService;
	readonly configStore: GatewayConfigStore;
}

function describeStoredCredential(auth: GatewayAuthService): string {
	const credential = auth.getStoredCredential();
	if (!credential) return "missing";
	if (credential.expires <= Date.now()) return "expired";
	return `present (expires ${new Date(credential.expires).toISOString()})`;
}

function isCommandAvailable(command: string): boolean {
	if (!/^[A-Za-z0-9._-]+$/.test(command)) return false;
	return spawnSync("/bin/sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

function describeConfigStatus(configStore: GatewayConfigStore): readonly string[] {
	const status = configStore.status();
	const cache = status.cacheSource === "live"
		? "live well-known"
		: status.cacheSource === "fallback"
			? "fallback defaults"
			: "not loaded";
	const fetch = status.lastFetchAt
		? status.lastFetchError
			? `last fetch failed at ${new Date(status.lastFetchAt).toISOString()}: ${status.lastFetchError}`
			: `last fetch succeeded at ${new Date(status.lastFetchAt).toISOString()}`
		: "not attempted";
	return [`Gateway config: ${cache}`, `Gateway fetch: ${fetch}`];
}

function requireCatalog(catalog: CatalogService): CatalogData {
	const current = catalog.current();
	if (!current.ok) throw current.error;
	return current.value;
}

function buildStatusReport(services: ExtensionServices): string {
	const imported = services.auth.readImportedToken();
	const importedDescription = imported.ok ? describeTokenState(imported.value?.token) : imported.error.message;
	return [
		PROVIDER_NAME,
		`Pi auth: ${describeStoredCredential(services.auth)}`,
		`${TOKEN_ENV_OVERRIDE}: ${services.auth.hasEnvironmentOverride() ? "present" : "missing"}`,
		`OpenCode auth file: ${services.auth.findAuthPath() ?? "missing"}`,
		`OpenCode token: ${importedDescription}`,
		...describeConfigStatus(services.configStore),
		`Catalog: ${summarizeCatalog(requireCatalog(services.catalog))}`,
	].join("\n");
}

async function handleStatus(services: ExtensionServices, ctx: ExtensionCommandContext): Promise<void> {
	ctx.ui.notify(buildStatusReport(services), "info");
}

async function handleDoctor(services: ExtensionServices, ctx: ExtensionCommandContext): Promise<void> {
	services.configStore.clear();
	const config = await services.configStore.load({ forceReload: true, fallbackToDefault: false });
	if (!config.ok) throw config.error;
	const catalog = await services.catalog.refresh();
	if (!catalog.ok) throw catalog.error;
	const authCommand = config.value.authCommand;
	const report = [
		`${PROVIDER_NAME} doctor`,
		`Gateway origin: ${config.value.origin}`,
		`Auth command: ${Array.isArray(authCommand) ? authCommand.join(" ") : authCommand ?? "missing"}`,
		`Enabled backends: ${config.value.enabledBackends.join(", ")}`,
		...describeConfigStatus(services.configStore),
		`cloudflared: ${isCommandAvailable("cloudflared") ? "found" : "missing"}`,
		`Catalog: ${summarizeCatalog(catalog.value)}`,
	].join("\n");
	ctx.ui.notify(report, "info");
}

/**
 * Register the OpenCode Cloudflare provider and diagnostics commands.
 *
 * @param pi - Pi extension API.
 * @returns Completion after initial gateway discovery and provider registration.
 */
export default async function registerOpencodeCloudflare(pi: ExtensionAPI): Promise<void> {
	const credentialReader = createProductionGatewayCredentialReader();
	const tokenSource = createProductionGatewayTokenSource(credentialReader);
	const configStore = createProductionGatewayConfigStore(() => {
		const resolved = tokenSource.resolveToken();
		return resolved.ok && resolved.value ? Redacted.value(resolved.value) : undefined;
	});
	const auth = createProductionGatewayAuthService(configStore, tokenSource, credentialReader);
	const catalog = createCatalogService(configStore);
	const initialCatalog = await catalog.refresh({ allowNetwork: false });
	if (!initialCatalog.ok) throw initialCatalog.error;
	const services: ExtensionServices = { auth, catalog, configStore };

	pi.registerProvider(PROVIDER_ID, {
		name: PROVIDER_NAME,
		baseUrl: GATEWAY_ORIGIN,
		apiKey: `$${TOKEN_ENV_OVERRIDE}`,
		api: CUSTOM_API,
		models: [...initialCatalog.value.models],
		refreshModels: async ({ credential, allowNetwork, force, signal }) => {
			const authToken = credential?.type === "oauth" ? credential.access : credential?.key;
			const refreshed = await catalog.refresh({
				forceReload: force === true,
				allowNetwork,
				authToken,
				signal,
			});
			if (!refreshed.ok) throw refreshed.error;
			return [...refreshed.value.models];
		},
		oauth: {
			name: PROVIDER_NAME,
			login: (callbacks) => auth.login(callbacks),
			refreshToken: (credentials, signal) => auth.refresh(credentials, signal),
			getApiKey: (credentials) => credentials.access,
		},
		streamSimple: createGatewayStream(services),
	});

	pi.registerCommand("opencode-cf-status", {
		description: "Show OpenCode Cloudflare auth and catalog status",
		handler: async (_args, ctx) => handleStatus(services, ctx),
	});
	pi.registerCommand("opencode-cf-doctor", {
		description: "Validate the OpenCode Cloudflare gateway configuration",
		handler: async (_args, ctx) => handleDoctor(services, ctx),
	});
}
