/**
 * Replays an mpl chart spec (a JSON list of [method, args, kwargs] calls) onto a Figure.
 * Adapted from mpl's tools/replay-core.ts (buildWith), which mpl does not export. The spec is data:
 * every method name is checked against an allow-list, so a codemode script cannot reach anything
 * but Axes and Figure drawing methods.
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
}

/** Thrown for a spec mistake (unknown method, bad index); the message is meant for the model. */
export class MplSpecError extends Error {
	override readonly name = "MplSpecError";
}

type Dyn = Record<string, (...args: unknown[]) => unknown>;

const NOT_DRAWING = new Set(["constructor", "spec", "addAxesAt", "addAxesFromSpec", "add_subplot", "subplots", "toScene"]);

function drawingMethods(proto: object): ReadonlySet<string> {
	const names = new Set<string>();
	for (let p: object | null = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
		for (const name of Object.getOwnPropertyNames(p)) {
			if (name.startsWith("_") || NOT_DRAWING.has(name) || /^to[A-Z]|^svg|^png/.test(name)) continue;
			const d = Object.getOwnPropertyDescriptor(p, name);
			if (d && typeof d.value === "function") names.add(name);
		}
	}
	return names;
}

/** Axes methods a spec may call, such as plot, bar, set_title. */
export const MPL_AXES_METHODS: ReadonlySet<string> = drawingMethods(Axes.prototype);
/** Figure methods a spec may call as "fig.<name>", such as fig.suptitle. */
export const MPL_FIGURE_METHODS: ReadonlySet<string> = new Set(
	["text", "suptitle", "supxlabel", "supylabel", "subplots_adjust", "autofmt_xdate", "tight_layout", "colorbar"].filter(
		(name) => typeof (Figure.prototype as unknown as Dyn)[name] === "function",
	),
);
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

/** JSON values to mpl values at any depth: {$date}, {$dates}, {$float: "nan"|"inf"|"-inf"}. */
export function decodeValue(a: unknown): unknown {
	if (Array.isArray(a)) return a.map(decodeValue);
	if (a === null || typeof a !== "object") return a;
	const o = a as Record<string, unknown>;
	if ("$dates" in o) {
		if (!Array.isArray(o.$dates)) throw new MplSpecError("$dates expects an array");
		return o.$dates.map(toDate);
	}
	if ("$date" in o) return toDate(o.$date);
	if ("$float" in o) {
		const s = String(o.$float);
		return s === "nan" ? NaN : s === "inf" ? Infinity : s === "-inf" ? -Infinity : Number(s);
	}
	return a;
}

function decodeKwargs(kwargs: Readonly<Record<string, unknown>> | undefined, ax: Axes): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(kwargs ?? {})) {
		if (v && typeof v === "object" && "$transform" in v) {
			const t = (v as { $transform: unknown }).$transform;
			if (t !== "axes" && t !== "data") throw new MplSpecError(`$transform must be "axes" or "data"`);
			out[k] = t === "axes" ? ax.transAxes : ax.transData;
		} else out[k] = decodeValue(v);
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
		const args = args0.map(decodeValue);
		try {
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
				const kw = decodeKwargs(kwargs, ax);
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
			(ax as unknown as Dyn)[fn]?.(...withKwargs(args, decodeKwargs(kwargs, ax)));
		} catch (error) {
			if (error instanceof MplSpecError && error.message.startsWith(`calls[`)) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new MplSpecError(`calls[${index}] ${fn}: ${message}`);
		}
	});
	return fig;
}
