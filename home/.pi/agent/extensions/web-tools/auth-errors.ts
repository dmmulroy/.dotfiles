import type { AuthSourceName } from "./types.ts";

export type AuthSourceErrorCode = "unavailable" | "failed" | "cancelled";

export class AuthSourceError extends Error {
	readonly source: AuthSourceName;
	readonly code: AuthSourceErrorCode;

	constructor(source: AuthSourceName, code: AuthSourceErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = "AuthSourceError";
		this.source = source;
		this.code = code;
		if (cause !== undefined) {
			(this as Error & { cause?: unknown }).cause = cause;
		}
	}
}

export function isAuthSourceError(error: unknown): error is AuthSourceError {
	return error instanceof AuthSourceError;
}

export function toAuthSourceError(
	source: AuthSourceName,
	error: unknown,
	fallbackMessage: string,
	fallbackCode: AuthSourceErrorCode = "failed",
): AuthSourceError {
	if (error instanceof AuthSourceError) {
		return error;
	}
	if (error instanceof Error) {
		const code = error.name === "AbortError" ? "cancelled" : fallbackCode;
		const message = error.message?.trim() || fallbackMessage;
		return new AuthSourceError(source, code, message, error);
	}
	return new AuthSourceError(source, fallbackCode, fallbackMessage);
}

export function formatAuthSourceError(error: AuthSourceError): string {
	const label = error.source === "cdp" ? "CDP" : "disk cookies";
	return `${label}: ${error.message}`;
}
