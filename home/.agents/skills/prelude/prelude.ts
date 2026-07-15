// LOCAL RESULT FALLBACK — enable only when the project uses neither Effect nor
// better-result, as directed by the bootstrap-prelude skill.
//
// /** The result of an operation that can fail with an expected error. */
// export type Result<T, E extends Error> =
//   | { readonly _tag: 'ok'; readonly value: T }
//   | { readonly _tag: 'err'; readonly error: E };
//
// /** Construct a successful result. */
// export function ok<T>(value: T): Result<T, never> {
//   return { _tag: 'ok', value };
// }
//
// /** Construct a failed result. */
// export function err<E extends Error>(error: E): Result<never, E> {
//   return { _tag: 'err', error };
// }
//
// /** Map the success value of a result. */
// export function map<T, U, E extends Error>(
//   result: Result<T, E>,
//   fn: (value: T) => U,
// ): Result<U, E> {
//   return result._tag === 'ok' ? ok(fn(result.value)) : result;
// }
//
// /** Map the error value of a result. */
// export function mapError<T, E extends Error, F extends Error>(
//   result: Result<T, E>,
//   fn: (error: E) => F,
// ): Result<T, F> {
//   return result._tag === 'err' ? err(fn(result.error)) : result;
// }
//
// /** Chain an operation that can return another expected failure. */
// export function andThen<T, U, E extends Error, F extends Error>(
//   result: Result<T, E>,
//   fn: (value: T) => Result<U, F>,
// ): Result<U, E | F> {
//   return result._tag === 'ok' ? fn(result.value) : result;
// }

/** Return the string literal tags present in an `_tag`-discriminated union. */
export type Tags<E> = E extends { readonly _tag: string } ? E['_tag'] : never;

/** Extract members of a union whose `_tag` is assignable to `K`. */
export type ExtractTag<E, K> = Extract<E, { readonly _tag: K }>;

/** Exclude members of a union whose `_tag` is assignable to `K`. */
export type ExcludeTag<E, K> = Exclude<E, { readonly _tag: K }>;

/**
 * Mark exhaustive handling of a closed union.
 *
 * @throws Always, because reaching this function indicates a defect.
 */
export function casesHandled(unexpectedCase: never): never {
  void unexpectedCase;
  return shouldNeverHappen('A closed union was not handled exhaustively');
}

/**
 * Fail when an internal invariant has been violated.
 *
 * @throws Always.
 */
export function shouldNeverHappen(
  message = 'An internal invariant was violated',
): never {
  throw new Error(message);
}

/**
 * Fail from a deliberately unfinished code path.
 *
 * @throws Always.
 */
export function notYetImplemented(
  message = 'This code path has not yet been implemented',
): never {
  throw new Error(message);
}

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

/** A sensitive value protected from accidental logging and serialization. */
export interface Redacted<A> {
  readonly [redactedBrand]?: A;
  toString(): string;
  toJSON(): string;
}

const registry = new WeakMap<object, unknown>();

const proto = {
  toString() {
    return '<redacted>';
  },
  toJSON() {
    return '<redacted>';
  },
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return '<redacted>';
  },
};

function makeRedacted<A>(value: A): Redacted<A> {
  // SAFETY: Object.create installs the complete Redacted prototype, and the new
  // object is registered with its value before it escapes this function.
  const redacted: Redacted<A> = Object.create(proto) as Redacted<A>;
  registry.set(redacted, value);
  return redacted;
}

function readRedactedValue<A>(self: Redacted<A>): A;
function readRedactedValue(self: unknown): unknown;
function readRedactedValue(self: unknown): unknown {
  if (typeof self !== 'object' || self === null || !registry.has(self)) {
    throw new Error('Redacted value was not in registry');
  }
  return registry.get(self);
}

/** Operations for constructing and deliberately revealing redacted values. */
export const Redacted = {
  make: makeRedacted,
  value: readRedactedValue,
} as const;
