import type { AuthResult } from "@earendil-works/pi-ai";
import type { ExtensionContext, MessageEndEvent } from "@earendil-works/pi-coding-agent";
import { PROVIDER_ID } from "./constants.ts";

const BEARER_PREFIX = /^Bearer\s+/i;

/** Replacement returned to Pi when a finalized assistant error is rewritten. */
export interface GatewayMessageEndResult {
	readonly message: MessageEndEvent["message"];
}

/**
 * Remove request secrets from a diagnostic string.
 *
 * @param text - Error or status text that may contain a token.
 * @param secrets - Request tokens to remove.
 */
export function sanitizeGatewaySecretText(text: string, secrets: readonly string[]): string {
	let sanitized = text;
	for (const secret of secrets) {
		sanitized = sanitized.replaceAll(secret, "<redacted>");
	}
	return sanitized;
}

function addGatewaySecret(secrets: Set<string>, value: string | undefined): void {
	const token = value?.replace(BEARER_PREFIX, "").trim();
	if (token && token.length >= 8) secrets.add(token);
}

/**
 * Collect Access-token material from Pi's already-resolved provider auth.
 *
 * @param auth - Result of `modelRegistry.getProviderAuth`.
 */
export function collectGatewaySecretsFromAuth(auth: AuthResult | undefined): readonly string[] {
	if (!auth) return [];
	const secrets = new Set<string>();
	addGatewaySecret(secrets, auth.auth.apiKey);
	addGatewaySecret(secrets, auth.auth.headers?.Authorization ?? undefined);
	addGatewaySecret(secrets, auth.auth.headers?.["cf-access-token"] ?? undefined);
	return [...secrets];
}

/**
 * Rewrite a finalized gateway error so persisted session text never contains an Access token.
 *
 * @param event - Pi `message_end` event.
 * @param ctx - Extension context, used to scope the rewrite to this provider.
 * @param secrets - Candidate tokens to remove.
 */
export function redactGatewayMessageEnd(
	event: MessageEndEvent,
	ctx: ExtensionContext,
	secrets: readonly string[],
): GatewayMessageEndResult | undefined {
	const message = event.message;
	if (message.role !== "assistant") return undefined;
	if (message.provider !== PROVIDER_ID && ctx.model?.provider !== PROVIDER_ID) return undefined;
	if (message.stopReason !== "error" && message.stopReason !== "aborted") return undefined;
	if (!message.errorMessage || secrets.length === 0) return undefined;
	const errorMessage = sanitizeGatewaySecretText(message.errorMessage, secrets);
	if (errorMessage === message.errorMessage) return undefined;
	return { message: { ...message, errorMessage } };
}

/**
 * Create the `message_end` handler that redacts the credential Pi already resolved.
 */
export function createGatewayMessageEndHandler(): (
	event: MessageEndEvent,
	ctx: ExtensionContext,
) => Promise<GatewayMessageEndResult | undefined> {
	return async (event, ctx) => {
		if (event.message.role !== "assistant") return undefined;
		if (event.message.provider !== PROVIDER_ID && ctx.model?.provider !== PROVIDER_ID) return undefined;
		try {
			const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER_ID);
			return redactGatewayMessageEnd(event, ctx, collectGatewaySecretsFromAuth(auth));
		} catch {
			return undefined;
		}
	};
}
