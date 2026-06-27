/** A typed success/failure result for expected failures in local code. */
export type Result<T, E> =
	| { readonly _tag: "ok"; readonly value: T }
	| { readonly _tag: "err"; readonly error: E };

/** Construct a successful Result. */
export function ok<T>(value: T): Result<T, never> {
	return { _tag: "ok", value };
}

/** Construct a failed Result. */
export function err<E>(error: E): Result<never, E> {
	return { _tag: "err", error };
}

/** Returns true when a Result is successful. */
export function isOk<T, E>(result: Result<T, E>): result is { readonly _tag: "ok"; readonly value: T } {
	return result._tag === "ok";
}

/** Returns true when a Result is failed. */
export function isErr<T, E>(result: Result<T, E>): result is { readonly _tag: "err"; readonly error: E } {
	return result._tag === "err";
}
