import test from "node:test";
import assert from "node:assert/strict";
import { err, ok } from "../result.ts";

test("ok and err preserve typed result tags", () => {
	const success = ok("value");
	assert.equal(success._tag, "ok");

	const failure = err({ _tag: "ExampleFailure" as const });
	assert.equal(failure._tag, "err");
});
