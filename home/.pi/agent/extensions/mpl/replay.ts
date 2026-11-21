/**
 * Replays an mpl chart spec (a JSON list of [method, args, kwargs] calls) onto a Figure.
 * Adapted from mpl's tools/replay-core.ts (buildWith), which mpl does not export. The spec is data:
 * every method name is checked against an allow-list of public Axes and Figure methods, type-checked
 * against mpl's API, so a codemode script cannot reach private helpers, construction or output.
 */
import {
	AutoDateLocator,
	Axes,
	ConciseDateFormatter,
	DateFormatter,
	DayLocator,
	Figure,
	HourLocator,
	MinuteLocator,
	MonthLocator,
	SecondLocator,
	YearLocator,
	subplots,
} from "mpl";

/** One drawing call: [method, positional args, keyword args]. */
export type MplCall = readonly [method: string, args?: readonly unknown[], kwargs?: Readonly<Record<string, unknown>>];

export interface MplGrid {
	readonly rows: number;
	readonly cols: number;
	readonly sharex?: boolean | string;
	readonly sharey?: boolean | string;
	readonly width_ratios?: readonly number[];
	readonly height_ratios?: readonly number[];
}

export interface MplFigureSpec {
	/** Passed to subplots({ style }): a bundled name, .mplstyle text, an rc object, or a list of those. */
	readonly style: unknown;
	readonly rc?: Readonly<Record<string, unknown>>;
	readonly grid?: MplGrid;
	readonly calls: readonly MplCall[];
	/** Looks up an rc value of the active theme plus `rc` for {"$rc": key}; undefined for an unknown key. */
	readonly rcParam?: MplRcLookup;
}

/** The rc value a {"$rc": key} spec value resolves to, as matplotlib's rcParams[key]. */
export type MplRcLookup = (key: string) => unknown;

/** Thrown for a spec mistake (unknown method, bad index); the message is meant for the model. */
export class MplSpecError extends Error {
	override readonly name = "MplSpecError";
}

type Dyn = Record<string, (...args: unknown[]) => unknown>;

