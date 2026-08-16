/**
 * Redacted<T> — branded wrapper that prevents accidental logging/serialization.
 *
 * Vendored from cloudflare-agent/packages/redacted (MIT).
 * Only the core primitive — no header/request/hono layers.
 *
 * Usage:
 *   const secret = Redacted.make("api-key-123");
 *   String(secret);          // "<redacted>"
 *   JSON.stringify(secret);  // '"<redacted>"'
 *   Redacted.value(secret);  // "api-key-123"
 */
declare const redactedBrand: unique symbol;

/** A sensitive value wrapper with safe string, JSON, and inspect projections. */
export interface Redacted<A> {
	readonly [redactedBrand]?: A;
	toString(): string;
	toJSON(): string;
}

const registry = new WeakMap<Redacted<never>, never>();

const proto = {
	toString() {
		return "<redacted>";
	},
	toJSON() {
		return "<redacted>";
	},
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return "<redacted>";
	},
};

function makeRedacted<A>(value: A): Redacted<A> {
	// SAFETY: Object.create(proto) yields the Redacted methods; the brand is
	// established only here, and callers cannot construct Redacted except through make.
	const redacted = Object.create(proto) as Redacted<A>;
	// SAFETY: WeakMap cannot express a generic brand; make and value are the only accessors.
	registry.set(redacted as Redacted<never>, value as never);
	return redacted;
}

function readRedactedValue<A>(self: Redacted<A>): A {
	// SAFETY: WeakMap cannot express a generic brand; only values created by make are stored.
	const stored = registry.get(self as Redacted<never>);
	if (stored === undefined && !registry.has(self as Redacted<never>)) {
		throw new Error("Redacted value was not in registry");
	}
	return stored as A;
}

/** Constructors and safe unwrap operation for Redacted values. */
export const Redacted = {
	make: makeRedacted,
	value: readRedactedValue,
} as const;
