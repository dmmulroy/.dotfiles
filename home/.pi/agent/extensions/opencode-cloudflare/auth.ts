import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import type { OAuthCredential, OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { GatewayConfigStore } from "./config-store.ts";
import {
	AUTH_ORIGIN,
	DEFAULT_TOKEN_EXPIRY_MS,
	EXPIRY_SAFETY_BUFFER_MS,
	OPENCODE_AUTH_FILE_ENV,
	PROVIDER_ID,
	TOKEN_ENV_OVERRIDE,
	WELL_KNOWN_URL,
} from "./constants.ts";
import { Redacted, type Redacted as RedactedValue } from "./redacted.ts";
import { failure, type Result, success } from "./result.ts";

const MAX_AUTH_COMMAND_OUTPUT_BYTES = 64 * 1024;
const AUTH_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

/** Redaction-safe gateway access token. */
export type GatewayToken = RedactedValue<string>;

/** Parse unknown input into a non-empty redacted gateway token. */
export const GatewayToken = {
	/**
	 * Parse a non-empty token.
	 *
	 * @param input - Unknown token boundary value.
	 * @returns Token when input is a non-empty string.
	 */
	parse(input: unknown): GatewayToken | undefined {
		if (typeof input !== "string") return undefined;
		const value = input.trim();
		return value ? Redacted.make(value) : undefined;
	},
} as const;

/** Imported token metadata without exposing the token in diagnostics. */
export interface ImportedGatewayToken {
	readonly token: GatewayToken;
	readonly authPath: string;
	readonly storageKey: string;
	readonly expiresAt?: number;
}

/** Classified authentication failure. */
export class GatewayAuthError extends Error {
	readonly _tag = "GatewayAuthError" as const;

	/**
	 * Create a safe authentication failure.
	 *
	 * @param reason - Stable authentication failure classification.
	 * @param detail - Safe user-facing detail.
	 * @param cause - Original unclassified cause retained internally.
	 */
	constructor(
		readonly reason:
			| "invalid-auth-file"
			| "untrusted-origin"
			| "missing-auth-command"
			| "untrusted-auth-command"
			| "command-failed"
			| "command-timeout"
			| "command-output-too-large"
			| "cancelled"
			| "missing-token"
			| "expired-token",
		readonly detail: string,
		override readonly cause?: unknown,
	) {
		super(detail);
		this.name = "GatewayAuthError";
	}
}

/** Provider-scoped Pi OAuth credential reader. */
export interface GatewayCredentialReader {
	/** Return the stored provider credential. */
	get(): OAuthCredential | undefined;
}

/** Token-source dependencies. */
export interface GatewayTokenSourceDependencies {
	readonly environment: (name: string) => string | undefined;
	readonly homeDirectory: () => string;
	readonly fileExists: (path: string) => boolean;
	readonly readTextFile: (path: string) => string;
	readonly credentialReader: GatewayCredentialReader;
	readonly now: () => number;
}

/** Shared token source used by discovery, OAuth, and request streaming. */
export interface GatewayTokenSource {
	/** Return candidate OpenCode auth paths in precedence order. */
	listAuthCandidates(): readonly string[];
	/** Return the first existing OpenCode auth path. */
	findAuthPath(): string | undefined;
	/** Parse the current imported OpenCode token. */
	readImportedToken(): Result<ImportedGatewayToken | undefined, GatewayAuthError>;
	/** Resolve request authentication from Pi, environment, or OpenCode storage. */
	resolveToken(apiKey?: string): Result<GatewayToken | undefined, GatewayAuthError>;
	/** Return whether an explicit environment token is configured. */
	hasEnvironmentOverride(): boolean;
}

/** Authentication service dependencies. */
export interface GatewayAuthDependencies {
	readonly configStore: GatewayConfigStore;
	readonly tokenSource: GatewayTokenSource;
	readonly credentialReader: GatewayCredentialReader;
	readonly now: () => number;
}

/** Authentication operations owned by one extension runtime. */
export interface GatewayAuthService {
	/** Return candidate OpenCode auth paths in precedence order. */
	listAuthCandidates(): readonly string[];
	/** Return the first existing OpenCode auth path. */
	findAuthPath(): string | undefined;
	/** Parse the current imported OpenCode token. */
	readImportedToken(): Result<ImportedGatewayToken | undefined, GatewayAuthError>;
	/** Resolve request authentication from Pi, environment, or OpenCode storage. */
	resolveToken(apiKey?: string): Result<GatewayToken | undefined, GatewayAuthError>;
	/** Return Pi's stored OAuth credential, when present. */
	getStoredCredential(): OAuthCredential | undefined;
	/** Run Pi's OAuth login flow. */
	login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
	/** Refresh Pi OAuth credentials from newer OpenCode authentication while honoring cancellation. */
	refresh(credentials: OAuthCredentials, signal: AbortSignal): Promise<OAuthCredentials>;
	/** Return whether an explicit environment token is configured. */
	hasEnvironmentOverride(): boolean;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return input !== null && typeof input === "object" && !Array.isArray(input);
}

function isAllowedGatewayOrigin(input: string): boolean {
	try {
		return new URL(input).origin === new URL(AUTH_ORIGIN).origin;
	} catch {
		return false;
	}
}

function normalizeGatewayOrigin(input: string): string {
	const url = new URL(input);
	url.hash = "";
	url.search = "";
	url.pathname = "";
	return url.origin;
}

function normalizeAuthLookupKeys(origin: string): readonly string[] {
	const normalized = normalizeGatewayOrigin(origin);
	return [normalized, `${normalized}/`, WELL_KNOWN_URL];
}

function parseAuthMap(text: string, authPath: string): Result<Record<string, unknown>, GatewayAuthError> {
	try {
		const decoded: unknown = JSON.parse(text);
		if (!isRecord(decoded)) {
			return failure(new GatewayAuthError("invalid-auth-file", `Invalid OpenCode auth file at ${authPath}`));
		}
		return success(decoded);
	} catch (cause) {
		return failure(new GatewayAuthError("invalid-auth-file", `Invalid OpenCode auth file at ${authPath}`, cause));
	}
}

/**
 * Return the usable expiry of a JWT-like gateway token.
 *
 * @param token - Gateway token.
 * @returns Expiry minus the safety margin, or undefined for opaque tokens.
 */
export function getGatewayTokenExpiry(token: GatewayToken): number | undefined {
	const parts = Redacted.value(token).split(".");
	const payloadPart = parts[1];
	if (!payloadPart) return undefined;
	try {
		const decoded: unknown = JSON.parse(Buffer.from(base64UrlToBase64(payloadPart), "base64").toString("utf8"));
		if (!isRecord(decoded)) return undefined;
		const expiry = decoded.exp;
		return typeof expiry === "number" && Number.isFinite(expiry)
			? expiry * 1000 - EXPIRY_SAFETY_BUFFER_MS
			: undefined;
	} catch {
		return undefined;
	}
}

function isUsableToken(token: GatewayToken | undefined, now: number): token is GatewayToken {
	if (!token) return false;
	const expiresAt = getGatewayTokenExpiry(token);
	return expiresAt === undefined || expiresAt > now;
}

function createGatewayCredentials(token: GatewayToken, now: number): OAuthCredentials {
	return {
		refresh: "",
		access: Redacted.value(token),
		expires: getGatewayTokenExpiry(token) ?? now + DEFAULT_TOKEN_EXPIRY_MS,
	};
}

function base64UrlToBase64(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const remainder = normalized.length % 4;
	return remainder === 0 ? normalized : normalized.padEnd(normalized.length + (4 - remainder), "=");
}

function getTrustedGatewayApp(command: readonly string[]): string | undefined {
	const appTargets: string[] = [];
	for (let index = 0; index < command.length; index += 1) {
		const argument = command[index];
		if (!argument) continue;
		if (argument.startsWith("-app=") || argument.startsWith("--app=")) {
			appTargets.push(argument.slice(argument.indexOf("=") + 1));
			continue;
		}
		if (argument === "-app" || argument === "--app") {
			const target = command[index + 1];
			if (target) appTargets.push(target);
		}
	}
	return appTargets.length === 1 && appTargets[0] && isAllowedGatewayOrigin(appTargets[0])
		? appTargets[0]
		: undefined;
}

/**
 * Validate the remotely supplied login command without invoking a shell.
 *
 * @param command - Discovery document auth command.
 * @returns Trusted argv tuple or a classified rejection.
 */
export function validateGatewayAuthCommand(
	command: string | readonly string[] | undefined,
): Result<readonly [string, ...string[]], GatewayAuthError> {
	if (!command) {
		return failure(new GatewayAuthError("missing-auth-command", `Gateway auth command missing from ${WELL_KNOWN_URL}`));
	}
	if (!Array.isArray(command)) {
		return failure(new GatewayAuthError("untrusted-auth-command", `Refusing string gateway auth command from ${WELL_KNOWN_URL}`));
	}
	const executable = command[0];
	if (!executable || executable !== "cloudflared" || command[1] !== "access" || command[2] !== "login") {
		return failure(new GatewayAuthError("untrusted-auth-command", `Refusing unexpected gateway auth command from ${WELL_KNOWN_URL}`));
	}
	if (!getTrustedGatewayApp(command)) {
		return failure(new GatewayAuthError("untrusted-auth-command", `Refusing gateway auth command without exactly one trusted -app=${AUTH_ORIGIN} target`));
	}
	return success([executable, ...command.slice(1)]);
}

async function runGatewayAuthCommand(
	command: readonly [string, ...string[]],
	signal: AbortSignal | undefined,
): Promise<Result<GatewayToken, GatewayAuthError>> {
	return new Promise((resolveResult) => {
		const child = spawn(command[0], command.slice(1), {
			stdio: ["ignore", "pipe", "ignore"],
			shell: false,
			env: process.env,
		});
		const output: Buffer[] = [];
		let outputBytes = 0;
		let settled = false;
		let timedOut = false;
		let oversized = false;

		const finish = (result: Result<GatewayToken, GatewayAuthError>) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
			resolveResult(result);
		};
		const abort = () => child.kill("SIGTERM");
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, AUTH_COMMAND_TIMEOUT_MS);
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();

		child.stdout?.on("data", (chunk: Buffer | string) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			outputBytes += buffer.byteLength;
			if (outputBytes > MAX_AUTH_COMMAND_OUTPUT_BYTES) {
				oversized = true;
				child.kill("SIGTERM");
				return;
			}
			output.push(buffer);
		});
		child.once("error", (cause) => {
			finish(failure(new GatewayAuthError("command-failed", "Cloudflare Access login command failed to start", cause)));
		});
		child.once("close", (code) => {
			if (signal?.aborted) {
				finish(failure(new GatewayAuthError("cancelled", "Login cancelled")));
				return;
			}
			if (timedOut) {
				finish(failure(new GatewayAuthError("command-timeout", "Cloudflare Access login command timed out")));
				return;
			}
			if (oversized) {
				finish(failure(new GatewayAuthError("command-output-too-large", "Cloudflare Access login output exceeded the safety limit")));
				return;
			}
			if ((code ?? 0) !== 0) {
				finish(failure(new GatewayAuthError("command-failed", `Cloudflare Access login command exited with status ${code ?? 0}`)));
				return;
			}
			const token = GatewayToken.parse(Buffer.concat(output).toString("utf8"));
			finish(token
				? success(token)
				: failure(new GatewayAuthError("missing-token", "Cloudflare Access login command did not emit a token")));
		});
	});
}

