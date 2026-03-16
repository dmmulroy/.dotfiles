import test from "node:test";
import assert from "node:assert/strict";
import { extractSearchTextFromResponse, parseExaSearchText, parseSseDataLines } from "../providers/exa.ts";
import { formatSearchResults } from "../websearch.ts";

const RAW_PROVIDER_TEXT = [
	"Title: Example Domain",
	"URL: https://example.com/",
	"Text: Example Domain",
	"",
	"# Example Domain",
	"",
	"This domain is for use in documentation examples without needing permission.",
	"",
	"Title: Another Example",
	"Published Date: 2024-01-01T00:00:00.000Z",
	"URL: https://example.org/",
	"Text: Another Example",
	"",
	"Useful secondary snippet.",
].join("\n");

const SSE_RESPONSE = `event: message\ndata: ${JSON.stringify({
	result: {
		content: [{ type: "text", text: RAW_PROVIDER_TEXT }],
	},
	jsonrpc: "2.0",
	id: 1,
})}\n\n`;

test("parseSseDataLines extracts JSON payloads from event streams", () => {
	const chunks = parseSseDataLines(SSE_RESPONSE);
	assert.equal(chunks.length, 1);
	assert.match(chunks[0] ?? "", /"jsonrpc":"2.0"/);
});

test("extractSearchTextFromResponse extracts the provider text blob", () => {
	const text = extractSearchTextFromResponse(SSE_RESPONSE, "text/event-stream");
	assert.match(text, /^Title: Example Domain/m);
	assert.match(text, /^Title: Another Example/m);
});

test("parseExaSearchText converts provider text into normalized results", () => {
	const text = extractSearchTextFromResponse(SSE_RESPONSE, "text/event-stream");
	const results = parseExaSearchText(text);
	assert.equal(results.length, 2);
	assert.deepEqual(results[0], {
		title: "Example Domain",
		url: "https://example.com/",
		snippet: "This domain is for use in documentation examples without needing permission.",
		publishedAt: undefined,
		source: undefined,
		score: undefined,
	});
	assert.equal(results[1]?.publishedAt, "2024-01-01T00:00:00.000Z");
});

test("formatSearchResults renders deterministic URL-forward output", () => {
	const output = formatSearchResults("example query", [
		{
			title: "Example Domain",
			url: "https://example.com/",
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
