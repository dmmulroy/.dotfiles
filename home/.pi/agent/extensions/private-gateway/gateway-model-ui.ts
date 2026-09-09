import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, SettingsList, Text, matchesKey, type Component, type SettingItem, type SettingsListTheme, truncateToWidth } from "@earendil-works/pi-tui";
import { buildGatewayModelRows, GatewayFilterDraft } from "./gateway-model-selection.ts";
import type { GatewayInspection } from "./gateway-diagnostics.ts";
import type { GatewayModelFilter } from "./gateway-profile.ts";
import { gatewayDisplayText } from "./gateway-result.ts";

type ModelView = "all" | "only here" | "shared" | "unknown";

/** Build a searchable stock SettingsList; only Ctrl+S returns a draft, Escape discards it. */
export function createGatewayModelEditor(options: {
	readonly inspection: GatewayInspection;
	readonly comparison?: GatewayInspection;
	readonly theme: SettingsListTheme;
	readonly heading: (text: string) => string;
	readonly render: () => void;
	readonly done: (filter: GatewayModelFilter | undefined) => void;
}): Component {
	const rows = buildGatewayModelRows(options.inspection, options.comparison);
	const draft = new GatewayFilterDraft(options.inspection.profile.models);
	let view: ModelView = "all";
	let list: SettingsList;
	const container = new Container();
	const rebuild = () => {
		container.clear();
		container.addChild(new Text(options.heading(`Models: ${gatewayDisplayText(options.inspection.profile.name)}`), 1, 0));
		container.addChild(new Text("Space/Enter: cycle · Ctrl+S: review/save · Esc: discard · Type to search", 1, 0));
		container.addChild(new Text("inherit = visible in all mode, hidden in selected mode. Shared models can still be selected for a specific route.", 1, 0));
		if (options.inspection.inventory.some((entry) => entry.status === "unavailable") || options.comparison?.inventory.some((entry) => entry.status === "unavailable")) {
			container.addChild(new Text("Partial inventory: unknown does not mean absent. Existing saved IDs are preserved.", 1, 0));
		}
		const items: SettingItem[] = [
			{ id: "control:mode", label: "Include mode", currentValue: draft.getMode(), values: ["all", "selected"] },
			{ id: "control:view", label: "Comparison view", currentValue: view, values: ["all", "only here", "shared", "unknown"] },
			...rows.values().filter((row) => view === "all" || row.badge === view).map((row): SettingItem => ({
				id: `model:${row.id}`,
				label: gatewayDisplayText(`${row.id} [${row.badge}]${row.listed ? "" : " [saved/declared, not live-listed]"}`),
				description: row.backends.join(", "), currentValue: draft.getSelection(row.id), values: ["inherit", "include", "exclude"],
			})),
		];
		list = new SettingsList(items, 12, options.theme, (id, value) => {
			if (id === "control:mode" && (value === "all" || value === "selected")) draft.setMode(value);
			else if (id === "control:view" && (value === "all" || value === "only here" || value === "shared" || value === "unknown")) { view = value; rebuild(); }
			else if (id.startsWith("model:") && (value === "inherit" || value === "include" || value === "exclude")) draft.setSelection(id.slice(6), value);
			options.render();
		}, () => options.done(undefined), { enableSearch: true });
		container.addChild(list);
	};
	rebuild();
	return {
		render: (width) => width < 12 ? [truncateToWidth("Widen terminal", Math.max(0, width))] : container.render(width).map((line) => truncateToWidth(line, width)),
		invalidate: () => { rebuild(); container.invalidate(); },
		handleInput(data) {
			if (matchesKey(data, "ctrl+s")) options.done(draft.toFilter());
			else list.handleInput(data);
			options.render();
		},
	};
}

/** A cancellable UI task whose AbortSignal owns every discovery/model-list request. */
export async function runGatewayUiTask<T>(ctx: ExtensionCommandContext, title: string, run: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
	return ctx.ui.custom<T | undefined>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, title);
		const lifetime = new AbortController();
		let settled = false;
		const finish = (value: T | undefined) => { if (!settled) { settled = true; done(value); } };
		loader.onAbort = () => { lifetime.abort(); finish(undefined); };
		run(AbortSignal.any([loader.signal, lifetime.signal, AbortSignal.timeout(60_000)])).then(finish).catch(() => {
			if (!settled) {
				ctx.ui.notify("Private gateway operation failed; no configuration was changed.", "error");
				finish(undefined);
			}
		});
		return {
			render: (width: number) => loader.render(width),
			handleInput: (data: string) => loader.handleInput(data),
			invalidate: () => loader.invalidate(),
			dispose: () => { settled = true; lifetime.abort(); loader.dispose(); },
		};
	});
}
