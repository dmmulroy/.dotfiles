import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { truncateTextOutput } from "../truncation.ts";

test("truncateTextOutput writes the full output to a temp file when truncated", async () => {
	const output = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
	const truncated = await truncateTextOutput(output, {
		maxLines: 5,
		maxBytes: 10_000,
		tempPrefix: "pi-web-tools-test-",
		fileName: "output.txt",
	});

	assert.equal(truncated.truncated, true);
	assert.ok(truncated.fullOutputPath);
	assert.match(truncated.text, /Output truncated:/);
	const saved = await readFile(truncated.fullOutputPath!, "utf8");
	assert.equal(saved, output);
});
