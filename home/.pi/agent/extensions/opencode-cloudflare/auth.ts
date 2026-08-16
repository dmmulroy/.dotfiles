import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
	ApiKeyAuth,
	ApiKeyCredential,
	AuthCheck,
	AuthContext,
	AuthResult,
	OAuthAuth,
	OAuthCredential,
	ProviderAuth,
	ProviderAuthInteraction,
} from "@earendil-works/pi-ai";
import {
	AUTH_ORIGIN,
	DEFAULT_TOKEN_EXPIRY_MS,
	EXPIRY_SAFETY_BUFFER_MS,
	OPENCODE_AUTH_FILE_ENV,
	PROVIDER_ID,
	PROVIDER_NAME,
	TOKEN_ENV_OVERRIDE,
	WELL_KNOWN_URL,
} from "./constants.ts";
import { isJsonNumber, isJsonObject, isJsonString, parseJsonObject, type JsonObject, type JsonValue } from "./json-value.ts";
import { Redacted, type Redacted as RedactedValue } from "./redacted.ts";
import { failure, type Result, success } from "./result.ts";

const MAX_AUTH_COMMAND_OUTPUT_BYTES = 64 * 1024;
const AUTH_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

/** Redaction-safe gateway access token. */
export type GatewayToken = RedactedValue<string>;

/** Parse a token string or JSON value into a non-empty redacted gateway token. */
export const GatewayToken = {
	/**
	 * Parse a non-empty token string.
	 *
	 * @param input - Token string or missing input.
	 * @returns Token when input is a non-empty string.
	 */
	parse(input: string | undefined): GatewayToken | undefined {
		const value = input?.trim();
		return value ? Redacted.make(value) : undefined;
	},
	/**
	 * Parse a token from already-decoded JSON.
	 *
	 * @param input - JSON value from an auth-file record.
	 */
	parseJson(input: JsonValue | undefined): GatewayToken | undefined {
		return input !== undefined && isJsonString(input) ? GatewayToken.parse(input) : undefined;
	},
} as const;

/** Imported OpenCode token metadata without exposing the token in diagnostics. */
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

/** OpenCode auth-file lookup and token-import capabilities. */
export interface OpenCodeAuthSource {
	/** Return candidate OpenCode auth paths in precedence order. */
	listAuthCandidates(): readonly string[];
	/** Return the first existing OpenCode auth path. */
	findAuthPath(): string | undefined;
	/** Parse the current imported OpenCode token. */
	readImportedToken(): Result<ImportedGatewayToken | undefined, GatewayAuthError>;
}

