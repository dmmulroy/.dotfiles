import type { GatewayAccessToken } from "./gateway-auth.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

declare const urlBrand: unique symbol;
/** URL whose origin has been checked against the profile's trusted origin. */
export type GatewayRequestUrl = string & { readonly [urlBrand]: true };
/** Safe HTTP/discovery failure without raw bodies, headers, URLs, or SDK causes. */
export class GatewayRequestError extends Error {
	readonly _tag = "GatewayRequestError" as const;
	/** Classify only non-sensitive operation and status fields. */
	constructor(
		readonly reason: "http" | "network" | "timeout" | "cancelled" | "document" | "untrusted-url" | "pagination" | "body-limit",
		readonly operation: "discovery" | "remote-config" | "model-list",
		readonly status?: number,
	) { super(`Private gateway request: ${operation}: ${reason}${status === undefined ? "" : ` (HTTP ${status})`}`); }
}

/** Restrict URLs and every pagination request to the configured trust boundary. */
export function parseGatewayRequestUrl(input: string, origin: string, operation: GatewayRequestError["operation"]): GatewayResult<GatewayRequestUrl, GatewayRequestError> {
	try {
		const url = new URL(input);
		if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.hash) return gatewayFailure(new GatewayRequestError("untrusted-url", operation));
		// SAFETY: URL parsing and origin/credential checks above establish this brand.
		return gatewaySuccess(url.toString() as GatewayRequestUrl);
	} catch { return gatewayFailure(new GatewayRequestError("untrusted-url", operation)); }
}

/** Cohesive authenticated JSON-read capability shared by discovery and live inventory. */
export interface GatewayHttp {
	/** GET only; reject redirects, bound time/body size, and return safe classified failures. */
	getJson(url: GatewayRequestUrl, operation: GatewayRequestError["operation"], options: {
		readonly signal: AbortSignal;
		readonly token?: GatewayAccessToken;
		readonly headers?: Readonly<Record<string, string>>;
	}): Promise<GatewayResult<unknown, GatewayRequestError>>;
}

/** Fetch implementation that never follows authenticated redirects or reports raw upstream errors. */
export class FetchGatewayHttp implements GatewayHttp {
	/** Inject fetch for faithful recording/local-server integration tests. */
	constructor(private readonly fetchImpl: typeof fetch = fetch) {}
	/** See GatewayHttp.getJson. */
	async getJson(url: GatewayRequestUrl, operation: GatewayRequestError["operation"], options: {
		readonly signal: AbortSignal;
		readonly token?: GatewayAccessToken;
		readonly headers?: Readonly<Record<string, string>>;
	}): Promise<GatewayResult<unknown, GatewayRequestError>> {
		if (options.signal.aborted) return gatewayFailure(new GatewayRequestError("cancelled", operation));
		const timeout = AbortSignal.timeout(10_000);
		const signal = AbortSignal.any([timeout, options.signal]);
		const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
		if (options.token) {
			const token = options.token.reveal();
			headers.Authorization = `Bearer ${token}`;
			headers["cf-access-token"] = token;
			headers["X-Requested-With"] = "xmlhttprequest";
		}
		try {
			const response = await this.fetchImpl(url, { signal, redirect: "error", headers });
			if (!response.ok) {
				await response.body?.cancel().catch(() => undefined);
				return gatewayFailure(new GatewayRequestError("http", operation, response.status));
			}
			const reader = response.body?.getReader();
			if (!reader) return gatewayFailure(new GatewayRequestError("document", operation));
			let size = 0;
			const chunks: Uint8Array[] = [];
			try {
				while (true) {
					const chunk = await reader.read();
					if (chunk.done) break;
					size += chunk.value.byteLength;
					if (size > 2_097_152) return gatewayFailure(new GatewayRequestError("body-limit", operation));
					chunks.push(chunk.value);
				}
			} finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
			try { return gatewaySuccess(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
			catch { return gatewayFailure(new GatewayRequestError("document", operation)); }
		} catch {
			return gatewayFailure(new GatewayRequestError(options.signal.aborted ? "cancelled" : timeout.aborted ? "timeout" : "network", operation));
		}
	}
}
