import assert from "node:assert/strict";
import { test } from "node:test";
import { isJsonObject, isJsonString, parseJsonObject, parseJsonValue } from "../json-value.ts";

test("parseJsonValue decodes JSON primitives, arrays, and objects", () => {
	assert.deepEqual(parseJsonValue(null), { ok: true, value: null });
	assert.deepEqual(parseJsonValue("token"), { ok: true, value: "token" });
	assert.deepEqual(parseJsonValue(1), { ok: true, value: 1 });
	assert.deepEqual(parseJsonValue(true), { ok: true, value: true });
	assert.deepEqual(parseJsonValue(["a", 1]), { ok: true, value: ["a", 1] });
	assert.deepEqual(parseJsonValue({ token: "imported" }), { ok: true, value: { token: "imported" } });
});

test("parseJsonValue rejects non-JSON values at the boundary", () => {
	const parsed = parseJsonValue(undefined);
	assert.equal(parsed.ok, false);
	assert.match(parsed.error.message, /expected a JSON value/);
});

test("parseJsonObject requires an object after JSON decoding", () => {
	assert.equal(parseJsonObject([]).ok, false);
	assert.equal(parseJsonObject("token").ok, false);
	const parsed = parseJsonObject({ token: "imported" });
	assert.equal(parsed.ok, true);
	assert.equal(isJsonObject(parsed.value), true);
	assert.equal(isJsonString(parsed.value.token), true);
});