/**
 * Create a shared, instance-owned gateway token source.
 *
 * @param dependencies - Environment, filesystem, and clock capabilities.
 * @returns Token source used by discovery, OAuth, and request streaming.
 */
export function createGatewayTokenSource(dependencies: GatewayTokenSourceDependencies): GatewayTokenSource {
	const listAuthCandidates = (): readonly string[] => {
		const candidates = new Set<string>();
		const explicit = dependencies.environment(OPENCODE_AUTH_FILE_ENV)?.trim();
		if (explicit) candidates.add(resolve(explicit));
		const xdgDataHome = dependencies.environment("XDG_DATA_HOME")?.trim();
		if (xdgDataHome) candidates.add(join(xdgDataHome, "opencode", "auth.json"));
		candidates.add(join(dependencies.homeDirectory(), ".local", "share", "opencode", "auth.json"));
		return Array.from(candidates);
	};
	const findAuthPath = (): string | undefined => listAuthCandidates().find((candidate) => dependencies.fileExists(candidate));
	const readImportedToken = (origin = AUTH_ORIGIN): Result<ImportedGatewayToken | undefined, GatewayAuthError> => {
		if (!isAllowedGatewayOrigin(origin)) {
			return failure(new GatewayAuthError("untrusted-origin", `Refusing to read auth for untrusted gateway origin: ${origin}`));
		}
		const authPath = findAuthPath();
		if (!authPath) return success(undefined);
		let text: string;
		try {
			text = dependencies.readTextFile(authPath);
		} catch (cause) {
			return failure(new GatewayAuthError("invalid-auth-file", `Unable to read OpenCode auth file at ${authPath}`, cause));
		}
		const parsed = parseAuthMap(text, authPath);
		if (!parsed.ok) return parsed;
		for (const key of normalizeAuthLookupKeys(origin)) {
			const record = parsed.value[key];
			if (!isRecord(record)) continue;
			const token = GatewayToken.parse(record.token);
			if (!token) continue;
			return success({ token, authPath, storageKey: key, expiresAt: getGatewayTokenExpiry(token) });
		}
		return success(undefined);
	};
	return {
		listAuthCandidates,
		findAuthPath,
		readImportedToken: () => readImportedToken(),
		resolveToken(apiKey) {
			const now = dependencies.now();
			const storedCredential = dependencies.credentialReader.get();
			const storedToken = storedCredential?.type === "oauth" && storedCredential.expires > now
				? GatewayToken.parse(storedCredential.access)
				: undefined;
			const candidates = [
				GatewayToken.parse(apiKey),
				GatewayToken.parse(dependencies.environment(TOKEN_ENV_OVERRIDE)),
				storedToken,
			];
			for (const candidate of candidates) {
				if (isUsableToken(candidate, now)) return success(candidate);
			}
			const imported = readImportedToken();
			if (!imported.ok) return imported;
			return success(isUsableToken(imported.value?.token, now) ? imported.value.token : undefined);
		},
		hasEnvironmentOverride() {
			return GatewayToken.parse(dependencies.environment(TOKEN_ENV_OVERRIDE)) !== undefined;
		},
	};
}

