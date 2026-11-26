/** Shared result and decision types for the Cloudflare deployment guard. */

export type Result<T, E> =
	| { readonly _tag: "ok"; readonly value: T }
	| { readonly _tag: "err"; readonly error: E };

/**
 * A deployment-guard error suitable for a Pi BLOCKED reason. `confirmable` errors mean the guard could not
 * resolve something (a dynamic argument, an unreadable script) and the user may approve the command once;
 * the rest are definite denials (an unlisted Worker, a destroy) that only a policy edit can lift.
 */
export class CloudflareDeploymentBlocked extends Error {
	/** Stable error discriminator for Cloudflare deployment guard decisions. */
	readonly _tag = "CloudflareDeploymentBlocked" as const;

	/** Creates an actionable BLOCKED reason from a safe deployment-policy detail. */
	constructor(
		readonly detail: string,
		readonly confirmable = true,
	) {
		super(`BLOCKED: Cloudflare deployment guard: ${detail}`);
	}
}

/** Observable decision for one agent bash command under the global deployment allowlist. */
export type CloudflareDeploymentDecision =
	| { readonly _tag: "allow"; readonly reason: string }
	| { readonly _tag: "block"; readonly reason: string; readonly confirmable: boolean }
	| { readonly _tag: "unrelated" };

/** An uncertain-resolution error: the user may approve it once. */
export function blocked<T>(detail: string): Result<T, CloudflareDeploymentBlocked> {
	return { _tag: "err", error: new CloudflareDeploymentBlocked(detail) };
}

/** A definite denial that only a policy edit outside the agent session can lift. */
export function denied<T>(detail: string): Result<T, CloudflareDeploymentBlocked> {
	return { _tag: "err", error: new CloudflareDeploymentBlocked(detail, false) };
}

/** Converts a guard error to a block decision. */
export function blockDecision(error: CloudflareDeploymentBlocked): CloudflareDeploymentDecision {
	return { _tag: "block", reason: error.message, confirmable: error.confirmable };
}

/** A block decision for an uncertain resolution. */
export function uncertainDecision(detail: string): CloudflareDeploymentDecision {
	return blockDecision(new CloudflareDeploymentBlocked(detail));
}

/** A block decision for a definite denial. */
export function denialDecision(detail: string): CloudflareDeploymentDecision {
	return blockDecision(new CloudflareDeploymentBlocked(detail, false));
}

export function isStringRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Localized text heuristic for commands the guard cannot parse or see into (a dynamic command name, a
 * script piped into a shell). Hyphenated names such as `cf-twitch` and `deploy-production.sh` do not count.
 */
export function mentionsCloudflareDeploymentText(text: string): boolean {
	return /(?<![\w-])(?:wrangler|cf|alchemy)(?![\w-])[\s\S]*?(?<![\w-])(?:deploy|publish|destroy|delete)(?![\w-])/i.test(
		text,
	);
}

/** Task names that may deploy or destroy; resolution failures for them block. */
export function isDeploymentTaskName(taskName: string): boolean {
	return /deploy|destroy/i.test(taskName);
}