/** The public method names of a class instance type. TypeScript `private` members are not in `keyof`, so they never appear. */
type MethodName<T> = { [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never }[keyof T] & string;
type AxesMethod = MethodName<Axes>;
type FigureMethod = MethodName<Figure>;

/** Public Axes methods a spec may call: matplotlib's drawing, labelling and axis API. */
const AXES_ALLOWED = [
	"annotate", "axhline", "axhspan", "axline", "axvline", "axvspan", "bar", "barh", "boxplot", "errorbar", "fill_between",
	"get_title", "get_xinverted", "get_xticklabels", "get_yinverted", "get_yticklabels", "grid", "hist", "hlines", "imshow",
	"invert_xaxis", "invert_yaxis", "labelOuter", "legend", "pie", "pie_label", "plot", "scatter", "set_anchor", "set_aspect",
	"set_box_aspect", "set_title", "set_xinverted", "set_xlabel", "set_xlim", "set_xscale", "set_xticklabels", "set_xticks",
	"set_yinverted", "set_ylabel", "set_ylim", "set_yscale", "set_yticklabels", "set_yticks", "step", "text", "tick_params",
	"vlines", "xaxis_inverted", "yaxis_inverted",
] as const satisfies readonly AxesMethod[];
/** Public Axes methods a spec may not call: internal state (spec), internal objects (set_subplotspec), special calls (twinx). */
const AXES_DENIED = ["spec", "set_subplotspec", "twinx"] as const satisfies readonly AxesMethod[];

/** Public Figure methods a spec may call as "fig.<name>". */
const FIGURE_ALLOWED = [
	"text", "suptitle", "supxlabel", "supylabel", "subplots_adjust", "autofmt_xdate", "tight_layout", "colorbar",
] as const satisfies readonly FigureMethod[];
/** Public Figure methods a spec may not call: Axes construction and output, which render.ts owns. */
const FIGURE_DENIED = [
	"add_subplot", "addAxesAt", "addAxesFromSpec", "subplots", "pngStream", "svgChunks", "svgStream", "toPNG", "toPNGSync",
	"toRGBA", "toScene", "toSVG",
] as const satisfies readonly FigureMethod[];

// Every public method is classified. When an mpl bump adds one, typecheck fails on the line below naming it:
// add it to *_ALLOWED (and to mplInstructions in index.ts if the model should know it) or to *_DENIED.
type Unclassified<M, Listed> = Exclude<M, Listed>;
const everyAxesMethodClassified: [Unclassified<AxesMethod, (typeof AXES_ALLOWED)[number] | (typeof AXES_DENIED)[number]>] extends [never]
	? true
	: Unclassified<AxesMethod, (typeof AXES_ALLOWED)[number] | (typeof AXES_DENIED)[number]> = true;
const everyFigureMethodClassified: [Unclassified<FigureMethod, (typeof FIGURE_ALLOWED)[number] | (typeof FIGURE_DENIED)[number]>] extends [never]
	? true
	: Unclassified<FigureMethod, (typeof FIGURE_ALLOWED)[number] | (typeof FIGURE_DENIED)[number]> = true;
void everyAxesMethodClassified;
void everyFigureMethodClassified;

/** Axes methods a spec may call, such as plot, bar, set_title. */
export const MPL_AXES_METHODS: ReadonlySet<string> = new Set<string>(AXES_ALLOWED);
/** Figure methods a spec may call as "fig.<name>", such as fig.suptitle. */
export const MPL_FIGURE_METHODS: ReadonlySet<string> = new Set<string>(FIGURE_ALLOWED);
/** Pseudo-calls the replayer handles itself. */
export const MPL_SPECIAL_CALLS = ["sca", "twinx", "$concise_x", "$date_x"] as const;


const DATE_LOCATORS: Readonly<Record<string, new (kw?: unknown) => unknown>> = {
	AutoDateLocator: AutoDateLocator as never,
	YearLocator: YearLocator as never,
	MonthLocator: MonthLocator as never,
	DayLocator: DayLocator as never,
	HourLocator: HourLocator as never,
	MinuteLocator: MinuteLocator as never,
	SecondLocator: SecondLocator as never,
};

/** A naive ISO date-time as UTC (a date alone becomes midnight); a string with an offset or Z is kept. */
function toDate(s: unknown): Date {
	if (typeof s === "number") return new Date(s);
	if (typeof s !== "string") throw new MplSpecError(`$date/$dates expects ISO strings or epoch ms, got ${JSON.stringify(s)}`);
	const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(s);
	const iso = s.includes("T") || s.includes(" ") ? s.replace(" ", "T") : `${s}T00:00`;
	const d = new Date(hasZone ? iso : `${iso}Z`);
	if (Number.isNaN(d.getTime())) throw new MplSpecError(`invalid date ${JSON.stringify(s)}`);
	return d;
}

/** rc colours are stored as bare hex ("24273a"); kwargs need the "#" matplotlib colour form. */
function rcColour(v: unknown): unknown {
	return typeof v === "string" && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? `#${v}` : v;
}

/**
 * JSON values to mpl values at any depth, including inside kwarg objects such as wedgeprops:
 * {$date}, {$dates}, {$float: "nan"|"inf"|"-inf"}, and {$rc: key} (the theme's rc value, e.g. "figure.facecolor").
 */
export function decodeValue(a: unknown, rcParam?: MplRcLookup): unknown {
	if (Array.isArray(a)) return a.map((v) => decodeValue(v, rcParam));
	if (a === null || typeof a !== "object") return a;
	const o = a as Record<string, unknown>;
	if ("$rc" in o) {
		const key = o.$rc;
		const value = typeof key === "string" && rcParam ? rcParam(key) : undefined;
		if (value === undefined) throw new MplSpecError(`$rc: unknown rc key ${JSON.stringify(key)}; use a matplotlib rcParams key such as "figure.facecolor" or "text.color"`);
		return rcColour(value);
	}
	if ("$dates" in o) {
		if (!Array.isArray(o.$dates)) throw new MplSpecError("$dates expects an array");
		return o.$dates.map(toDate);
	}
	if ("$date" in o) return toDate(o.$date);
	if ("$float" in o) {
		const s = String(o.$float);
		return s === "nan" ? NaN : s === "inf" ? Infinity : s === "-inf" ? -Infinity : Number(s);
	}
	if ("$transform" in o || "$ret" in o) return a;
	return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, decodeValue(v, rcParam)]));
}

function decodeKwargs(kwargs: Readonly<Record<string, unknown>> | undefined, ax: Axes, rcParam?: MplRcLookup): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(kwargs ?? {})) {
		if (v && typeof v === "object" && "$transform" in v) {
			const t = (v as { $transform: unknown }).$transform;
			if (t !== "axes" && t !== "data") throw new MplSpecError(`$transform must be "axes" or "data"`);
			out[k] = t === "axes" ? ax.transAxes : ax.transData;
		} else out[k] = decodeValue(v, rcParam);
	}
	return out;
}

function withKwargs(args: readonly unknown[], kw: Record<string, unknown>): unknown[] {
	return Object.keys(kw).length > 0 ? [...args, kw] : [...args];
}

function unknownMethod(fn: string): MplSpecError {
	return new MplSpecError(
		`unknown call "${fn}". Axes methods: ${[...MPL_AXES_METHODS].sort().join(", ")}. ` +
			`Figure methods (prefix "fig."): ${[...MPL_FIGURE_METHODS].join(", ")}. Special: ${MPL_SPECIAL_CALLS.join(", ")}.`,
	);
}

/**
 * A positional arg {"$ret": i} is the value calls[i] returned, such as the PieContainer pie() returns for pie_label.
 * Same convention as mpl's fixture specs. Only earlier calls that returned something can be named.
 */
