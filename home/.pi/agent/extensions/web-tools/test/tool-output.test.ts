import test from "node:test";
import assert from "node:assert/strict";
import { ok, type Result } from "../result.ts";
import {
	projectSearchWebResultToPiToolResult,
	type ToolOutputStore,
	type ToolOutputStoreError,
} from "../tool-output.ts";
import { parsePublicHttpUrl, parseSearchQuery } from "../types.ts";

class RecordingToolOutputStore implements ToolOutputStore {
	readonly writes: Array<{ readonly prefix: string; readonly fileName: string; readonly content: string }> = [];

	constructor(private readonly outputPath: string) {}

	async writeTextFile(
		prefix: string,
		fileName: string,
		content: string,
	): Promise<Result<string, ToolOutputStoreError>> {
		this.writes.push({ prefix, fileName, content });
		return ok(this.outputPath);
	}
}

test("projectSearchWebResultToPiToolResult truncates and records full output path", async () => {
	const query = parseSearchQuery("example");
	const url = parsePublicHttpUrl("https://example.com/");
	assert.equal(query._tag, "ok");
	assert.equal(url._tag, "ok");
	const store = new RecordingToolOutputStore("/tmp/full-output.txt");

	const result = await projectSearchWebResultToPiToolResult(
		{
			query: query.value,
			depth: "auto",
			maxResults: 8,
			provider: "exa",
			results: Array.from({ length: 200 }, (_, index) => ({
				title: `Example ${index + 1}`,
				url: url.value,
				snippet: "Documentation-safe example domain.".repeat(20),
			})),
		},
		store,
	);

	assert.equal(result._tag, "ok");
	assert.equal(result.value.details.truncated, true);
	assert.equal(result.value.details.fullOutputPath, "/tmp/full-output.txt");
	assert.match(result.value.content[0]?.type === "text" ? result.value.content[0].text : "", /Output truncated/);
	assert.equal(store.writes.length, 1);
});
