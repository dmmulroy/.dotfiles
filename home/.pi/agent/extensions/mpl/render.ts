/** Renders an mpl chart spec to PNG/SVG files. No pi imports, so tests drive it directly. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { availableStyles, composeStyles, registerColormapRgba, registerColormaps, registerFonts } from "mpl";
import { allColormaps } from "mpl/colormaps/all";
import { allColormapRgba } from "mpl/colormaps/all.rgba";
import { allFonts } from "mpl/fonts/all";
import { buildFigure, type MplCall, type MplGrid, type MplRcLookup } from "./replay.ts";

registerFonts(...allFonts);
registerColormaps(...allColormaps);
registerColormapRgba(...allColormapRgba);

/** Themes this extension ships as .mplstyle files under styles/. */
const LOCAL_THEMES = ["catppuccin-macchiato", "catppuccin-latte"] as const;
/** The theme for a dark UI, and when there is no UI to ask (print/json mode, tests, direct renderChart calls). */
export const MPL_DEFAULT_THEME = "catppuccin-macchiato";
/** The theme for a light UI: Macchiato's light twin, same layout and cycle order. */
export const MPL_LIGHT_THEME = "catppuccin-latte";

/** The theme an omitted `theme` renders in for a UI appearance; undefined (no UI) is treated as dark. */
export function mplThemeForAppearance(appearance: "dark" | "light" | undefined): string {
	return appearance === "light" ? MPL_LIGHT_THEME : MPL_DEFAULT_THEME;
}

/** Hi-dpi by default: 2x pixels, 1440x840 at the themes' 7.2x4.2 in figure size. */
export const MPL_DEFAULT_SCALE = 2;
/** Every accepted theme name: local ones first, then mpl's bundled styles (pro-slate, pro-dark, ggplot, ...). */
export const MPL_THEMES: readonly string[] = [...LOCAL_THEMES, ...availableStyles().filter((s) => s !== "default"), "default"];

type MplStyleSpec = Parameters<typeof composeStyles>[0][number];

/** A theme as subplots() takes it (`style`) and as composeStyles() takes it (`layers`, for {"$rc": key} lookups). */
interface MplThemeStyle {
	readonly style: unknown;
	readonly layers: readonly MplStyleSpec[];
}

const styleText = new Map<string, string>();
function themeStyle(theme: string): MplThemeStyle {
	if ((LOCAL_THEMES as readonly string[]).includes(theme)) {
		let text = styleText.get(theme);
		if (text === undefined) {
			text = readFileSync(new URL(`./styles/${theme}.mplstyle`, import.meta.url), "utf8");
			styleText.set(theme, text);
		}
		return { style: text, layers: [{ kind: "text", text }] };
	}
	if (theme === "default") return { style: [], layers: [] };
	if (!MPL_THEMES.includes(theme)) throw new Error(`unknown theme "${theme}"; use one of ${MPL_THEMES.join(", ")}`);
	return { style: theme, layers: [{ kind: "bundled", name: theme }] };
}

/** {"$rc": key} lookup over the theme plus the spec's rc overrides, as matplotlib's rcParams after style.use + rcParams.update. */
function rcLookup(theme: string, { layers }: MplThemeStyle, rc: Readonly<Record<string, unknown>> | undefined): MplRcLookup {
	let merged: ReadonlyMap<string, unknown> | undefined;
	return (key) => {
		if (rc && Object.hasOwn(rc, key)) return rc[key];
		if (!merged) {
			const result = composeStyles(layers);
			if (!result.ok) throw new Error(`theme "${theme}": cannot read its rc values`);
			merged = result.value;
		}
		return merged.get(key);
	};
}

export interface MplRenderInput {
	readonly theme?: string;
	readonly rc?: Readonly<Record<string, unknown>>;
	readonly grid?: MplGrid;
	readonly calls: readonly MplCall[];
	readonly format?: "png" | "svg" | "both";
	/** PNG pixel multiplier (hi-dpi). Default MPL_DEFAULT_SCALE. */
	readonly scale?: number;
	/** File stem, such as "latency-by-region". */
	readonly name?: string;
	/** Run fig.tight_layout() after the calls. Default true unless the calls already lay out the figure. */
	readonly tight_layout?: boolean;
}

export interface MplRenderOutput {
	readonly png?: Uint8Array;
	readonly pngPath?: string;
	readonly svgPath?: string;
	readonly width?: number;
	readonly height?: number;
	readonly theme: string;
}

/** Default output directory: ~/.pi/agent/work/charts/<YYYY-MM-DD>. */
export function defaultChartDir(now = new Date()): string {
	return join(homedir(), ".pi", "agent", "work", "charts", now.toISOString().slice(0, 10));
}

function fileStem(name: string | undefined, now: Date): string {
	const slug = (name ?? "chart").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chart";
	return `${slug}-${now.toISOString().slice(11, 19).replaceAll(":", "")}`;
}

/** PNG width and height from the IHDR chunk. */
function pngSize(png: Uint8Array): { width: number; height: number } {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function renderChart(input: MplRenderInput, outDir = defaultChartDir()): MplRenderOutput {
	const theme = input.theme ?? MPL_DEFAULT_THEME;
	const scale = input.scale ?? MPL_DEFAULT_SCALE;
	if (!(scale >= 0.25 && scale <= 4)) throw new Error(`scale must be between 0.25 and 4, got ${scale}`);
	const style = themeStyle(theme);
	const fig = buildFigure({ style: style.style, rc: input.rc, grid: input.grid, calls: input.calls, rcParam: rcLookup(theme, style, input.rc) });
	const laidOut = input.calls.some((c) => c[0] === "fig.tight_layout" || c[0] === "fig.subplots_adjust");
	if (input.tight_layout ?? !laidOut) fig.tight_layout();

	const format = input.format ?? "png";
	const now = new Date();
	const stem = fileStem(input.name, now);
	mkdirSync(outDir, { recursive: true });

	let png: Uint8Array | undefined;
	let pngPath: string | undefined;
	let svgPath: string | undefined;
	if (format !== "svg") {
		png = fig.toPNGSync({ scale });
		pngPath = join(outDir, `${stem}.png`);
		writeFileSync(pngPath, png);
	}
	if (format !== "png") {
		svgPath = join(outDir, `${stem}.svg`);
		writeFileSync(svgPath, fig.toSVG());
	}
	return { png, pngPath, svgPath, theme, ...(png ? pngSize(png) : {}) };
}
