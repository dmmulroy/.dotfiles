/** The outcome of an operation whose expected failures are represented as values. */
export type Result<Value, Failure> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Failure };

/** Construct a successful result. */
export function success<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

/** Construct a failed result. */
export function failure<Failure>(error: Failure): Result<never, Failure> {
  return { ok: false, error };
}
