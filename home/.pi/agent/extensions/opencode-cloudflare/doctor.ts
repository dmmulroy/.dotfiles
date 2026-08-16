import { spawnSync } from "node:child_process";
import {
	createProductionOpenCodeAuthSource,
	describeTokenState,
	GatewayToken,
	isUsableGatewayToken,
	type OpenCodeAuthSource,
} from "./auth.ts";
import {
	AUTH_ORIGIN,
	PROVIDER_NAME,
	TOKEN_ENV_OVERRIDE,
	WELL_KNOWN_URL,
} from "./constants.ts";
import { fetchGatewayConfig } from "./discovery.ts";
import { projectGatewayModels, summarizeGatewayModels } from "./models.ts";

/** Inputs for the OpenCode Cloudflare health diagnostic. */
export interface BuildDoctorReportOptions {
	readonly now?: number;
	readonly environment?: (name: string) => string | undefined;
	readonly authSource?: OpenCodeAuthSource;
	readonly fetch?: typeof fetch;
	readonly piAuthStatus?: string;
}

function isCommandAvailable(command: string): boolean {
	if (!/^[A-Za-z0-9._-]+$/.test(command)) return false;
	return spawnSync("/bin/sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

/**
 * Build the `/opencode-cf-doctor` report without exposing tokens.
 *
 * @param options - Auth, environment, and network inputs.
 */
export async function buildDoctorReport(options: BuildDoctorReportOptions = {}): Promise<string> {
	const now = options.now ?? Date.now();
	const environment = options.environment ?? ((name: string) => process.env[name]);
	const authSource = options.authSource ?? createProductionOpenCodeAuthSource();
	const imported = authSource.readImportedToken();
	const importedToken = imported.ok ? imported.value?.token : undefined;
	const environmentToken = GatewayToken.parse(environment(TOKEN_ENV_OVERRIDE));
	const loaded = await fetchGatewayConfig({
		token: isUsableGatewayToken(environmentToken, now)
			? environmentToken
			: isUsableGatewayToken(importedToken, now)
				? importedToken
				: undefined,
		fetch: options.fetch,
	});
	const catalog = loaded.ok
		? {
			origin: loaded.value.origin,
			authCommand: loaded.value.authCommand,
			enabledBackends: loaded.value.enabledBackends,
			models: projectGatewayModels(loaded.value),
		}
		: undefined;
	const authCommand = catalog?.authCommand;
	return [
		`${PROVIDER_NAME} doctor`,
		`Gateway origin: ${catalog?.origin ?? "unavailable"}`,
		`Discovery: ${WELL_KNOWN_URL}`,
		`Auth origin: ${AUTH_ORIGIN}`,
		`Live discovery: ${loaded.ok ? "ok" : loaded.error.message}`,
		`Auth command: ${Array.isArray(authCommand) ? authCommand.join(" ") : authCommand ?? "missing"}`,
		`Enabled backends: ${catalog?.enabledBackends.join(", ") ?? "none"}`,
		`Pi auth: ${options.piAuthStatus ?? "unspecified"}`,
		`Environment token: ${describeTokenState(environmentToken, now)}`,
		`OpenCode auth file: ${authSource.findAuthPath() ?? "missing"}`,
		`OpenCode token: ${imported.ok ? describeTokenState(importedToken, now) : imported.error.message}`,
		`cloudflared: ${isCommandAvailable("cloudflared") ? "found" : "missing"}`,
		`Catalog: ${catalog ? summarizeGatewayModels(catalog.models) : "unavailable"}`,
		`Models available: ${catalog?.models.length ?? 0}`,
	].join("\n");
}
