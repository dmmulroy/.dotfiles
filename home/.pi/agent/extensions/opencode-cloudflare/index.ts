import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
	describeTokenState,
	findOpenCodeAuthPath,
	getPiStoredGatewayCredential,
	hasEnvOverride,
	loginOpencodeCloudflare,
	readImportedGatewayToken,
	refreshOpencodeCloudflare,
	syncImportedAuthToPi,
} from "./auth.ts";
import { getCatalog, refreshCatalog, summarizeCatalog } from "./catalog.ts";
import { CUSTOM_API, GATEWAY_ORIGIN, PROVIDER_ID, PROVIDER_NAME, TOKEN_ENV_OVERRIDE } from "./constants.ts";
import { streamOpencodeCloudflare } from "./dispatch.ts";
import { clearGatewayConfigCache, getGatewayConfig } from "./wellknown.ts";

function shellQuote(value: string): string {
	return JSON.stringify(value);
}

function buildTokenCommand(): string {
	const scriptPath = fileURLToPath(new URL("./print-token.mjs", import.meta.url));
	return `!${shellQuote(process.execPath)} ${shellQuote(scriptPath)}`;
}

function describeStoredCredential(): string {
	const credential = getPiStoredGatewayCredential();
	if (!credential) return "missing";
	if (credential.expires <= Date.now()) return "expired";
	return `present (expires ${new Date(credential.expires).toISOString()})`;
}

function isCommandAvailable(command: string): boolean {
	if (!/^[A-Za-z0-9._-]+$/.test(command)) return false;
	const result = spawnSync("/bin/sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], {
		stdio: "ignore",
	});
	return result.status === 0;
}

function buildStatusReport(): string {
	const imported = readImportedGatewayToken();
	const authPath = findOpenCodeAuthPath();
	return [
		`${PROVIDER_NAME}`,
		`Pi auth: ${describeStoredCredential()}`,
		`${TOKEN_ENV_OVERRIDE}: ${hasEnvOverride() ? "present" : "missing"}`,
		`OpenCode auth file: ${authPath || "missing"}`,
		`OpenCode token: ${describeTokenState(imported?.token)}`,
		`Catalog: ${summarizeCatalog(getCatalog())}`,
	].join("\n");
}

async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
	ctx.ui.notify(buildStatusReport(), "info");
}

async function handleSyncAuth(ctx: ExtensionCommandContext): Promise<void> {
	const imported = await syncImportedAuthToPi();
	ctx.ui.notify(`Imported OpenCode auth from ${imported.authPath}. Reloading provider state...`, "success");
	await ctx.reload();
}

async function handleDoctor(ctx: ExtensionCommandContext): Promise<void> {
	clearGatewayConfigCache();
	const gateway = await getGatewayConfig({ forceReload: true, fallbackToDefault: false });
	await refreshCatalog(true);

	const report = [
		`${PROVIDER_NAME} doctor`,
		`Gateway origin: ${gateway.origin}`,
		`Auth command: ${Array.isArray(gateway.authCommand) ? gateway.authCommand.join(" ") : gateway.authCommand || "missing"}`,
		`Enabled backends: ${gateway.enabledBackends.join(", ")}`,
		`cloudflared: ${isCommandAvailable("cloudflared") ? "found" : "missing"}`,
		`Catalog: ${summarizeCatalog(getCatalog())}`,
	].join("\n");

	ctx.ui.notify(report, "info");
}

export default async function (pi: ExtensionAPI) {
	const catalog = await refreshCatalog(true);

	pi.registerProvider(PROVIDER_ID, {
		baseUrl: GATEWAY_ORIGIN,
		apiKey: buildTokenCommand(),
		api: CUSTOM_API,
		models: catalog.models,
		oauth: {
			name: PROVIDER_NAME,
			login: loginOpencodeCloudflare,
			refreshToken: refreshOpencodeCloudflare,
			getApiKey: (credentials) => String(credentials.access || ""),
		},
		streamSimple: streamOpencodeCloudflare,
	});

	pi.registerCommand("opencode-cf-status", {
		description: "Show OpenCode Cloudflare auth and catalog status",
		handler: async (_args, ctx) => {
			await handleStatus(ctx);
		},
	});

	pi.registerCommand("opencode-cf-sync-auth", {
		description: "Import the current OpenCode token into Pi auth storage and reload",
		handler: async (_args, ctx) => {
			await handleSyncAuth(ctx);
		},
	});

	pi.registerCommand("opencode-cf-doctor", {
		description: "Validate the OpenCode Cloudflare gateway configuration",
		handler: async (_args, ctx) => {
			await handleDoctor(ctx);
		},
	});
}
