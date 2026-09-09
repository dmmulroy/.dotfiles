import type { GatewayInspection } from "./gateway-diagnostics.ts";
import type { GatewayBackend } from "./gateway-discovery.ts";
import { gatewayDeclaredInventory } from "./gateway-inventory.ts";
import type { GatewayModelFilter } from "./gateway-profile.ts";

/** UI comparison badges preserve unknown coverage rather than treating failures as absence. */
export type GatewayModelBadge = "shared" | "only here" | "unknown" | "not compared";
/** One request-ID setting; duplicate route identities are grouped because profile filters are ID-based. */
export interface GatewayModelRow {
	readonly id: string;
	readonly backends: readonly string[];
	readonly badge: GatewayModelBadge;
	readonly listed: boolean;
}

/** Build rows from live and declared models plus saved IDs, so failures never erase saved selections. */
export function buildGatewayModelRows(inspection: GatewayInspection, comparison: GatewayInspection | undefined): readonly GatewayModelRow[] {
	const rows = new Map<string, { id: string; backends: Set<string>; badges: Set<GatewayModelBadge>; listed: boolean }>();
	const add = (id: string, backend: string, badge: GatewayModelBadge, listed: boolean) => {
		const row = rows.get(id) ?? { id, backends: new Set<string>(), badges: new Set<GatewayModelBadge>(), listed: false };
		row.backends.add(backend); row.badges.add(badge); row.listed ||= listed;
		rows.set(id, row);
	};
	const compared = new Map(comparison?.inventory.map((entry) => [entry.backend, {
		complete: entry.status !== "unavailable", ids: new Set(entry.status === "listed" ? entry.models.map((model) => model.id) : []),
	}]));
	if (comparison) for (const entry of gatewayDeclaredInventory(comparison.discovery)) {
		if (entry.status !== "listed") continue;
		const coverage = compared.get(entry.backend) ?? { complete: false, ids: new Set<string>() };
		for (const model of entry.models) coverage.ids.add(model.id);
		compared.set(entry.backend, coverage);
	}
	const comparisonBadge = (id: string, backend: GatewayBackend): GatewayModelBadge => {
		if (!comparison) return "not compared";
		const coverage = compared.get(backend);
		return coverage?.ids.has(id) ? "shared" : coverage?.complete ? "only here" : "unknown";
	};
	for (const entry of inspection.inventory) {
		if (entry.status !== "listed") continue;
		for (const model of entry.models) add(model.id, entry.backend, comparisonBadge(model.id, entry.backend), true);
	}
	for (const entry of gatewayDeclaredInventory(inspection.discovery)) {
		if (entry.status !== "listed") continue;
		for (const model of entry.models) add(model.id, entry.backend, comparisonBadge(model.id, entry.backend), false);
	}
	for (const id of [...inspection.profile.models.include ?? [], ...inspection.profile.models.exclude ?? []]) {
		if (!rows.has(id)) add(id, "saved", "unknown", false);
	}
	return rows.values().map((row): GatewayModelRow => ({
		id: row.id, backends: [...row.backends].sort(), listed: row.listed,
		badge: row.badges.has("unknown") ? "unknown" : row.badges.has("shared") ? "shared" : row.badges.has("only here") ? "only here" : "not compared",
	})).toArray().sort((a, b) => a.id.localeCompare(b.id));
}

/** Detached edit state. Changes do not affect live providers or disk until explicit review and save. */
export class GatewayFilterDraft {
	private mode: "all" | "selected";
	private readonly included: Set<string>;
	private readonly excluded: Set<string>;
	/** Preserve configured IDs even when they are absent from a partial inventory. */
	constructor(filter: GatewayModelFilter) {
		this.mode = filter.include === undefined ? "all" : "selected";
		this.included = new Set(filter.include ?? []);
		this.excluded = new Set(filter.exclude ?? []);
	}
	/** All mode includes future models by default; selected mode is an explicit allowlist. */
	getMode(): "all" | "selected" { return this.mode; }
	/** Changing modes never implicitly selects the entire visible or searched subset. */
	setMode(mode: "all" | "selected"): void { this.mode = mode; }
	/** Exclude wins if the original file contains an ID in both lists. */
	getSelection(id: string): "inherit" | "include" | "exclude" {
		return this.excluded.has(id) ? "exclude" : this.included.has(id) ? "include" : "inherit";
	}
	/** Set a request-ID decision without affecting other IDs or gateway profiles. */
	setSelection(id: string, decision: "inherit" | "include" | "exclude"): void {
		this.included.delete(id); this.excluded.delete(id);
		if (decision === "include") this.included.add(id);
		if (decision === "exclude") this.excluded.add(id);
	}
	/** Produce only declarative include/exclude fields; empty allowlists remain intentionally empty. */
	toFilter(): GatewayModelFilter {
		const exclude = [...this.excluded].sort();
		return this.mode === "selected" ? { include: [...this.included].sort(), exclude } : { exclude };
	}
}
