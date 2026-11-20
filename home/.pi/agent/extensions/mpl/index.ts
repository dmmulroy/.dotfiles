/**
 * mpl_render: a codemode tool that draws matplotlib-style charts with mpl (github.com/ivarvong/mpl)
 * from a JSON call list, writes PNG/SVG files, and returns the PNG so a script can show it with image().
 */
import type { ExtensionAPI, ToolDefinition, ToolNamespace } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import { MPL_DEFAULT_THEME, renderChart, type MplRenderInput } from "./render.ts";
import { MPL_FIGURE_METHODS } from "./replay.ts";

const MPL_RENDER_TOOL_NAME = "mpl_render";

export const mplInstructions = `Reference for mpl_render. mpl is a pixel-exact TypeScript port of matplotlib 3.11: calls follow matplotlib's object API (ax.<method>(*args, **kwargs)), kwargs and rc keys included.

Spec: { calls, theme?, rc?, grid?, format?, scale?, name?, tight_layout? }
- calls: [method, [positional args], {kwargs}], applied in order to the current Axes. ax.plot(x, y, 'o-', label='a') is ["plot", [x, y, "o-"], { label: "a" }].
- grid: { rows, cols, sharex?, sharey?, width_ratios?, height_ratios? }. Axes are numbered row-major from 0; ["sca", [i]] makes Axes i current; ["twinx", []] adds a twin and makes it current.
- Figure calls take a "fig." prefix: ${[...MPL_FIGURE_METHODS].map((m) => `fig.${m}`).join(", ")}. fig.colorbar maps the last imshow or colour-mapped scatter on the current Axes.
- Values: {"$float": "nan"} is NaN. Kwarg {"$transform": "axes"} is ax.transAxes.
- theme: "${MPL_DEFAULT_THEME}" (default, dark), "pro-slate" (light), "pro-dark", or any matplotlib style name. rc overrides keys, e.g. { "figure.figsize": [9, 4] }.
- scale: PNG pixel multiplier from 0.25 to 4, default 2 (1440x840 at the default size); 3 for print.
- format: "png" (default), "svg", or "both". Files land in ~/.pi/agent/work/charts/<date>/; tight_layout runs unless the calls lay out the figure.

Dates:
- {"$dates": ["2026-01-01", ...]} is Date[], {"$date": "..."} one Date; naive ISO strings are UTC. plot, bar, text, axvline and fill_between take them.
- Ticks: ["$concise_x", []] for ConciseDateFormatter, or ["$date_x", ["MonthLocator", { interval: 1 }, "%b %d" | "concise"]].
- annotate takes epoch days (ms / 86400000) as coordinates.

Colours (Macchiato): red #ed8796, peach #f5a97f, yellow #eed49f, green #a6da95, teal #8bd5ca, blue #8aadf4, mauve #c6a0f6, pink #f5bde6, muted text #a5adcb. Cycle C0..C7 = blue, mauve, green, peach, red, teal, yellow, pink.

Chart types: line, step, scatter, bar/barh (bottom/left for stacks), hist, boxplot, errorbar, fill_between, imshow + fig.colorbar, axhline/axvline/axhspan/axvspan, text, annotate. For shares use barh; for distributions use hist or boxplot; for legend placement use loc and ncols.

Gotchas:
- Unknown kwargs and rc keys throw, as in matplotlib; the error names the call index and the offending key.
- Scatter legend: label a proxy ["plot", [[], [], "o"], { color: "C0", label: "name" }] rather than the scatter.
- Text: Latin, Greek, arrows and math symbols; use ASCII for tree labels and ~ for approximations.
- Keep each series under ~100k points.

Done when: the image you showed has no overlapping or clipped labels, no legend covering data, and readable ticks; otherwise adjust (figsize, ticks, legend loc, ylim headroom) and re-render.`;

export const mplToolNamespace: ToolNamespace = { name: "mpl", instructions: mplInstructions };

export const mplRenderParameters = Type.Object({
	calls: Type.Array(Type.Array(Type.Unknown(), { minItems: 1, maxItems: 3 }), {
		description: '[method, [positional args], {kwargs}], e.g. ["bar", [names, values], { color: "C1" }]',
	}),
	theme: Type.Optional(Type.String({ description: `default ${MPL_DEFAULT_THEME}` })),
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
		async execute(_toolCallId, params) {
			const input = params as MplRenderInput;
			try {
				const out = renderChart(input, outDir?.());
				const image = out.png
					? { type: "image" as const, data: Buffer.from(out.png).toString("base64"), mimeType: "image/png" as const }
					: undefined;
				const structured = {
					...(image && { image }),
					...(out.pngPath && { pngPath: out.pngPath }),
					...(out.svgPath && { svgPath: out.svgPath }),
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
