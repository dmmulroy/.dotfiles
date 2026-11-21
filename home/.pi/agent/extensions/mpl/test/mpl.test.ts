import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { MPL_AUTO_LIGHT_THEME, MPL_AUTO_THEME, resolveMplTheme, toMplRenderToolDefinition, type MplThemeContext } from "../index.ts";
import { MPL_DEFAULT_THEME, MPL_THEMES, renderChart } from "../render.ts";
import { decodeValue, MPL_AXES_METHODS } from "../replay.ts";

const outDir = mkdtempSync(join(tmpdir(), "pi-mpl-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

test("the themes include macchiato, pro-slate and pro-dark", () => {
	for (const t of ["catppuccin-macchiato", "pro-slate", "pro-dark"]) assert.ok(MPL_THEMES.includes(t), t);
});

test("Axes allow-list has drawing methods and no private names", () => {
	for (const m of ["plot", "bar", "scatter", "hist", "set_title", "legend", "imshow"]) assert.ok(MPL_AXES_METHODS.has(m), m);
	assert.ok(![...MPL_AXES_METHODS].some((m) => m.startsWith("_") || m === "constructor"));
});

test("decodeValue turns $dates, $date and $float into values", () => {
	const [d] = decodeValue({ $dates: ["2026-01-02"] }) as Date[];
	assert.equal(d?.toISOString(), "2026-01-02T00:00:00.000Z");
	assert.equal((decodeValue({ $date: "2026-01-02T03:04:05+01:00" }) as Date).toISOString(), "2026-01-02T02:04:05.000Z");
	assert.ok(Number.isNaN(decodeValue({ $float: "nan" })));
});

for (const theme of ["catppuccin-macchiato", "pro-slate", "pro-dark"]) {
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

test("unknown methods and kwargs are reported with the call index", () => {
	assert.throws(() => renderChart({ calls: [["plot", [[1], [1]]], ["pie", [[1]]]] }, outDir), /calls\[1\] pie: unknown call/);
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

/** A tool context with just the fields resolveMplTheme() reads; `appearance` is mutable so a test can flip it between calls. */
function themeContext(appearance: "dark" | "light", hasUI = true): MplThemeContext & { ui: { theme: { appearance: "dark" | "light" } } } {
	return { hasUI, ui: { theme: { appearance } } };
}

test("an omitted theme stays undefined, so renderChart keeps its own default", () => {
	assert.equal(resolveMplTheme(undefined, themeContext("light")), undefined);
	assert.equal(resolveMplTheme(undefined, undefined), undefined);
});

test(`"${MPL_AUTO_THEME}" resolves to ${MPL_AUTO_LIGHT_THEME} in a light UI and ${MPL_DEFAULT_THEME} in a dark UI`, () => {
	assert.equal(resolveMplTheme(MPL_AUTO_THEME, themeContext("light")), MPL_AUTO_LIGHT_THEME);
	assert.equal(resolveMplTheme(MPL_AUTO_THEME, themeContext("dark")), MPL_DEFAULT_THEME);
	assert.ok(MPL_THEMES.includes(MPL_AUTO_LIGHT_THEME));
});

test(`"${MPL_AUTO_THEME}" falls back to ${MPL_DEFAULT_THEME} without a UI`, () => {
	assert.equal(resolveMplTheme(MPL_AUTO_THEME, undefined), MPL_DEFAULT_THEME);
	assert.equal(resolveMplTheme(MPL_AUTO_THEME, themeContext("light", false)), MPL_DEFAULT_THEME);
	assert.equal(resolveMplTheme(MPL_AUTO_THEME, { hasUI: true } as MplThemeContext), MPL_DEFAULT_THEME);
});

test(`"${MPL_AUTO_THEME}" is resolved at the tool boundary, so renderChart never sees it`, () => {
	assert.ok(!MPL_THEMES.includes(MPL_AUTO_THEME));
	assert.throws(() => renderChart({ theme: MPL_AUTO_THEME, calls: [] }, outDir), /unknown theme/);
});

test("an explicit theme is never overridden by the UI appearance", () => {
	for (const theme of ["pro-dark", MPL_DEFAULT_THEME, "ggplot"]) {
		assert.equal(resolveMplTheme(theme, themeContext("light")), theme);
		assert.equal(resolveMplTheme(theme, themeContext("dark")), theme);
	}
});

test(`the tool renders "${MPL_AUTO_THEME}" per call and follows an appearance change`, async () => {
	const tool = toMplRenderToolDefinition(() => outDir);
	const ctx = themeContext("dark");
	const render = async (theme?: string) => {
		const result = await tool.execute("id", { theme, calls: [["plot", [[1, 2], [2, 1]]]] } as never, undefined, undefined, ctx as never);
		assert.notEqual(result.isError, true);
		const { pngPath } = result.structuredContent as { pngPath?: string };
		assert.ok(pngPath && existsSync(pngPath));
		return readFileSync(pngPath);
	};

	const autoDark = await render(MPL_AUTO_THEME);
	assert.deepEqual([...autoDark.subarray(0, 4)], PNG_MAGIC);
	assert.deepEqual(autoDark, await render(MPL_DEFAULT_THEME), `${MPL_AUTO_THEME} in a dark UI should render ${MPL_DEFAULT_THEME}`);

	ctx.ui.theme.appearance = "light";
	const autoLight = await render(MPL_AUTO_THEME);
	assert.deepEqual(autoLight, await render(MPL_AUTO_LIGHT_THEME), `${MPL_AUTO_THEME} in a light UI should render ${MPL_AUTO_LIGHT_THEME}`);
	assert.notDeepEqual(autoLight, autoDark);

	assert.deepEqual(
		await render(),
		await render(MPL_DEFAULT_THEME),
		`an omitted theme should stay ${MPL_DEFAULT_THEME} even while the UI is light`,
	);
});
