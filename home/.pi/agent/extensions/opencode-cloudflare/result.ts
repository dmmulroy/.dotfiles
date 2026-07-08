/** Successful or failed operation result. */
export type Result<Value, Failure> =
	| { readonly ok: true; readonly value: Value }
	| { readonly ok: false; readonly error: Failure };

/** Create a successful {@link Result}. */
export function success<Value>(value: Value): Result<Value, never> {
	return { ok: true, value };
}

/** Create a failed {@link Result}. */
export function failure<Failure>(error: Failure): Result<never, Failure> {
	return { ok: false, error };
}
