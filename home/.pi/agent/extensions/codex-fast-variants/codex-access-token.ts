declare const codexAccessTokenBrand: unique symbol;

/** A Codex OAuth access token with safe string, JSON, and inspect projections. */
export interface CodexAccessToken {
	readonly [codexAccessTokenBrand]: "CodexAccessToken";
	toString(): "[REDACTED]";
	toJSON(): "[REDACTED]";
}

const codexAccessTokenValues = new WeakMap<object, string>();
const redactedCodexAccessTokenPrototype = {
	toString(): "[REDACTED]" {
		return "[REDACTED]";
	},
	toJSON(): "[REDACTED]" {
		return "[REDACTED]";
	},
	[Symbol.for("nodejs.util.inspect.custom")](): "[REDACTED]" {
		return "[REDACTED]";
	},
};

/** Wrap a raw Codex OAuth access token immediately at the extension boundary. */
export function createCodexAccessToken(value: string): CodexAccessToken {
	// SAFETY: The private prototype implements CodexAccessToken, and only this constructor registers wrappers that revealCodexAccessToken accepts.
	const accessToken = Object.create(redactedCodexAccessTokenPrototype) as CodexAccessToken;
	codexAccessTokenValues.set(accessToken, value);
	return accessToken;
}

/** Reveal a Codex access token only inside the catalog module that performs authenticated I/O. */
export function revealCodexAccessToken(accessToken: CodexAccessToken): string {
	const value = codexAccessTokenValues.get(accessToken);
	if (value === undefined) {
		throw new Error("Codex access token was not created by createCodexAccessToken");
	}
	return value;
}
