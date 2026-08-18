import { Redacted, type Redacted as RedactedValue } from "./redacted.ts";
import { failure, type Result, success } from "./result.ts";

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/** Cloudflare Access token kept redacted until an outbound request is assembled. */
export type CloudflareAccessToken = RedactedValue<string>;

/** Safe failure returned when cloudflared cannot provide an Access token. */
export class CloudflaredAccessError extends Error {
	readonly _tag = "CloudflaredAccessError" as const;

	/** Create a classified cloudflared authentication failure. */
	constructor(
		readonly reason: "missing" | "failed" | "empty",
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
		this.name = "CloudflaredAccessError";
	}
}

/** Minimal process execution capability needed for Cloudflare Access authentication. */
export interface CloudflaredExecutor {
	/** Execute cloudflared without invoking a shell. */
	execute(
		args: readonly string[],
		options: { readonly timeout: number },
	): Promise<{ readonly stdout: string; readonly stderr: string; readonly code: number }>;
}

/** Resolve cached and refreshed Cloudflare Access tokens for one application. */
export interface CloudflareAccessTokenProvider {
	/** Resolve a cached token, opening the browser when cloudflared requires approval. */
	resolveToken(): Promise<Result<CloudflareAccessToken, CloudflaredAccessError>>;
	/** Force a login after the application rejects a cached token. */
	refreshToken(): Promise<Result<CloudflareAccessToken, CloudflaredAccessError>>;
}

async function runCloudflaredTokenCommand(
	executor: CloudflaredExecutor,
	origin: string,
	command: "token" | "login",
): Promise<Result<CloudflareAccessToken, CloudflaredAccessError>> {
	let result: Awaited<ReturnType<CloudflaredExecutor["execute"]>>;
	try {
		const commandArgs = command === "login"
			? ["access", "login", "--no-verbose", `-app=${origin}`]
			: ["access", "token", `-app=${origin}`];
		result = await executor.execute(commandArgs, { timeout: AUTH_TIMEOUT_MS });
	} catch (cause) {
		return failure(
			new CloudflaredAccessError(
				"missing",
				"Cloudflare Paste authentication could not start cloudflared; install it and retry",
				cause,
			),
		);
	}

	if (result.code !== 0) {
		return failure(
			new CloudflaredAccessError(
				"failed",
				`Cloudflare Paste authentication failed with cloudflared exit status ${result.code}`,
			),
		);
	}

	const token = result.stdout.trim();
	if (!token) {
		return failure(
			new CloudflaredAccessError(
				"empty",
				"Cloudflare Paste authentication returned an empty Access token",
			),
		);
	}

	return success(Redacted.make(token));
}

/** Create a token provider backed by `cloudflared access token/login`. */
export function createCloudflareAccessTokenProvider(
	executor: CloudflaredExecutor,
	origin: string,
): CloudflareAccessTokenProvider {
	return {
		async resolveToken() {
			const cachedToken = await runCloudflaredTokenCommand(executor, origin, "token");
			if (cachedToken.ok || cachedToken.error.reason === "missing") return cachedToken;
			return runCloudflaredTokenCommand(executor, origin, "login");
		},
		refreshToken: () => runCloudflaredTokenCommand(executor, origin, "login"),
	};
}
