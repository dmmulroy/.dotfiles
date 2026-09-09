/** Expected gateway failures stay values until a CLI or Pi callback translates them. */
export type GatewayResult<T, E extends Error> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

/** Create a successful gateway operation result. */
export function gatewaySuccess<T>(value: T): GatewayResult<T, never> { return { ok: true, value }; }

/** Create a failed gateway operation result without throwing across application boundaries. */
export function gatewayFailure<E extends Error>(error: E): GatewayResult<never, E> { return { ok: false, error }; }

/** Terminal text from remote sources must not execute control sequences. */
export function gatewayDisplayText(text: string): string {
	return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}
