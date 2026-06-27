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

const registry = new WeakMap<object, unknown>();

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
	const redacted: Redacted<A> = Object.create(proto) as Redacted<A>;
	registry.set(redacted, value);
	return redacted;
}

function readRedactedValue<A>(self: Redacted<A>): A;
function readRedactedValue(self: unknown): unknown;
function readRedactedValue(self: unknown): unknown {
	if (typeof self !== "object" || self === null || !registry.has(self)) {
		throw new Error("Redacted value was not in registry");
	}
	return registry.get(self);
}

/** Constructors and safe unwrap operation for Redacted values. */
export const Redacted = {
	make: makeRedacted,
	value: readRedactedValue,
} as const;
