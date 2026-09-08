import { spawnSync } from "node:child_process";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	createProductionOpenCodeAuthSource,
	describeTokenState,
	GatewayToken,
	isUsableGatewayToken,
	type OpenCodeAuthSource,
} from "./auth.ts";
import { gatewayWellKnownUrl } from "./constants.ts";
import { fetchGatewayConfig } from "./discovery.ts";
import { discoverGatewayCatalogModels } from "./gateway-model-catalog.ts";
import { excludeDuplicateGatewayModels, projectGatewayModels, summarizeGatewayModels } from "./models.ts";
import { type GatewayProfile } from "./private-gateway-profiles.ts";

/** Inputs for the private gateway health diagnostic. */
export interface BuildDoctorReportOptions {
	readonly profiles: readonly GatewayProfile[];
	readonly now?: number;
	readonly environment?: (name: string) => string | undefined;
	readonly authSource?: OpenCodeAuthSource;
	readonly fetch?: typeof fetch;
	/** Pi credential status keyed by gateway provider id. */
	readonly piAuthStatuses?: { readonly [providerId: string]: string };
}

interface ProfileDoctorCatalog {
	readonly profile: GatewayProfile;
	readonly environmentToken: ReturnType<typeof GatewayToken.parse>;
	readonly imported: ReturnType<OpenCodeAuthSource["readImportedToken"]>;
	readonly loaded: Awaited<ReturnType<typeof fetchGatewayConfig>>;
	readonly models: readonly Model<Api>[] | undefined;
}

function isCommandAvailable(command: string): boolean {
	if (!/^[A-Za-z0-9._-]+$/.test(command)) return false;
	return spawnSync("/bin/sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

async function loadProfileDoctorCatalog(
	profile: GatewayProfile,
	options: {
		readonly now: number;
		readonly environment: (name: string) => string | undefined;
		readonly authSource: OpenCodeAuthSource;
		readonly fetch?: typeof fetch;
	},
): Promise<ProfileDoctorCatalog> {
	const imported = options.authSource.readImportedToken(profile.authOrigin);
	const importedToken = imported.ok ? imported.value?.token : undefined;
	const environmentToken = GatewayToken.parse(options.environment(profile.tokenEnv));
	const token = isUsableGatewayToken(environmentToken, options.now)
		? environmentToken
		: isUsableGatewayToken(importedToken, options.now)
			? importedToken
			: undefined;
	const loaded = await fetchGatewayConfig({
		profile,
		token,
		fetch: options.fetch,
	});
	const catalogConfig = loaded.ok
		? await discoverGatewayCatalogModels({ config: loaded.value, token, fetch: options.fetch })
		: undefined;
	return {
		profile,
		environmentToken,
		imported,
		loaded,
		models: catalogConfig ? projectGatewayModels(catalogConfig) : undefined,
	};
}

function omitSecondaryModelsServedByPrimary(catalogs: readonly ProfileDoctorCatalog[]): readonly ProfileDoctorCatalog[] {
	const primary = catalogs.find((catalog) => catalog.profile.slot === "primary");
	const secondary = catalogs.find((catalog) => catalog.profile.slot === "secondary");
	if (!primary?.models || !secondary?.models) return catalogs;
	const secondaryModels = excludeDuplicateGatewayModels(secondary.models, primary.models);
	return catalogs.map((catalog) => catalog.profile.slot === "secondary" ? { ...catalog, models: secondaryModels } : catalog);
}

function formatProfileDoctorReport(
	catalog: ProfileDoctorCatalog,
	options: {
		readonly now: number;
		readonly authSource: OpenCodeAuthSource;
		readonly piAuthStatus: string;
	},
): string {
	const importedToken = catalog.imported.ok ? catalog.imported.value?.token : undefined;
	const authCommand = catalog.loaded.ok ? catalog.loaded.value.authCommand : undefined;
	return [
		`${catalog.profile.name} doctor`,
		`Provider: ${catalog.profile.id}`,
		`Gateway origin: ${catalog.loaded.ok ? catalog.loaded.value.origin : "unavailable"}`,
		`Discovery: ${gatewayWellKnownUrl(catalog.profile.authOrigin)}`,
		`Auth origin: ${catalog.profile.authOrigin}`,
		`Live discovery: ${catalog.loaded.ok ? "ok" : catalog.loaded.error.message}`,
		`Auth command: ${Array.isArray(authCommand) ? authCommand.join(" ") : authCommand ?? "missing"}`,
		`Enabled backends: ${catalog.loaded.ok ? catalog.loaded.value.enabledBackends.join(", ") : "none"}`,
		`Pi auth: ${options.piAuthStatus}`,
		`Environment token: ${describeTokenState(catalog.environmentToken, options.now)}`,
		`OpenCode auth file: ${options.authSource.findAuthPath() ?? "missing"}`,
		`OpenCode token: ${catalog.imported.ok ? describeTokenState(importedToken, options.now) : catalog.imported.error.message}`,
		`cloudflared: ${isCommandAvailable("cloudflared") ? "found" : "missing"}`,
		`Catalog: ${catalog.models ? summarizeGatewayModels(catalog.models) : "unavailable"}`,
		`Models available: ${catalog.models?.length ?? 0}`,
	].join("\n");
}

/**
 * Build the `/private-gateway-doctor` report without exposing tokens.
 *
 * @param options - Profiles, auth, environment, and network inputs.
 */
export async function buildDoctorReport(options: BuildDoctorReportOptions): Promise<string> {
	const now = options.now ?? Date.now();
	const environment = options.environment ?? ((name: string) => process.env[name]);
	const authSource = options.authSource ?? createProductionOpenCodeAuthSource(options.profiles.map((profile) => profile.authOrigin));
	const catalogs = omitSecondaryModelsServedByPrimary(
		await Promise.all(
			options.profiles.map((profile) =>
				loadProfileDoctorCatalog(profile, {
					now,
					environment,
					authSource,
					fetch: options.fetch,
				}),
			),
		),
	);
	return catalogs
		.map((catalog) =>
			formatProfileDoctorReport(catalog, {
				now,
				authSource,
				piAuthStatus: options.piAuthStatuses?.[catalog.profile.id] ?? "unspecified",
			}),
		)
		.join("\n\n");
}