function resolveRet(a: unknown, index: number, rets: ReadonlyMap<number, unknown>, rcParam?: MplRcLookup): unknown {
	if (a === null || typeof a !== "object" || Array.isArray(a) || !("$ret" in a)) return decodeValue(a, rcParam);
	const i = (a as { $ret: unknown }).$ret;
	if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= index) {
		throw new MplSpecError(`$ret must name an earlier call index (0..${index - 1}), got ${JSON.stringify(i)}`);
	}
	if (!rets.has(i)) throw new MplSpecError(`$ret: calls[${i}] returned nothing to pass on`);
	return rets.get(i);
}

/** Builds the Figure for a spec. Throws MplSpecError for spec mistakes and mpl's own errors for bad kwargs. */
export function buildFigure(spec: MplFigureSpec): Figure {
	const base = { style: spec.style, rc: spec.rc ?? {} };
	let fig: Figure;
	let axes: Axes[];
	if (spec.grid) {
		const { rows, cols, width_ratios, height_ratios, ...gridKw } = spec.grid;
		const ratios = { ...(width_ratios && { width_ratios }), ...(height_ratios && { height_ratios }) };
		const gridspec_kw = Object.keys(ratios).length > 0 ? { gridspec_kw: ratios } : {};
		const [f, made] = subplots(rows, cols, { ...gridKw, ...gridspec_kw, ...base, squeeze: false } as never);
		fig = f;
		axes = (made as unknown as Axes[][]).flat();
	} else {
		const [f, ax] = subplots(base as never);
		fig = f;
		axes = [ax];
	}
	let ax = axes[0] as Axes;
	const rets = new Map<number, unknown>();

	spec.calls.forEach((call, index) => {
		if (!Array.isArray(call) || typeof call[0] !== "string") {
			throw new MplSpecError(`calls[${index}] must be [method, args?, kwargs?], got ${JSON.stringify(call)}`);
		}
		const [fn, args0 = [], kwargs] = call;
		if (!Array.isArray(args0) || Array.isArray(kwargs) || call.length > 3) {
			throw new MplSpecError(
				`calls[${index}] ${fn}: expected [method, [positional args], {kwargs}]; wrap all positional args in one array, ` +
					`e.g. ["bar", [["a", "b"], [3, 7]], { color: "C1" }]`,
			);
		}
		try {
			const args = args0.map((a) => resolveRet(a, index, rets, spec.rcParam));
			if (fn === "sca") {
				const i = args[0];
				if (typeof i !== "number" || !axes[i]) throw new MplSpecError(`sca: no Axes ${String(i)} (have ${axes.length})`);
				ax = axes[i] as Axes;
				return;
			}
			if (fn === "twinx") {
				ax = ax.twinx();
				axes.push(ax);
				return;
			}
			if (fn === "$concise_x") {
				const loc = new AutoDateLocator();
				ax.xaxis.set_major_locator(loc as never);
				ax.xaxis.set_major_formatter(new ConciseDateFormatter(loc as never, (kwargs ?? {}) as never) as never);
				return;
			}
			if (fn === "$date_x") {
				// ["$date_x", [locator, locatorKwargs?, formatter?]]: formatter is a strftime string or "concise"
				const [name, lkw, fmt] = args0 as [string, Record<string, unknown> | undefined, string | undefined];
				const Loc = DATE_LOCATORS[name];
				if (!Loc) throw new MplSpecError(`$date_x: unknown locator ${name}; use one of ${Object.keys(DATE_LOCATORS).join(", ")}`);
				const loc = new Loc(lkw ?? {});
				ax.xaxis.set_major_locator(loc as never);
				if (fmt === "concise") ax.xaxis.set_major_formatter(new ConciseDateFormatter(loc as never, {}) as never);
				else if (typeof fmt === "string") ax.xaxis.set_major_formatter(new DateFormatter(fmt) as never);
				return;
			}
			if (fn.startsWith("fig.")) {
				const name = fn.slice(4);
				if (!MPL_FIGURE_METHODS.has(name)) throw unknownMethod(fn);
				const kw = decodeKwargs(kwargs, ax, spec.rcParam);
				if (name === "colorbar") {
					const mappable = [...ax.artists]
						.reverse()
						.find((a) => a.kind === "image" || (a.kind === "scatter" && a.mappable.kind === "some"));
					if (!mappable) throw new MplSpecError("fig.colorbar: no imshow or colour-mapped scatter on the current Axes");
					(fig as unknown as Dyn).colorbar?.(mappable, ...(Object.keys(kw).length ? [kw] : []));
					return;
				}
				(fig as unknown as Dyn)[name]?.(...withKwargs(args, kw));
				return;
			}
			if (!MPL_AXES_METHODS.has(fn)) throw unknownMethod(fn);
			const ret = (ax as unknown as Dyn)[fn]?.(...withKwargs(args, decodeKwargs(kwargs, ax, spec.rcParam)));
			if (ret !== undefined) rets.set(index, ret);
		} catch (error) {
			if (error instanceof MplSpecError && error.message.startsWith(`calls[`)) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new MplSpecError(`calls[${index}] ${fn}: ${message}`);
		}
	});
	return fig;
}
