import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { GatewayFilterDraft, buildGatewayModelRows } from "./gateway-model-selection.ts";
import { createGatewayModelEditor } from "./gateway-model-ui.ts";
import { GatewayRequestError } from "./gateway-http.ts";
import type { GatewayInspection } from "./gateway-diagnostics.ts";
import type { GatewayModelFilter } from "./gateway-profile.ts";
import { exampleGatewayProfile } from "./gateway-test-fixtures.ts";

const inspection: GatewayInspection = {
	profile: exampleGatewayProfile("example", { include: ["model-a", "saved-but-not-listed"], exclude: ["saved-excluded"] }),
	discovery: { routes: [] },
	inventory: [{ backend: "openai", status: "listed", models: [{ backend: "openai", id: "model-a", name: "Model A", metadata: {} }] }],
};

test("selection preserves unknown saved IDs and shared models remain selectable", () => {
	const comparison = { ...inspection, profile: exampleGatewayProfile("another") };
	const rows = buildGatewayModelRows(inspection, comparison);
	assert.equal(rows.find((row) => row.id === "model-a")?.badge, "shared");
	assert.equal(rows.find((row) => row.id === "saved-but-not-listed")?.badge, "unknown");
	const unknown = buildGatewayModelRows(inspection, { ...comparison, inventory: [{ backend: "openai", status: "unavailable", error: new GatewayRequestError("http", "model-list", 403) }] });
	assert.equal(unknown.find((row) => row.id === "model-a")?.badge, "unknown");
	const draft = new GatewayFilterDraft(inspection.profile.models);
	draft.setSelection("model-a", "exclude");
	assert.deepEqual(draft.toFilter(), { include: ["saved-but-not-listed"], exclude: ["model-a", "saved-excluded"] });
	draft.setMode("all");
	assert.equal(draft.toFilter().include, undefined);
	assert.deepEqual(inspection.profile.models.include, ["model-a", "saved-but-not-listed"]);
});

test("stock model editor supports explicit save/discard, preserves selections, and obeys terminal width", () => {
	let saved: GatewayModelFilter | undefined;
	let closed = false;
	const editor = createGatewayModelEditor({
		inspection, theme: { label: (text) => text, value: (text) => text, description: (text) => text, hint: (text) => text, cursor: "> " },
		heading: (text) => text, render() {}, done(filter) { saved = filter; closed = true; },
	});
	for (const width of [12, 30, 80, 120]) for (const line of editor.render(width)) assert.ok(visibleWidth(line) <= width, `${width}: ${visibleWidth(line)}`);
	editor.handleInput?.("\x1b[B"); editor.handleInput?.("\x1b[B"); editor.handleInput?.(" ");
	assert.equal(closed, false);
	editor.handleInput?.("\x13");
	assert.equal(closed, true); assert.ok(saved);
	assert.deepEqual(saved.include, ["saved-but-not-listed"]);
	assert.ok(saved.exclude?.includes("model-a"));
	const cancelled = createGatewayModelEditor({
		inspection, theme: { label: (text) => text, value: (text) => text, description: (text) => text, hint: (text) => text, cursor: "> " },
		heading: (text) => text, render() {}, done(filter) { saved = filter; },
	});
	cancelled.handleInput?.("\x1b"); assert.equal(saved, undefined);
});
