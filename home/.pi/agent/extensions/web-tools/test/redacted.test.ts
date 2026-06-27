import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { Redacted } from "../redacted.ts";

test("Redacted protects accidental string, JSON, and inspect projections", () => {
	const secret = Redacted.make("api-key-123");

	assert.equal(String(secret), "<redacted>");
	assert.equal(JSON.stringify(secret), '"<redacted>"');
	assert.equal(inspect(secret), "<redacted>");
	assert.equal(Redacted.value(secret), "api-key-123");
});

test("Redacted.value rejects values not created by Redacted.make", () => {
	assert.throws(() => Redacted.value({}), /Redacted value was not in registry/);
});
