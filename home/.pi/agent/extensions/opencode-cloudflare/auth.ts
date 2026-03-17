import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { AuthStorage, type OAuthCredential } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import {
	DEFAULT_TOKEN_EXPIRY_MS,
	GATEWAY_ORIGIN,
	OPENCODE_AUTH_FILE_ENV,
	PROVIDER_ID,
	TOKEN_ENV_OVERRIDE,
	WELL_KNOWN_URL,
} from "./constants.ts";
import {
	getGatewayConfig,
	getGatewayTokenExpiry,
	isAllowedGatewayOrigin,
	normalizeGatewayOrigin,
	resolvePreferredToken,
} from "./wellknown.ts";

interface OpenCodeAuthRecord {
	type?: string;
	key?: string;
	token?: string;
}

export interface ImportedGatewayToken {
	token: string;
	authPath: string;
	storageKey: string;
	keyName?: string;
	expiresAt?: number;
}

export function listOpenCodeAuthCandidates(): string[] {
	const candidates = new Set<string>();
	const explicit = process.env[OPENCODE_AUTH_FILE_ENV]?.trim();
	if (explicit) candidates.add(path.resolve(explicit));

	const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
	if (xdgDataHome) {
		candidates.add(path.join(xdgDataHome, "opencode", "auth.json"));
	}
	candidates.add(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"));
	return Array.from(candidates);
}

export function findOpenCodeAuthPath(): string | undefined {
	return listOpenCodeAuthCandidates().find((candidate) => existsSync(candidate));
}

function normalizeAuthLookupKeys(origin: string): string[] {
	const normalizedOrigin = normalizeGatewayOrigin(origin);
	return [normalizedOrigin, `${normalizedOrigin}/`, WELL_KNOWN_URL];
}

function readOpenCodeAuthMap(authPath: string): Record<string, OpenCodeAuthRecord> {
	const raw = JSON.parse(readFileSync(authPath, "utf8")) as unknown;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`Invalid OpenCode auth file: ${authPath}`);
	}
	return raw as Record<string, OpenCodeAuthRecord>;
}

export function readImportedGatewayToken(origin: string = GATEWAY_ORIGIN): ImportedGatewayToken | undefined {
	if (!isAllowedGatewayOrigin(origin)) {
		throw new Error(`Refusing to read auth for untrusted gateway origin: ${origin}`);
	}

	const authPath = findOpenCodeAuthPath();
	if (!authPath) return undefined;

	const authMap = readOpenCodeAuthMap(authPath);
	for (const key of normalizeAuthLookupKeys(origin)) {
		const record = authMap[key];
		if (!record || typeof record !== "object") continue;
		if (typeof record.token !== "string" || !record.token.trim()) continue;
		return {
			token: record.token.trim(),
			authPath,
			storageKey: key,
			keyName: typeof record.key === "string" ? record.key : undefined,
			expiresAt: getGatewayTokenExpiry(record.token.trim()),
		};
	}

	return undefined;
}

export function createGatewayCredentials(
	token: string,
	extra?: Record<string, unknown>,
): OAuthCredentials {
	const expiresAt = getGatewayTokenExpiry(token) ?? Date.now() + DEFAULT_TOKEN_EXPIRY_MS;
	return {
		refresh: "",
		access: token,
		expires: expiresAt,
		...extra,
	};
}

export function resolveGatewayToken(apiKey?: string): string | undefined {
	const preferred = resolvePreferredToken(apiKey);
	if (preferred) return preferred;
	const imported = readImportedGatewayToken();
	if (imported?.token) return imported.token;
	return undefined;
}

export function getPiStoredGatewayCredential(): OAuthCredential | undefined {
	const authStorage = AuthStorage.create();
	const credential = authStorage.get(PROVIDER_ID);
	return credential?.type === "oauth" ? credential : undefined;
}

