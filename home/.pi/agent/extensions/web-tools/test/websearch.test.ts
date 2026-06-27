import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicHttpUrl } from "../types.ts";
import { formatSearchResults } from "../websearch.ts";

test("formatSearchResults renders deterministic URL-forward output", () => {
	const url = parsePublicHttpUrl("https://example.com/");
	assert.equal(url._tag, "ok");

	const output = formatSearchResults("example query", [
		{
			title: "Example Domain",
			url: url.value,
			snippet: "Documentation-safe example domain.",
		},
	]);
	assert.equal(
		output,
		[
			"Search results for: example query",
			"",
			"1. Example Domain",
			"   URL: https://example.com/",
			"   Snippet: Documentation-safe example domain.",
		].join("\n"),
	);
});
