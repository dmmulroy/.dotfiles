declare const redactedBrand: unique symbol;

/** Sensitive value wrapper whose string and JSON projections are always redacted. */
export interface Redacted<Value> {
	/** Phantom type marker; the sensitive value is stored outside the object. */
	readonly [redactedBrand]?: Value;
	/** Return a safe redacted string projection. */
	toString(): string;
	/** Return a safe redacted JSON projection. */
	toJSON(): string;
}

const redactedValues = new WeakMap<object, unknown>();
const redactedPrototype = {
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

function makeRedacted<Value>(value: Value): Redacted<Value> {
	// SAFETY: Object.create supplies every Redacted method, while the WeakMap owns the hidden value.
	const redacted = Object.create(redactedPrototype) as Redacted<Value>;
	redactedValues.set(redacted, value);
	return redacted;
}

function readRedactedValue<Value>(redacted: Redacted<Value>): Value;
function readRedactedValue(redacted: unknown): unknown;
function readRedactedValue(redacted: unknown): unknown {
	if (typeof redacted !== "object" || redacted === null || !redactedValues.has(redacted)) {
		throw new Error("Redacted value was not created by this module");
	}
	return redactedValues.get(redacted);
}

/** Create and explicitly unwrap sensitive values at their final I/O boundary. */
export const Redacted = {
	make: makeRedacted,
	value: readRedactedValue,
} as const;