export async function syncImportedAuthToPi(): Promise<ImportedGatewayToken> {
	const imported = readImportedGatewayToken();
	if (!imported) {
		throw new Error(
			`No OpenCode auth found for ${GATEWAY_ORIGIN}. Run \`opencode auth login ${GATEWAY_ORIGIN}\` first or use /login ${PROVIDER_ID}.`,
		);
	}
	const authStorage = AuthStorage.create();
	authStorage.set(PROVIDER_ID, { type: "oauth", ...createGatewayCredentials(imported.token, { source: "opencode-auth" }) });
	return imported;
}

export async function loginOpencodeCloudflare(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	const imported = readImportedGatewayToken();
	if (imported?.token && (!imported.expiresAt || imported.expiresAt > Date.now())) {
		callbacks.onProgress?.("Reusing the existing OpenCode Cloudflare token from auth.json");
		return createGatewayCredentials(imported.token, {
			source: "opencode-auth",
			importedFrom: imported.authPath,
			storageKey: imported.storageKey,
		});
	}

	const gateway = await getGatewayConfig({ forceReload: true, fallbackToDefault: false });
	if (!isAllowedGatewayOrigin(gateway.origin)) {
		throw new Error(`Refusing login for untrusted gateway origin: ${gateway.origin}`);
	}

	callbacks.onAuth({
		url: GATEWAY_ORIGIN,
		instructions: "Complete the Cloudflare Access login in your browser. This runs the gateway-provided login command locally.",
	});
	callbacks.onProgress?.("Running Cloudflare Access login command...");

	const token = await runGatewayAuthCommand(gateway.authCommand, callbacks.signal);
	callbacks.onProgress?.("Cloudflare Access token acquired.");
	return createGatewayCredentials(token, { source: "pi-login" });
}

export async function refreshOpencodeCloudflare(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	const imported = readImportedGatewayToken();
	if (imported?.token && imported.token !== credentials.access) {
		return createGatewayCredentials(imported.token, {
			source: "opencode-auth",
			importedFrom: imported.authPath,
			storageKey: imported.storageKey,
		});
	}

	throw new Error(
		`The OpenCode Cloudflare token has expired. Run /login ${PROVIDER_ID} or \`opencode auth login ${GATEWAY_ORIGIN}\`, then /reload or /opencode-cf-sync-auth.`,
	);
}

export async function runGatewayAuthCommand(
	command: string | string[] | undefined,
	signal?: AbortSignal,
): Promise<string> {
	if (!command || (Array.isArray(command) && command.length === 0)) {
		throw new Error(`Gateway auth command missing from ${WELL_KNOWN_URL}`);
	}

	const child = Array.isArray(command)
		? spawn(command[0]!, command.slice(1), {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			env: process.env,
		})
		: spawn(command, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: true,
			env: process.env,
		});

	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	const timeout = setTimeout(() => {
		child.kill("SIGTERM");
	}, 5 * 60 * 1000);

	const abort = () => {
		child.kill("SIGTERM");
	};
	signal?.addEventListener("abort", abort, { once: true });

	if (child.stdout) {
		child.stdout.on("data", (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
	}
	if (child.stderr) {
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
	}

	try {
		const exitCode = await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => resolve(code ?? 0));
		});

		const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
		const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

		if (signal?.aborted) {
			throw new Error("Login cancelled");
		}
		if (exitCode !== 0) {
			throw new Error(stderr || `Gateway auth command exited with status ${exitCode}`);
		}
		if (!stdout) {
			const imported = readImportedGatewayToken();
			if (imported?.token) {
				return imported.token;
			}
			throw new Error("Gateway auth command did not emit a token on stdout.");
		}
		return stdout;
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abort);
	}
}

export function describeTokenState(token: string | undefined): string {
	if (!token) return "missing";
	const expiresAt = getGatewayTokenExpiry(token);
	if (!expiresAt) return "present (expiry unknown)";
	if (expiresAt <= Date.now()) return "expired";
	return `present (expires ${new Date(expiresAt).toISOString()})`;
}

export function hasEnvOverride(): boolean {
	return Boolean(process.env[TOKEN_ENV_OVERRIDE]?.trim());
}
