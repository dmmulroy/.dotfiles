import type { GatewayAccessToken } from "./gateway-auth.ts";
import type { GatewayBackend, GatewayDiscovery, HttpGatewayDiscovery } from "./gateway-discovery.ts";
import type { GatewayRequestError } from "./gateway-http.ts";
import type { GatewayBackendInventory, HttpGatewayInventory } from "./gateway-inventory.ts";
import type { GatewayProfile } from "./gateway-profile.ts";
import { gatewayDisplayText, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";

/** Live diagnostic snapshot, deliberately independent of Pi catalog filtering or fallback. */
export interface GatewayInspection {
	readonly profile: GatewayProfile;
	readonly discovery: GatewayDiscovery;
	readonly inventory: readonly GatewayBackendInventory[];
}

/** Shared read-only diagnostic operation for model selection, doctor, and the standalone CLI. */
export class GatewayInspector {
	/** Existing discovery and inventory capabilities own protocol validation and network safety. */
	constructor(private readonly discovery: HttpGatewayDiscovery, private readonly inventory: HttpGatewayInventory) {}
	/** Inspect advertised backend lists; this does not verify inference permission or gateway policy. */
	async inspect(profile: GatewayProfile, token: GatewayAccessToken, signal: AbortSignal, backend?: GatewayBackend): Promise<GatewayResult<GatewayInspection, GatewayRequestError>> {
		const loaded = await this.discovery.loadDiscovery(profile, token, signal);
		if (!loaded.ok) return loaded;
		const inventory = await this.inventory.listGateway(loaded.value, token, signal, backend);
		return gatewaySuccess({ profile, discovery: loaded.value, inventory });
	}
}

/** Doctor renders counts/status only, never private model IDs, credentials, or raw upstream bodies. */
export function summarizeGatewayInspection(inspection: GatewayInspection): string {
	const listed = inspection.inventory.filter((entry) => entry.status === "listed");
	const unknown = inspection.inventory.filter((entry) => entry.status === "unavailable");
	const counts = listed.map((entry) => `${entry.backend} ${entry.models.length}`).join(", ");
	const lines = [`${gatewayDisplayText(inspection.profile.name)} (${inspection.profile.id}): ${counts || "no listed backends"}`];
	if (unknown.length) lines.push(`  unknown coverage: ${unknown.map((entry) => `${entry.backend} (${entry.error.reason}${entry.error.status ? ` ${entry.error.status}` : ""})`).join(", ")}`);
	return lines.join("\n");
}