/**
 * Create an instance-owned authentication service.
 *
 * @param dependencies - Configuration, token-source, and clock capabilities.
 * @returns Gateway authentication service.
 */
export function createGatewayAuthService(dependencies: GatewayAuthDependencies): GatewayAuthService {
	return {
		listAuthCandidates: () => dependencies.tokenSource.listAuthCandidates(),
		findAuthPath: () => dependencies.tokenSource.findAuthPath(),
		readImportedToken: () => dependencies.tokenSource.readImportedToken(),
		resolveToken: (apiKey) => dependencies.tokenSource.resolveToken(apiKey),
		getStoredCredential() {
			const credential = dependencies.credentialReader.get();
			return credential?.type === "oauth" ? credential : undefined;
		},
		async login(callbacks) {
			const imported = dependencies.tokenSource.readImportedToken();
			if (!imported.ok) throw imported.error;
			if (isUsableToken(imported.value?.token, dependencies.now())) {
				callbacks.onProgress?.("Reusing the existing OpenCode Cloudflare token from auth.json");
				return createGatewayCredentials(imported.value.token, dependencies.now());
			}
			const config = await dependencies.configStore.load({ forceReload: true, fallbackToDefault: true, signal: callbacks.signal });
			if (!config.ok) throw config.error;
			callbacks.onAuth({ url: AUTH_ORIGIN, instructions: "Complete the Cloudflare Access login in your browser." });
			callbacks.onProgress?.("Running Cloudflare Access login command...");
			const command = validateGatewayAuthCommand(config.value.authCommand);
			if (!command.ok) throw command.error;
			const token = await runGatewayAuthCommand(command.value, callbacks.signal);
			if (!token.ok) throw token.error;
			callbacks.onProgress?.("Cloudflare Access token acquired.");
			return createGatewayCredentials(token.value, dependencies.now());
		},
		async refresh(_credentials, signal) {
			signal.throwIfAborted();
			const imported = dependencies.tokenSource.readImportedToken();
			if (!imported.ok) throw imported.error;
			if (isUsableToken(imported.value?.token, dependencies.now())) {
				return createGatewayCredentials(imported.value.token, dependencies.now());
			}
			throw new GatewayAuthError("expired-token", `The OpenCode Cloudflare token has expired. Refresh OpenCode auth, then run /login ${PROVIDER_ID}.`);
		},
		hasEnvironmentOverride: () => dependencies.tokenSource.hasEnvironmentOverride(),
	};
}

