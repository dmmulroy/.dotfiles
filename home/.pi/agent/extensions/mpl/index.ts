/**
 * mpl_render: a codemode tool that draws matplotlib-style charts with mpl (github.com/ivarvong/mpl)
 * from a JSON call list, writes PNG/SVG files, and returns the PNG so a script can show it with image().
 */
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition, ToolNamespace } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import { MPL_DEFAULT_THEME, MPL_LIGHT_THEME, mplThemeForAppearance, renderChart, type MplRenderInput } from "./render.ts";
import { MPL_FIGURE_METHODS } from "./replay.ts";

const MPL_RENDER_TOOL_NAME = "mpl_render";

/** The slice of the tool context {@link resolveMplTheme} reads; a real `ExtensionToolContext` satisfies it. */
export interface MplThemeContext {
	readonly hasUI: boolean;
	readonly ui?: { readonly theme?: { readonly appearance?: "dark" | "light" } };
}

/**
 * The theme a call renders in. An explicit `theme` always wins. An omitted one follows pi's UI appearance, read on
 * every call so a mid-session theme switch lands on the next chart: light UI -> catppuccin-latte, dark UI or no UI
 * (print/json mode, no ctx) -> catppuccin-macchiato. Resolved here so render.ts stays free of pi imports.
 */
export function resolveMplTheme(theme: string | undefined, ctx: MplThemeContext | undefined): string {
	return theme ?? mplThemeForAppearance(ctx?.hasUI ? ctx.ui?.theme?.appearance : undefined);
}

const PIE_GUIDE = `Pie: ["pie", [values], { labels, colors, autopct: "%1.0f%%", explode, startangle: 90, counterclock, shadow, radius, labeldistance, pctdistance, wedgeprops: { width: 0.4, edgecolor: {"$rc": "figure.facecolor"}, linewidth: 1.5 }, textprops: { fontsize, color, fontweight }, rotatelabels, normalize }]. wedgeprops.width makes a donut; an edgecolor matching the background separates wedges. autopct is a printf string only (no callables). normalize: false with sum <= 1 draws a partial pie. frame: true and hatch throw. pie sets equal aspect and hides the axes.
Pie text colours: pie's textprops styles names and autopct percentages alike, and the theme's text colour is hard to read on filled wedges. So draw the pie (call i) with labels and no autopct, then add the values with ["pie_label", [{"$ret": i}, "{frac:.0%}"], { distance: 0.6, textprops: { color: {"$rc": "figure.facecolor"}, fontweight: "bold" } }] (use distance: 0.8 for a 0.4-wide donut). pie_label's labels is a str.format template with {absval} and {frac} fields (e.g. "{absval:,d} ({frac:.0%})") or a list of strings, one per wedge; alignment "auto" | "outer" | "center", rotate. {absval:d} needs whole-number values; if any value has a fraction use {absval} or {absval:.1f}. Each pie_label call has its own textprops.`;

export const mplInstructions = `Reference for mpl_render. mpl is a pixel-exact TypeScript port of matplotlib 3.11: calls follow matplotlib's object API (ax.<method>(*args, **kwargs)), kwargs and rc keys included.

Spec: { calls, theme?, rc?, grid?, format?, scale?, name?, tight_layout? }
- calls: [method, [positional args], {kwargs}], applied in order to the current Axes. ax.plot(x, y, 'o-', label='a') is ["plot", [x, y, "o-"], { label: "a" }].
- grid: { rows, cols, sharex?, sharey?, width_ratios?, height_ratios? }. Axes are numbered row-major from 0; ["sca", [i]] makes Axes i current; ["twinx", []] adds a twin and makes it current.
- Figure calls take a "fig." prefix: ${[...MPL_FIGURE_METHODS].map((m) => `fig.${m}`).join(", ")}. fig.colorbar maps the last imshow or colour-mapped scatter on the current Axes.
- Values: {"$float": "nan"} is NaN. Kwarg {"$transform": "axes"} is ax.transAxes. A positional {"$ret": i} is the value calls[i] returned (e.g. pie's container). {"$rc": key} anywhere in args or kwargs is the active theme's rcParams[key], e.g. {"$rc": "figure.facecolor"} for the background.
- theme: omit it to match pi's UI: "${MPL_DEFAULT_THEME}" (dark) in a dark UI or with no UI, "${MPL_LIGHT_THEME}" (light) in a light UI, chosen again on every call. Name one only when asked: "pro-slate" (light), "pro-dark", or any matplotlib style name; it is used as given. rc overrides keys, e.g. { "figure.figsize": [9, 4] }.
- scale: PNG pixel multiplier from 0.25 to 4, default 2 (1440x840 at the default size); 3 for print.
- format: "png" (default), "svg", or "both". Files land in ~/.pi/agent/work/charts/<date>/; tight_layout runs unless the calls lay out the figure.

Dates:
- {"$dates": ["2026-01-01", ...]} is Date[], {"$date": "..."} one Date; naive ISO strings are UTC. plot, bar, text, axvline and fill_between take them.
- Ticks: ["$concise_x", []] for ConciseDateFormatter, or ["$date_x", ["MonthLocator", { interval: 1 }, "%b %d" | "concise"]].
- annotate takes epoch days (ms / 86400000) as coordinates.

Colours: the theme can be dark or light, so never hardcode hex. Both Catppuccin themes share the cycle C0..C7 = blue, mauve, green, peach, red, teal, yellow, pink; name those slots (C4 for red/bad, C2 for green/good). Background {"$rc": "figure.facecolor"}, text {"$rc": "text.color"}, muted text {"$rc": "axes.labelcolor"}, gridline grey {"$rc": "grid.color"}.

Chart types: line, step, scatter, bar/barh (bottom/left for stacks), hist, boxplot, errorbar, fill_between, imshow + fig.colorbar, pie, axhline/axvline/axhspan/axvspan, text, annotate. For shares of a whole with up to ~6 parts use pie (or a donut); with more parts, or to compare shares, use barh. For distributions use hist or boxplot; for legend placement use loc and ncols.

${PIE_GUIDE}

Gotchas:
- Unknown kwargs and rc keys throw, as in matplotlib; the error names the call index and the offending key.
- Scatter legend: label a proxy ["plot", [[], [], "o"], { color: "C0", label: "name" }] rather than the scatter.
- Text: Latin, Greek, arrows and math symbols; use ASCII for tree labels and ~ for approximations.
- Keep each series under ~100k points.
- fig.colorbar inside a subplot grid works with tight_layout.

Done when: the image you showed has no overlapping or clipped labels, no legend covering data, and readable ticks; otherwise adjust (figsize, ticks, legend loc, ylim headroom) and re-render.`;

