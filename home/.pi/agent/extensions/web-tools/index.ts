import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveRequestAuth } from "./auth.ts";
import { discoverHeliumProfiles } from "./profiles.ts";
import { loadActiveWebIdentity, saveActiveWebIdentity } from "./profile-state.ts";
import { formatWebProfileStatus, resolveSelectedProfile, showWebProfilePicker } from "./profile-ui.ts";
import type { ActiveWebIdentity, WebProfile } from "./types.ts";
import { createWebFetchTool } from "./webfetch.ts";
import { createWebSearchTool } from "./websearch.ts";

export default function webToolsExtension(pi: ExtensionAPI) {
	let activeIdentity: ActiveWebIdentity = { kind: "public" };
	let discoveredProfiles: WebProfile[] = [];
	let activeProfile: WebProfile | undefined;

	const refreshStatus = (ctx: ExtensionContext) => {
		ctx.ui.setStatus("web", formatWebProfileStatus(activeIdentity));
	};

	const refreshProfiles = async () => {
		discoveredProfiles = await discoverHeliumProfiles();
		activeProfile = resolveSelectedProfile(activeIdentity, discoveredProfiles);
		if (activeIdentity.kind === "helium" && activeProfile) {
			activeIdentity = {
				kind: "helium",
				profileId: activeProfile.profileId,
				displayName: activeProfile.displayName,
				userDataDir: activeProfile.userDataDir,
			};
		}
	};

	const applyIdentity = async (identity: ActiveWebIdentity, ctx: ExtensionContext) => {
		activeIdentity = identity;
		activeProfile = resolveSelectedProfile(activeIdentity, discoveredProfiles);
		if (activeIdentity.kind === "helium" && activeProfile) {
			activeIdentity = {
				kind: "helium",
				profileId: activeProfile.profileId,
				displayName: activeProfile.displayName,
				userDataDir: activeProfile.userDataDir,
			};
		}
		if (activeIdentity.kind === "helium" && !activeProfile) {
			activeIdentity = { kind: "public" };
		}
		await saveActiveWebIdentity(activeIdentity);
		refreshStatus(ctx);
	};

	pi.registerTool(createWebFetchTool({
		resolveAuth: async (url, signal) => resolveRequestAuth(activeIdentity, url, activeProfile, {}, signal),
	}));
	pi.registerTool(createWebSearchTool());

	pi.registerCommand("web-profile", {
		description: "Select the webfetch authentication source",
		handler: async (_args, ctx) => {
			await refreshProfiles();
			const selection = await showWebProfilePicker(ctx, activeIdentity, discoveredProfiles);
			if (!selection) return;
			await applyIdentity(selection, ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		activeIdentity = await loadActiveWebIdentity();
		await refreshProfiles();
		if (activeIdentity.kind === "helium" && !activeProfile) {
			activeIdentity = { kind: "public" };
			await saveActiveWebIdentity(activeIdentity);
		}
		refreshStatus(ctx);
	});
}