/** Filesystem and clock capabilities used to import OpenCode auth. */
export interface OpenCodeAuthSourceDependencies {
	readonly environment: (name: string) => string | undefined;
	readonly homeDirectory: () => string;
	readonly fileExists: (path: string) => boolean;
	readonly readTextFile: (path: string) => string;
	readonly now: () => number;
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

function parseAuthMap(text: string, authPath: string): Result<JsonObject, GatewayAuthError> {
	try {
		const parsed = parseJsonObject(JSON.parse(text));
		if (!parsed.ok) {
			return failure(new GatewayAuthError("invalid-auth-file", `Invalid OpenCode auth file at ${authPath}`, parsed.error));
		}
		return success(parsed.value);
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
		const decoded = parseJsonObject(JSON.parse(Buffer.from(base64UrlToBase64(payloadPart), "base64").toString("utf8")));
		if (!decoded.ok) return undefined;
		const expiry = decoded.value.exp;
		return expiry !== undefined && isJsonNumber(expiry) ? expiry * 1000 - EXPIRY_SAFETY_BUFFER_MS : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Return whether a token is present and not past its known expiry.
 *
 * @param token - Optional gateway token.
 * @param now - Current timestamp in milliseconds.
 */
export function isUsableGatewayToken(token: GatewayToken | undefined, now: number): token is GatewayToken {
	if (!token) return false;
	const expiresAt = getGatewayTokenExpiry(token);
	return expiresAt === undefined || expiresAt > now;
}

function createOAuthCredential(token: GatewayToken, now: number): OAuthCredential {
	return {
		type: "oauth",
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
	signal: AbortSignal,
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
			signal.removeEventListener("abort", abort);
			resolveResult(result);
		};
		const abort = () => child.kill("SIGTERM");
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, AUTH_COMMAND_TIMEOUT_MS);
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();

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
			if (signal.aborted) {
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
 * Create an OpenCode auth-file lookup source.
 *
 * @param dependencies - Environment, filesystem, and clock capabilities.
 */
export function createOpenCodeAuthSource(dependencies: OpenCodeAuthSourceDependencies): OpenCodeAuthSource {
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
			if (record === undefined || !isJsonObject(record)) continue;
			const token = GatewayToken.parseJson(record.token);
			if (!token) continue;
			return success({ token, authPath, storageKey: key, expiresAt: getGatewayTokenExpiry(token) });
		}
		return success(undefined);
	};
	return {
		listAuthCandidates,
		findAuthPath,
		readImportedToken: () => readImportedToken(),
	};
}

/** Create the production OpenCode auth-file source. */
export function createProductionOpenCodeAuthSource(): OpenCodeAuthSource {
	return createOpenCodeAuthSource({
		environment: (name) => process.env[name],
		homeDirectory: () => homedir(),
		fileExists: (path) => existsSync(path),
		readTextFile: (path) => readFileSync(path, "utf8"),
		now: () => Date.now(),
	});
}

/**
 * Build request auth that sends the Access token as both Bearer and `cf-access-token`.
 *
 * @param token - Gateway access token.
 */
export function toGatewayModelAuth(token: GatewayToken): AuthResult["auth"] {
	const value = Redacted.value(token);
	return {
		apiKey: value,
		headers: {
			Authorization: `Bearer ${value}`,
			"cf-access-token": value,
			"X-Requested-With": "xmlhttprequest",
			"x-api-key": null,
		},
	};
}

async function resolveEnvironmentToken(ctx: AuthContext, signal: AbortSignal): Promise<GatewayToken | undefined> {
	signal.throwIfAborted();
	return GatewayToken.parse(await ctx.env(TOKEN_ENV_OVERRIDE));
}

function createApiKeyAuth(authSource: OpenCodeAuthSource, now: () => number): ApiKeyAuth {
	return {
		name: `${PROVIDER_NAME} token`,
		async login(interaction: ProviderAuthInteraction): Promise<ApiKeyCredential> {
			interaction.signal.throwIfAborted();
			const key = await interaction.prompt({ type: "secret", message: `Enter ${PROVIDER_NAME} token` });
			interaction.signal.throwIfAborted();
			const token = GatewayToken.parse(key);
			if (!token) {
				throw new GatewayAuthError("missing-token", "A non-empty OpenCode Cloudflare token is required");
			}
			return { type: "api_key", key: Redacted.value(token) };
		},
		async check(input): Promise<AuthCheck | undefined> {
			input.signal.throwIfAborted();
			const stored = GatewayToken.parse(input.credential?.key);
			if (isUsableGatewayToken(stored, now())) return { source: "stored credential", type: "api_key" };
			const environment = await resolveEnvironmentToken(input.ctx, input.signal);
			if (isUsableGatewayToken(environment, now())) return { source: TOKEN_ENV_OVERRIDE, type: "api_key" };
			const imported = authSource.readImportedToken();
			if (!imported.ok) throw imported.error;
			if (isUsableGatewayToken(imported.value?.token, now())) return { source: "OpenCode auth file", type: "api_key" };
			return undefined;
		},
		async resolve(input): Promise<AuthResult | undefined> {
			input.signal.throwIfAborted();
			const stored = GatewayToken.parse(input.credential?.key);
			if (isUsableGatewayToken(stored, now())) {
				return { auth: toGatewayModelAuth(stored), source: "stored credential" };
			}
			const environment = await resolveEnvironmentToken(input.ctx, input.signal);
			if (isUsableGatewayToken(environment, now())) {
				return { auth: toGatewayModelAuth(environment), source: TOKEN_ENV_OVERRIDE };
			}
			const imported = authSource.readImportedToken();
			if (!imported.ok) throw imported.error;
			if (isUsableGatewayToken(imported.value?.token, now())) {
				return { auth: toGatewayModelAuth(imported.value.token), source: "OpenCode auth file" };
			}
			return undefined;
		},
	};
}

/**
 * OAuth login/refresh that imports OpenCode auth or runs a trusted cloudflared command.
 *
 * @param authSource - OpenCode auth-file lookup.
 * @param loadAuthCommand - Load the discovery-document login command.
 * @param now - Clock used for expiry interpretation.
 */
export function createGatewayOAuthAuth(
	authSource: OpenCodeAuthSource,
	loadAuthCommand: (signal: AbortSignal) => Promise<string | readonly string[] | undefined>,
	now: () => number = () => Date.now(),
): OAuthAuth {
	return {
		name: PROVIDER_NAME,
		loginLabel: `Sign in to ${PROVIDER_NAME}`,
		async login(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
			interaction.signal.throwIfAborted();
			const imported = authSource.readImportedToken();
			if (!imported.ok) throw imported.error;
			if (isUsableGatewayToken(imported.value?.token, now())) {
				interaction.notify({ type: "progress", message: "Reusing the existing OpenCode Cloudflare token from auth.json" });
				return createOAuthCredential(imported.value.token, now());
			}
			const command = validateGatewayAuthCommand(await loadAuthCommand(interaction.signal));
			if (!command.ok) throw command.error;
			interaction.notify({
				type: "auth_url",
				url: AUTH_ORIGIN,
				instructions: "Complete the Cloudflare Access login in your browser.",
			});
			interaction.notify({ type: "progress", message: "Running Cloudflare Access login command..." });
			const token = await runGatewayAuthCommand(command.value, interaction.signal);
			if (!token.ok) throw token.error;
			interaction.notify({ type: "progress", message: "Cloudflare Access token acquired." });
			return createOAuthCredential(token.value, now());
		},
		async refresh(_credential, signal): Promise<OAuthCredential> {
			signal.throwIfAborted();
			const imported = authSource.readImportedToken();
			if (!imported.ok) throw imported.error;
			if (isUsableGatewayToken(imported.value?.token, now())) {
				return createOAuthCredential(imported.value.token, now());
			}
			throw new GatewayAuthError("expired-token", `The OpenCode Cloudflare token has expired. Refresh OpenCode auth, then run /login ${PROVIDER_ID}.`);
		},
		async toAuth(credential): Promise<AuthResult["auth"]> {
			const token = GatewayToken.parse(credential.access);
			if (!token) {
				throw new GatewayAuthError("missing-token", "Stored OpenCode Cloudflare credential did not contain a token");
			}
			return toGatewayModelAuth(token);
		},
	};
}

/**
 * Create the provider-owned auth methods for `/login` and request resolution.
 *
 * @param authSource - OpenCode auth-file lookup.
 * @param loadAuthCommand - Load the discovery-document login command.
 * @param now - Clock used for expiry interpretation.
 */
export function createGatewayProviderAuth(
	authSource: OpenCodeAuthSource,
	loadAuthCommand: (signal: AbortSignal) => Promise<string | readonly string[] | undefined>,
	now: () => number = () => Date.now(),
): ProviderAuth {
	return {
		apiKey: createApiKeyAuth(authSource, now),
		oauth: createGatewayOAuthAuth(authSource, loadAuthCommand, now),
	};
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
