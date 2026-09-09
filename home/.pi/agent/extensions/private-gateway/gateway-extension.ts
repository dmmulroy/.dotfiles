import { getAgentDir, SettingsManager, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { GatewayAccessError, GatewayAccessToken } from "./gateway-auth.ts";
import { NativeGatewayCatalog } from "./gateway-catalog.ts";
import { HttpGatewayDiscovery } from "./gateway-discovery.ts";
import { FetchGatewayHttp } from "./gateway-http.ts";
import { GatewayInspector, type GatewayInspection } from "./gateway-diagnostics.ts";
import { HttpGatewayInventory } from "./gateway-inventory.ts";
import { createGatewayModelEditor, runGatewayUiTask } from "./gateway-model-ui.ts";
import { buildGatewayProvider, type GatewayProviderHandle } from "./gateway-provider.ts";
import { gatewayDisplayText, gatewayFailure, gatewaySuccess, type GatewayResult } from "./gateway-result.ts";
import { gatewaySettingsPath, readGatewaySettings, saveGatewayModelFilter, type GatewaySettingsSnapshot } from "./gateway-settings.ts";
import type { GatewayProfile } from "./gateway-profile.ts";

async function inspectFromPi(profile: GatewayProfile, ctx: ExtensionContext, inspector: GatewayInspector, signal: AbortSignal): Promise<GatewayResult<GatewayInspection, Error>> {
	try {
		signal.throwIfAborted();
		const auth = await ctx.modelRegistry.getProviderAuth(profile.id);
		signal.throwIfAborted();
		const token = GatewayAccessToken.parse(auth?.auth.apiKey, Date.now());
		if (!token.ok) return token;
		return inspector.inspect(profile, token.value, signal);
	} catch { return gatewayFailure(new GatewayAccessError("missing")); }
}

function sameProfiles(snapshot: GatewaySettingsSnapshot, other: GatewaySettingsSnapshot): boolean {
	return snapshot.settings.profiles.length === other.settings.profiles.length && snapshot.settings.profiles.every((profile) => {
		const next = other.settings.profiles.find((candidate) => candidate.id === profile.id);
		return next?.authOrigin === profile.authOrigin && next.inferenceOrigin === profile.inferenceOrigin && next.name === profile.name && next.tokenEnvironmentVariable === profile.tokenEnvironmentVariable;
	});
}

async function pickProfile(profiles: readonly GatewayProfile[], ctx: ExtensionCommandContext, id?: string): Promise<GatewayProfile | undefined> {
	if (id) {
		const profile = profiles.find((profile) => profile.id === id);
		if (!profile) ctx.ui.notify("Private gateway profile not found. Use a configured profile ID.", "error");
		return profile;
	}
	const labels = profiles.map((profile) => `${profile.id} — ${gatewayDisplayText(profile.name)}`);
	const selected = await ctx.ui.select("Choose a private gateway", labels);
	return profiles.find((_profile, index) => labels[index] === selected);
}

async function restoreGatewayDefault(pi: ExtensionAPI, ctx: ExtensionContext, profiles: readonly GatewayProfile[]): Promise<void> {
	if (ctx.model) return;
	const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
	const providerId = settings.getDefaultProvider(), modelId = settings.getDefaultModel();
	if (!providerId || !modelId || !profiles.some((profile) => profile.id === providerId)) return;
	try {
		const refreshed = await ctx.modelRegistry.refresh({ providers: [providerId], allowNetwork: false, signal: AbortSignal.timeout(5_000) });
		const model = ctx.modelRegistry.find(providerId, modelId);
		if (refreshed.aborted || refreshed.errors.has(providerId) || !model || !(await pi.setModel(model))) return;
		pi.setThinkingLevel(settings.getDefaultThinkingLevel() ?? "off");
	} catch {
		// Startup recovery is best-effort and intentionally silent; explicit commands own diagnostics.
	}
}

/** Register configured private gateway providers; an optional path supports isolated tests. */
export async function registerGateway(pi: ExtensionAPI, path: string = gatewaySettingsPath()): Promise<void> {
	const loaded = await readGatewaySettings(path);
	if (!loaded.ok) throw loaded.error;
	if (!loaded.value || loaded.value.settings.profiles.length === 0) return;
	let snapshot = loaded.value;
	const http = new FetchGatewayHttp();
	const discovery = new HttpGatewayDiscovery(http);
	const inventory = new HttpGatewayInventory(http);
	const catalog = new NativeGatewayCatalog(inventory);
	const inspector = new GatewayInspector(discovery, inventory);
	const handles = new Map<string, GatewayProviderHandle>();
	for (const profile of snapshot.settings.profiles) {
		const handle = buildGatewayProvider(profile, { discovery, catalog, now: () => Date.now() });
		handles.set(profile.id, handle);
		pi.registerProvider(handle.provider);
	}
	pi.on("session_start", async (_event, ctx) => restoreGatewayDefault(pi, ctx, snapshot.settings.profiles));
	pi.on("message_end", async (event) => {
		const message = event.message;
		if (message.role !== "assistant" || (message.stopReason !== "error" && message.stopReason !== "aborted") || !message.errorMessage) return;
		const handle = handles.get(message.provider);
		if (!handle) return;
		const errorMessage = handle.sanitizeError(message.errorMessage);
		if (errorMessage !== message.errorMessage) return { message: { ...message, errorMessage } };
	});

	pi.registerCommand("private-gateway-doctor", {
		description: "Inspect private gateway credentials, live backend coverage, and catalog warnings",
		handler: async (args, ctx) => {
			const profiles = args.trim() ? snapshot.settings.profiles.filter((profile) => profile.id === args.trim()) : snapshot.settings.profiles;
			if (!profiles.length) { ctx.ui.notify("Private gateway profile not found.", "error"); return; }
			const failures = (await Promise.all(profiles.map(async (profile) => {
				const inspected = await inspectFromPi(profile, ctx, inspector, AbortSignal.timeout(60_000));
				return inspected.ok ? undefined : `${profile.name}: ${inspected.error.message}`;
			}))).filter((failure): failure is string => failure !== undefined);
			if (failures.length) ctx.ui.notify(`Private gateway check failed:\n${failures.join("\n")}`, "error");
			else ctx.ui.notify(`Private gateways ready (${profiles.length} profile${profiles.length === 1 ? "" : "s"}).`, "info");
		},
	});

	pi.registerCommand("private-gateway-models", {
		description: "Browse, compare, and save a private gateway's include/exclude model filters",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") { ctx.ui.notify("Private gateway model editor requires TUI mode; use the read-only CLI for JSON inventories.", "error"); return; }
			await ctx.waitForIdle();
			const latest = await readGatewaySettings(path);
			if (!latest.ok) { ctx.ui.notify(latest.error.message, "error"); return; }
			if (!latest.value || !sameProfiles(snapshot, latest.value)) { ctx.ui.notify("Private gateway profiles changed. Run /reload before editing filters.", "warning"); return; }
			const editing = latest.value;
			const profile = await pickProfile(editing.settings.profiles, ctx, args.trim() || undefined);
			if (!profile) return;
			const others = editing.settings.profiles.filter((other) => other.id !== profile.id);
			const comparisonId = others.length ? await ctx.ui.select("Compare model availability with", ["No comparison", ...others.map((profile) => profile.id)]) : "No comparison";
			if (!comparisonId) return;
			const compareProfile = others.find((profile) => profile.id === comparisonId);
			const inspected = await runGatewayUiTask(ctx, "Loading live private gateway model lists…", async (signal) => {
				const [primary, comparison] = await Promise.all([
					inspectFromPi(profile, ctx, inspector, signal),
					compareProfile ? inspectFromPi(compareProfile, ctx, inspector, signal) : Promise.resolve(gatewaySuccess(undefined)),
				]);
				return { primary, comparison };
			});
			if (!inspected) return;
			if (!inspected.primary.ok) { ctx.ui.notify(inspected.primary.error.message, "error"); return; }
			if (!inspected.comparison.ok) { ctx.ui.notify(inspected.comparison.error.message, "error"); return; }
			const primary = inspected.primary.value;
			const comparison = inspected.comparison.value;
			const filter = await ctx.ui.custom<import("./gateway-profile.ts").GatewayModelFilter | undefined>((tui, theme, _keybindings, done) =>
				createGatewayModelEditor({
					inspection: primary, ...(comparison ? { comparison } : {}),
					theme: {
						label: (text, selected) => theme.fg(selected ? "accent" : "text", text),
						value: (text) => theme.fg("success", text), description: (text) => theme.fg("muted", text),
						cursor: theme.fg("accent", "› "), hint: (text) => theme.fg("dim", text),
					},
					heading: (text) => theme.fg("accent", text), render: () => tui.requestRender(), done,
				}),
			);
			if (!filter) return;
			const confirmed = await ctx.ui.confirm(`Save filters for ${profile.id}?`, `${JSON.stringify(filter, null, 2)}\n\nOnly this profile's filters change. Shared models remain selectable; this does not change gateway behavior.`);
			if (!confirmed) return;
			const saved = await saveGatewayModelFilter(editing, profile.id, filter, AbortSignal.timeout(5_000));
			if (!saved.ok) { ctx.ui.notify(saved.error.message, "error"); return; }
			snapshot = saved.value;
			for (const profile of snapshot.settings.profiles) handles.get(profile.id)?.setModelFilter(profile.models);
			try {
				const refreshed = await ctx.modelRegistry.refresh({ providers: [...handles.keys()], allowNetwork: false, signal: AbortSignal.timeout(5_000) });
				ctx.ui.notify(refreshed.aborted || refreshed.errors.size ? "Filters saved. Run /reload to resynchronize Pi's model picker." : "Private gateway filters saved and applied to cached models. Other running agents adopt them on /reload.", "info");
			} catch { ctx.ui.notify("Filters saved, but Pi's model picker could not refresh. Run /reload.", "warning"); }
		},
	});
}
