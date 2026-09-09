import type { GatewayAccessToken } from "./gateway-auth.ts";
import { GatewayAccessToken as AccessToken } from "./gateway-auth.ts";
import { parseGatewaySettings, type GatewayProfile } from "./gateway-profile.ts";
import type { GatewayHttp, GatewayRequestUrl } from "./gateway-http.ts";
import { GatewayRequestError } from "./gateway-http.ts";
import { gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** Fictional profile parsed through the production boundary; never copy live profiles into tests. */
export function exampleGatewayProfile(id = "example", models = {}): GatewayProfile {
	const result = parseGatewaySettings({ profiles: [{ id, name: "Example gateway", authOrigin: `https://${id}.test`, inferenceOrigin: `https://inference-${id}.test`, models }] });
	if (!result.ok || !result.value.profiles[0]) throw new Error("Test fixture profile invalid");
	return result.value.profiles[0];
}
/** Opaque test credential with the same redacted representation as production tokens. */
export function exampleGatewayToken(value = "test-access-token-not-a-real-secret"): GatewayAccessToken {
	const result = AccessToken.parse(value, 0);
	if (!result.ok) throw result.error;
	return result.value;
}
/** Recording implementation of the shared HTTP capability; no module-level fetch replacement. */
export class RecordingGatewayHttp implements GatewayHttp {
	readonly requests: { url: string; operation: string; token: GatewayAccessToken | undefined; headers: Readonly<Record<string, string>> | undefined }[] = [];
	/** Callback controls a protocol response or a safely classified failure. */
	constructor(readonly respond: (url: URL, operation: GatewayRequestError["operation"]) => unknown | GatewayRequestError) {}
	/** Preserve cancellation and record the application-visible request. */
	async getJson(url: GatewayRequestUrl, operation: GatewayRequestError["operation"], options: { signal: AbortSignal; token?: GatewayAccessToken; headers?: Readonly<Record<string, string>> }): Promise<GatewayResult<unknown, GatewayRequestError>> {
		if (options.signal.aborted) return gatewayFailure(new GatewayRequestError("cancelled", operation));
		this.requests.push({ url, operation, token: options.token, headers: options.headers });
		const result = this.respond(new URL(url), operation);
		return result instanceof GatewayRequestError ? gatewayFailure(result) : gatewaySuccess(result);
	}
}