/** Create a production Pi OAuth credential reader scoped to this provider. */
export function createProductionGatewayCredentialReader(): GatewayCredentialReader {
	return {
		get() {
			const credential = readStoredCredential(PROVIDER_ID);
			return credential?.type === "oauth" ? credential : undefined;
		},
	};
}

/**
 * Create the production gateway token source.
 *
 * @param credentialReader - Shared provider-scoped Pi credential reader.
 */
export function createProductionGatewayTokenSource(credentialReader: GatewayCredentialReader): GatewayTokenSource {
	return createGatewayTokenSource({
		environment: (name) => process.env[name],
		homeDirectory: () => homedir(),
		fileExists: (path) => existsSync(path),
		readTextFile: (path) => readFileSync(path, "utf8"),
		credentialReader,
		now: () => Date.now(),
	});
}

/**
 * Create the production authentication service.
 *
 * @param configStore - Configuration store owned by the extension runtime.
 * @param tokenSource - Shared production token source.
 * @param credentialReader - Shared provider-scoped Pi credential reader.
 * @returns Authentication service using Pi and OpenCode credential storage.
 */
export function createProductionGatewayAuthService(
	configStore: GatewayConfigStore,
	tokenSource: GatewayTokenSource,
	credentialReader: GatewayCredentialReader,
): GatewayAuthService {
	return createGatewayAuthService({ configStore, tokenSource, credentialReader, now: () => Date.now() });
}

/**
 * Describe token presence without exposing token contents.
 *
 * @param token - Optional token.
 * @param now - Current timestamp.
 * @returns Safe token status.
 */
export function describeTokenState(token: GatewayToken | undefined, now: number = Date.now()): string {
	if (!token) return "missing";
	const expiresAt = getGatewayTokenExpiry(token);
	if (!expiresAt) return "present (expiry unknown)";
	if (expiresAt <= now) return "expired";
	return `present (expires ${new Date(expiresAt).toISOString()})`;
}