export const mplToolNamespace: ToolNamespace = { name: "mpl", instructions: mplInstructions };

export const mplRenderParameters = Type.Object({
	calls: Type.Array(Type.Array(Type.Unknown(), { minItems: 1, maxItems: 3 }), {
		description: '[method, [positional args], {kwargs}], e.g. ["bar", [names, values], { color: "C1" }]',
	}),
	theme: Type.Optional(
		Type.String({ description: `omit to follow the UI (${MPL_DEFAULT_THEME} dark, ${MPL_LIGHT_THEME} light); an explicit style is used as given` }),
	),
	rc: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	grid: Type.Optional(
		Type.Object({
			rows: Type.Integer(),
			cols: Type.Integer(),
			sharex: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
			sharey: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
			width_ratios: Type.Optional(Type.Array(Type.Number())),
			height_ratios: Type.Optional(Type.Array(Type.Number())),
		}),
	),
	format: Type.Optional(Type.Union([Type.Literal("png"), Type.Literal("svg"), Type.Literal("both")])),
	scale: Type.Optional(Type.Number()),
	name: Type.Optional(Type.String()),
	tight_layout: Type.Optional(Type.Boolean()),
});

export const mplRenderOutput = Type.Object({
	image: Type.Optional(Type.Object({ type: Type.Literal("image"), data: Type.String(), mimeType: Type.String() })),
	pngPath: Type.Optional(Type.String()),
	svgPath: Type.Optional(Type.String()),
	theme: Type.Optional(Type.String({ description: "the theme the chart rendered in" })),
	error: Type.Optional(Type.String()),
});

export function toMplRenderToolDefinition(outDir?: () => string): ToolDefinition<TSchema, undefined> {
	return {
		name: MPL_RENDER_TOOL_NAME,
		label: "mpl render",
		description:
			'Chart data as PNG/SVG through the matplotlib API. Read describeNamespace("mpl") before the first chart; show the result with image(r.image).',
		parameters: mplRenderParameters as unknown as TSchema,
		outputSchema: mplRenderOutput as unknown as TSchema,
		exposure: "codemode",
		namespace: mplToolNamespace,
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionToolContext | undefined) {
			const input = params as MplRenderInput;
			try {
				const out = renderChart({ ...input, theme: resolveMplTheme(input.theme, ctx) }, outDir?.());
				const image = out.png
					? { type: "image" as const, data: Buffer.from(out.png).toString("base64"), mimeType: "image/png" as const }
					: undefined;
				const structured = {
					...(image && { image }),
					...(out.pngPath && { pngPath: out.pngPath }),
					...(out.svgPath && { svgPath: out.svgPath }),
					theme: out.theme,
				};
				const paths = [out.pngPath, out.svgPath].filter(Boolean).join("\n");
				return {
					content: [...(image ? [image] : []), { type: "text" as const, text: paths }],
					structuredContent: structured as never,
					details: undefined,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `mpl_render failed: ${message}` }],
					structuredContent: { error: message } as never,
					details: undefined,
					isError: true,
				};
			}
		},
	};
}

export default function mplExtension(pi: ExtensionAPI): void {
	pi.registerTool(toMplRenderToolDefinition());
}
