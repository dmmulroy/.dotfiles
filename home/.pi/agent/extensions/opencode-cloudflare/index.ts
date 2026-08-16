import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { PROVIDER_ID } from "./constants.ts";
import { buildDoctorReport } from "./doctor.ts";
import { createOpencodeCloudflareProvider } from "./provider.ts";
import { createGatewayMessageEndHandler } from "./redact-gateway-secrets.ts";

async function handleDoctor(ctx: ExtensionCommandContext): Promise<void> {
	const status = ctx.modelRegistry.getProviderAuthStatus(PROVIDER_ID);
	const report = await buildDoctorReport({
		piAuthStatus: status.configured ? status.source ?? status.label ?? "configured" : "missing",
	});
	ctx.ui.notify(report, "info");
}

/**
 * Register the OpenCode Cloudflare provider, doctor command, and error redaction.
 *
 * @param pi - Pi extension API.
 */
export default function registerOpencodeCloudflare(pi: ExtensionAPI): void {
	pi.registerProvider(createOpencodeCloudflareProvider());
	pi.on("message_end", createGatewayMessageEndHandler());
	pi.registerCommand("opencode-cf-doctor", {
		description: "Validate OpenCode Cloudflare authentication and gateway health",
		handler: async (_args, ctx) => handleDoctor(ctx),
	});
}
