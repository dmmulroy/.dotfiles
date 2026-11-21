import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { resolveMplTheme, toMplRenderToolDefinition } from "../index.ts";
import { MPL_DEFAULT_THEME, MPL_LIGHT_THEME, MPL_THEMES, renderChart } from "../render.ts";
import { decodeValue, MPL_AXES_METHODS } from "../replay.ts";

const outDir = mkdtempSync(join(tmpdir(), "pi-mpl-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

test("the themes include macchiato, latte, pro-slate and pro-dark", () => {
	for (const t of ["catppuccin-macchiato", "catppuccin-latte", "pro-slate", "pro-dark"]) assert.ok(MPL_THEMES.includes(t), t);
});

test("Axes allow-list has drawing methods and no private names", () => {
	for (const m of ["plot", "bar", "scatter", "hist", "set_title", "legend", "imshow", "pie"]) assert.ok(MPL_AXES_METHODS.has(m), m);
	assert.ok(![...MPL_AXES_METHODS].some((m) => m.startsWith("_") || m === "constructor"));
});

test("specs cannot reach TypeScript-private helpers, internal state or output methods", () => {
	// private in mpl's .d.ts but real functions on Axes.prototype at runtime
	for (const m of ["next", "bars", "parseBins", "lineProps", "settle", "arrowOf"]) {
		assert.ok(!MPL_AXES_METHODS.has(m), m);
		assert.throws(() => renderChart({ calls: [[m, []]] }, outDir), new RegExp(`calls\\[0\\] ${m}: unknown call`), m);
	}
	for (const m of ["spec", "set_subplotspec"]) assert.throws(() => renderChart({ calls: [[m, []]] }, outDir), /unknown call/, m);
	for (const m of ["fig.toSVG", "fig.add_subplot", "fig.subplots"]) assert.throws(() => renderChart({ calls: [[m, []]] }, outDir), /unknown call/, m);
});

test("decodeValue turns $dates, $date and $float into values", () => {
	const [d] = decodeValue({ $dates: ["2026-01-02"] }) as Date[];
	assert.equal(d?.toISOString(), "2026-01-02T00:00:00.000Z");
	assert.equal((decodeValue({ $date: "2026-01-02T03:04:05+01:00" }) as Date).toISOString(), "2026-01-02T02:04:05.000Z");
	assert.ok(Number.isNaN(decodeValue({ $float: "nan" })));
});

for (const theme of ["catppuccin-macchiato", "catppuccin-latte", "pro-slate", "pro-dark"]) {
	test(`renders a grid with dates in ${theme}`, () => {
		const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
		const out = renderChart(
			{
				theme,
				name: theme,
				format: "both",
				grid: { rows: 1, cols: 2, width_ratios: [2, 1] },
				calls: [
					["plot", [{ $dates: days }, [1, 3, 2]], { label: "a" }],
					["$concise_x", []],
					["legend", []],
					["sca", [1]],
					["bar", [["x", "y"], [2, 1]]],
					["fig.suptitle", ["t"]],
				],
			},
			outDir,
		);
		assert.deepEqual([...(out.png ?? []).slice(0, 4)], PNG_MAGIC);
		assert.equal(out.width, 1440);
		assert.equal(out.height, 840);
		assert.ok(out.pngPath && existsSync(out.pngPath));
		assert.ok(out.svgPath && readFileSync(out.svgPath, "utf8").includes("<svg"));
	});
}

test("pie and donut render in a grid with a legend", () => {
	assert.ok(MPL_AXES_METHODS.has("pie"));
	const out = renderChart(
		{
			grid: { rows: 1, cols: 2 },
			calls: [
				["pie", [[35, 25, 40]], { labels: ["a", "b", "c"], autopct: "%1.0f%%", startangle: 90, explode: [0.05, 0, 0] }],
				["sca", [1]],
				["pie", [[3, 2, 1]], { labels: ["x", "y", "z"], labeldistance: null, wedgeprops: { width: 0.4, edgecolor: { $rc: "figure.facecolor" }, linewidth: 1.5 } }],
				["legend", [], { loc: "center" }],
			],
		},
		outDir,
	);
	assert.deepEqual([...(out.png ?? []).slice(0, 4)], PNG_MAGIC);
	assert.throws(() => renderChart({ calls: [["pie", [[1, 2]], { frame: true }]] }, outDir), /calls\[0\] pie:/);
});

// The success path is the pie_label test below: no other mpl call takes another call's return value yet.
test("$ret rejects references to later, missing or empty calls", () => {
	assert.throws(() => renderChart({ calls: [["plot", [{ $ret: 0 }, [1]]]] }, outDir), /calls\[0\] plot: \$ret must name an earlier call/);
	assert.throws(() => renderChart({ calls: [["set_title", ["t"]], ["sca", [{ $ret: 5 }]]] }, outDir), /calls\[1\] sca: \$ret must name/);
	assert.throws(() => renderChart({ calls: [["sca", [0]], ["plot", [{ $ret: 0 }, [1]]]] }, outDir), /calls\[0\] returned nothing/);
});

test("pie_label styles inside percentages apart from outside names", () => {
	assert.ok(MPL_AXES_METHODS.has("pie_label"));
	const out = renderChart(
		{
			calls: [
				["pie", [[35, 25, 40]], { labels: ["a", "b", "c"], startangle: 90 }],
				["pie_label", [{ $ret: 0 }, "{absval:d} ({frac:.0%})"], { textprops: { color: { $rc: "figure.facecolor" }, fontweight: "bold" } }],
			],
		},
		outDir,
	);
	assert.deepEqual([...(out.png ?? []).slice(0, 4)], PNG_MAGIC);
	// numpy semantics, as documented in mplInstructions: one fractional value makes x float64, and {absval:d} throws
	const pie = ["pie", [[35.5, 25, 40]]] as const;
	assert.throws(() => renderChart({ calls: [pie, ["pie_label", [{ $ret: 0 }, "{absval:d}"]]] }, outDir), /calls\[1\] pie_label:/);
	assert.ok(renderChart({ calls: [pie, ["pie_label", [{ $ret: 0 }, "{absval:.1f}"]]] }, outDir).png);
});

test("$rc resolves the active theme's rc values, inside nested kwargs too", () => {
	const rc = (key: string) => ({ "figure.facecolor": "24273a", "lines.linewidth": 1.6 })[key];
	assert.deepEqual(decodeValue({ wedgeprops: { edgecolor: { $rc: "figure.facecolor" } } }, rc), { wedgeprops: { edgecolor: "#24273a" } });
	assert.equal(decodeValue({ $rc: "lines.linewidth" }, rc), 1.6);
	assert.throws(() => decodeValue({ $rc: "nope" }, rc), /\$rc: unknown rc key "nope"/);
	assert.throws(() => renderChart({ calls: [["plot", [[1], [1]], { color: { $rc: "no.such.key" } }]] }, outDir), /calls\[0\] plot: \$rc: unknown rc key/);
	for (const theme of ["catppuccin-macchiato", "catppuccin-latte", "pro-slate", "default"]) {
		const out = renderChart({ theme, calls: [["plot", [[1, 2], [2, 1]], { color: { $rc: "text.color" } }]] }, outDir);
		assert.deepEqual([...(out.png ?? []).slice(0, 4)], PNG_MAGIC, theme);
	}
	// spec rc overrides win, as rcParams.update after style.use
	const a = renderChart({ rc: { "text.color": "#ff0000" }, calls: [["plot", [[1, 2], [2, 1]], { color: { $rc: "text.color" } }]] }, outDir);
	const b = renderChart({ rc: { "text.color": "#ff0000" }, calls: [["plot", [[1, 2], [2, 1]], { color: "#ff0000" }]] }, outDir);
	assert.deepEqual(a.png, b.png);
});

test("an omitted theme follows the UI appearance; an explicit one is used as given", () => {
	const ui = (appearance: "dark" | "light", hasUI = true) => ({ hasUI, ui: { theme: { appearance } } });
	assert.equal(resolveMplTheme(undefined, ui("light")), MPL_LIGHT_THEME);
	assert.equal(resolveMplTheme(undefined, ui("dark")), MPL_DEFAULT_THEME);
	assert.equal(resolveMplTheme(undefined, ui("light", false)), MPL_DEFAULT_THEME, "print/json mode has no UI");
	assert.equal(resolveMplTheme(undefined, undefined), MPL_DEFAULT_THEME);
	for (const theme of ["pro-slate", "pro-dark", MPL_DEFAULT_THEME]) assert.equal(resolveMplTheme(theme, ui("light")), theme);
});

test("the tool re-reads the appearance on every call", async () => {
	const tool = toMplRenderToolDefinition(() => outDir);
	const ctx = { hasUI: true, ui: { theme: { appearance: "dark" as "dark" | "light" } } };
	const render = async (theme?: string) => {
		const result = await tool.execute("id", { theme, calls: [["plot", [[1, 2], [2, 1]]]] } as never, undefined, undefined, ctx as never);
		assert.notEqual(result.isError, true);
		return result.structuredContent as { theme: string; pngPath: string };
	};
	assert.equal((await render()).theme, MPL_DEFAULT_THEME);
	ctx.ui.theme.appearance = "light";
	const light = await render();
	assert.equal(light.theme, MPL_LIGHT_THEME);
	assert.deepEqual(readFileSync(light.pngPath), readFileSync((await render(MPL_LIGHT_THEME)).pngPath));
	assert.equal((await render("pro-dark")).theme, "pro-dark");
});

test("unknown methods and kwargs are reported with the call index", () => {
	assert.throws(() => renderChart({ calls: [["plot", [[1], [1]]], ["violinplot", [[1]]]] }, outDir), /calls\[1\] violinplot: unknown call/);
	assert.throws(() => renderChart({ calls: [["plot", [[1], [1]], { colour: "red" }]] }, outDir), /calls\[0\] plot: .*colour/);
	assert.throws(() => renderChart({ theme: "nope", calls: [] }, outDir), /unknown theme/);
	assert.throws(() => renderChart({ scale: 10, calls: [] }, outDir), /scale must be between/);
	const unwrapped = ["bar", ["a", "b"], [3, 7]] as never;
	assert.throws(() => renderChart({ calls: [unwrapped] }, outDir), /wrap all positional args in one array/);
});

test("the tool returns the PNG as an image block in structuredContent", async () => {
	const tool = toMplRenderToolDefinition(() => outDir);
	const result = await tool.execute("id", { calls: [["plot", [[1, 2, 3], [3, 1, 2]]]] } as never, undefined, undefined, undefined as never);
	const sc = result.structuredContent as { image?: { type: string; data: string }; pngPath?: string };
	assert.equal(sc.image?.type, "image");
	assert.deepEqual([...Buffer.from(sc.image?.data ?? "", "base64").subarray(0, 4)], PNG_MAGIC);
	assert.ok(sc.pngPath?.startsWith(outDir));

	const failed = await tool.execute("id", { calls: [["nope", []]] } as never, undefined, undefined, undefined as never);
	assert.equal(failed.isError, true);
	assert.match((failed.structuredContent as { error: string }).error, /unknown call/);
});
