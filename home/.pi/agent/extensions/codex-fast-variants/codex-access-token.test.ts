import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import {
	type CodexAccessToken,
	createCodexAccessToken,
	revealCodexAccessToken,
} from "./codex-access-token.ts";

test("CodexAccessToken protects accidental string, JSON, and inspect projections", () => {
	const rawAccessToken = "secret-access-token";
	const accessToken = createCodexAccessToken(rawAccessToken);

	assert.equal(String(accessToken), "[REDACTED]");
	assert.equal(JSON.stringify(accessToken), '"[REDACTED]"');
	assert.equal(inspect(accessToken), "[REDACTED]");
	assert.equal(revealCodexAccessToken(accessToken), rawAccessToken);
});

test("revealCodexAccessToken rejects values not created by createCodexAccessToken", () => {
	const forgedAccessToken = {
		toString: () => "[REDACTED]" as const,
		toJSON: () => "[REDACTED]" as const,
	};
	// SAFETY: This test deliberately violates the constructor invariant to verify that revealCodexAccessToken rejects forged wrappers.
	assert.throws(
		() => revealCodexAccessToken(forgedAccessToken as CodexAccessToken),
		/Codex access token was not created by createCodexAccessToken/,
	);
});
