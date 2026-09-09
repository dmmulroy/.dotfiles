import { spawn } from "node:child_process";
import type { Credential, ModelAuth, OAuthCredential, ProviderAuth } from "@earendil-works/pi-ai";
import type { GatewayProfile } from "./gateway-profile.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** Access authentication failures never retain command output or raw credentials. */
export class GatewayAccessError extends Error {
	readonly _tag = "GatewayAccessError" as const;
	/** Stable reason for safe diagnostics and login recovery. */
	constructor(readonly reason: "missing" | "invalid" | "expired" | "cancelled" | "environment" | "command" | "timeout" | "output-limit") {
		super(`Private gateway authentication: ${reason}. Use /login for this profile when authentication is missing or expired.`);
	}
}

/** Redacted Access token with expiry inspection, not local JWT signature verification. */
export class GatewayAccessToken {
	readonly #value: string;
	private constructor(value: string, readonly expiresAt: number | undefined) { this.#value = value; }
	/** Parse raw secret input; known JWT expiries include a five-minute safety margin. */
	static parse(input: unknown, now: number): GatewayResult<GatewayAccessToken, GatewayAccessError> {
		if (input === undefined || input === "") return gatewayFailure(new GatewayAccessError("missing"));
		if (typeof input !== "string" || !/^[\x21-\x7e]+$/.test(input.trim())) return gatewayFailure(new GatewayAccessError("invalid"));
		const value = input.trim();
		let expiresAt: number | undefined;
		const payload = value.split(".")[1];
		if (payload) {
			try {
				const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
				if (typeof decoded === "object" && decoded !== null && "exp" in decoded) {
					if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp * 1000)) return gatewayFailure(new GatewayAccessError("invalid"));
					expiresAt = decoded.exp * 1000 - 300_000;
				}
			} catch { /* Opaque tokens have no inspectable expiry. */ }
		}
		return expiresAt !== undefined && expiresAt <= now ? gatewayFailure(new GatewayAccessError("expired")) : gatewaySuccess(new GatewayAccessToken(value, expiresAt));
	}
	/** Unwrap only at a Pi credential or HTTP boundary. */
	reveal(): string { return this.#value; }
	/** Safe string projection. */
	toString(): string { return "<redacted>"; }
	/** Safe JSON projection. */
	toJSON(): string { return "<redacted>"; }
	/** Safe Node inspection projection. */
	[Symbol.for("nodejs.util.inspect.custom")](): string { return "<redacted>"; }
	/** Remove this token from finalized diagnostic text. */
	redact(text: string): string { return text.replaceAll(this.#value, "<redacted>"); }
	/** Compare tokens without exposing their raw values to observers. */
	equals(other: GatewayAccessToken): boolean { return this.#value === other.#value; }
}

/** Inspect an effective Pi credential without reading or modifying Pi's credential store. */
export function gatewayCredentialToken(credential: Credential | undefined, now: number): GatewayResult<GatewayAccessToken, GatewayAccessError> {
	if (credential?.type === "oauth" && (!Number.isFinite(credential.expires) || credential.expires <= now)) return gatewayFailure(new GatewayAccessError("expired"));
	return GatewayAccessToken.parse(credential?.type === "oauth" ? credential.access : credential?.key, now);
}

/** Locally owned, cancellable login; discovery never supplies executable code. */
export async function loginGatewayAccess(profile: GatewayProfile, signal: AbortSignal, now: () => number = () => Date.now()): Promise<GatewayResult<GatewayAccessToken, GatewayAccessError>> {
	if (signal.aborted) return gatewayFailure(new GatewayAccessError("cancelled"));
	return new Promise((resolve) => {
		const child = spawn("cloudflared", ["access", "login", `-app=${profile.authOrigin}`], { shell: false, stdio: ["ignore", "pipe", "ignore"] });
		const chunks: Buffer[] = [];
		let size = 0;
		let reason: "cancelled" | "timeout" | "output-limit" | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const stop = () => {
			child.kill("SIGTERM");
			killTimer ??= setTimeout(() => child.kill("SIGKILL"), 1_000);
		};
		const abort = () => { reason = "cancelled"; stop(); };
		const timeout = setTimeout(() => { reason = "timeout"; stop(); }, 300_000);
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
		child.stdout.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > 65_536) { reason = "output-limit"; stop(); } else chunks.push(chunk);
		});
		const finish = (result: GatewayResult<GatewayAccessToken, GatewayAccessError>) => {
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			signal.removeEventListener("abort", abort);
			resolve(result);
		};
		child.once("error", () => finish(gatewayFailure(new GatewayAccessError("command"))));
		child.once("close", (code) => finish(reason ? gatewayFailure(new GatewayAccessError(reason))
			: code !== 0 ? gatewayFailure(new GatewayAccessError("command"))
			: GatewayAccessToken.parse(Buffer.concat(chunks).toString("utf8"), now())));
	});
}

/** Build native Pi auth; current Pi needs apiKey retained for authenticated model refresh. */
export function createGatewayAccessAuth(
	profile: GatewayProfile,
	options: {
		readonly now: () => number;
		readonly remember: (token: GatewayAccessToken) => void;
		readonly login?: typeof loginGatewayAccess;
	},
): ProviderAuth {
	const toAuth = (token: GatewayAccessToken): ModelAuth => {
		options.remember(token);
		const value = token.reveal();
		return { apiKey: value, headers: { Authorization: `Bearer ${value}`, "cf-access-token": value, "X-Requested-With": "xmlhttprequest", "x-api-key": null } };
	};
	const credential = (token: GatewayAccessToken): OAuthCredential => {
		options.remember(token);
		return { type: "oauth", access: token.reveal(), refresh: "", expires: token.expiresAt ?? options.now() + 43_200_000 };
	};
	return {
		apiKey: {
			name: `${profile.name} Access token`,
			async login(interaction) {
				interaction.signal.throwIfAborted();
				const parsed = GatewayAccessToken.parse(await interaction.prompt({ type: "secret", message: "Enter this profile's Access token" }), options.now());
				interaction.signal.throwIfAborted();
				if (!parsed.ok) throw parsed.error;
				options.remember(parsed.value);
				return { type: "api_key", key: parsed.value.reveal() };
			},
			async resolve({ credential, ctx, signal }) {
				signal.throwIfAborted();
				const stored = gatewayCredentialToken(credential, options.now());
				if (stored.ok) return { auth: toAuth(stored.value), source: "Pi credential" };
				if (!profile.tokenEnvironmentVariable) return undefined;
				let raw: string | undefined;
				try { raw = await ctx.env(profile.tokenEnvironmentVariable); }
				catch { throw new GatewayAccessError("environment"); }
				signal.throwIfAborted();
				const environment = GatewayAccessToken.parse(raw, options.now());
				return environment.ok ? { auth: toAuth(environment.value), source: profile.tokenEnvironmentVariable } : undefined;
			},
		},
		oauth: {
			name: profile.name,
			async login(interaction) {
				interaction.notify({ type: "progress", message: "Complete gateway login in your browser." });
				const result = await (options.login ?? loginGatewayAccess)(profile, interaction.signal, options.now);
				if (!result.ok) throw result.error;
				return credential(result.value);
			},
			async refresh(_credential, signal) {
				signal.throwIfAborted();
				// Access has no refresh-token exchange; never open a browser in an agent turn.
				throw new GatewayAccessError("expired");
			},
			async toAuth(credential) {
				const token = gatewayCredentialToken(credential, options.now());
				if (!token.ok) throw token.error;
				return toAuth(token.value);
			},
		},
	};
}
