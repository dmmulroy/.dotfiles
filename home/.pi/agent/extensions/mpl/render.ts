/** Renders an mpl chart spec to PNG/SVG files. No pi imports, so tests drive it directly. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { availableStyles, registerColormapRgba, registerColormaps, registerFonts } from "mpl";
import { allColormaps } from "mpl/colormaps/all";
import { allColormapRgba } from "mpl/colormaps/all.rgba";
import { allFonts } from "mpl/fonts/all";
import { buildFigure, type MplCall, type MplGrid } from "./replay.ts";

registerFonts(...allFonts);
registerColormaps(...allColormaps);
registerColormapRgba(...allColormapRgba);

/** Themes this extension ships as .mplstyle files under styles/. */
const LOCAL_THEMES = ["catppuccin-macchiato"] as const;
export const MPL_DEFAULT_THEME = "catppuccin-macchiato";
/** Hi-dpi by default: 2x pixels, 1440x840 at the themes' 7.2x4.2 in figure size. */
export const MPL_DEFAULT_SCALE = 2;
/** Every accepted theme name: local ones first, then mpl's bundled styles (pro-slate, pro-dark, ggplot, ...). */
export const MPL_THEMES: readonly string[] = [...LOCAL_THEMES, ...availableStyles().filter((s) => s !== "default"), "default"];

const styleText = new Map<string, string>();
function themeStyle(theme: string): unknown {
	if ((LOCAL_THEMES as readonly string[]).includes(theme)) {
		let text = styleText.get(theme);
		if (text === undefined) {
			text = readFileSync(new URL(`./styles/${theme}.mplstyle`, import.meta.url), "utf8");
			styleText.set(theme, text);
		}
		return text;
	}
	if (theme === "default") return [];
	if (!MPL_THEMES.includes(theme)) throw new Error(`unknown theme "${theme}"; use one of ${MPL_THEMES.join(", ")}`);
	return theme;
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
	const fig = buildFigure({ style: themeStyle(theme), rc: input.rc, grid: input.grid, calls: input.calls });
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
