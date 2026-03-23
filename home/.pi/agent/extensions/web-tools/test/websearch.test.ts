import test from "node:test";
import assert from "node:assert/strict";
import {
	ExaSearchProvider,
	extractSearchErrorFromResponse,
	extractSearchTextFromResponse,
	normalizeExaDepth,
	parseExaSearchText,
	parseSseDataLines,
} from "../providers/exa.ts";
import { formatSearchResults } from "../websearch.ts";

const LEGACY_PROVIDER_TEXT = [
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

const CURRENT_PROVIDER_TEXT = [
	"Search Time: 1234.5ms",
	"",
	"Title: Cloudflare Testing - Hono",
	"URL: https://hono.dev/examples/cloudflare-vitest",
	"Published: N/A",
	"Author: N/A",
	"Highlights:",
	"Cloudflare Testing - Hono",
	"",
	"Use env from cloudflare:test with app.request().",
	"",
	"---",
	"",
	"Title: Test APIs · Cloudflare Workers docs",
	"URL: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/",
	"Published: 2026-03-18T20:14:02.561Z",
	"Author: N/A",
	"Highlights:",
	"Test APIs · Cloudflare Workers docs",
	"",
	"fetchMock.disableNetConnect()",
].join("\n");

const SSE_RESPONSE = `event: message\ndata: ${JSON.stringify({
	result: {
		content: [{ type: "text", text: LEGACY_PROVIDER_TEXT }],
	},
	jsonrpc: "2.0",
	id: 1,
})}\n\n`;

const SSE_ERROR_RESPONSE = `event: message\ndata: ${JSON.stringify({
	result: {
		content: [{ type: "text", text: "MCP error -32602: Invalid enum value" }],
		isError: true,
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

test("extractSearchErrorFromResponse extracts provider-side MCP errors", () => {
	assert.equal(extractSearchTextFromResponse(SSE_ERROR_RESPONSE, "text/event-stream"), "");
	assert.equal(extractSearchErrorFromResponse(SSE_ERROR_RESPONSE, "text/event-stream"), "MCP error -32602: Invalid enum value");
});

test("parseExaSearchText converts legacy provider text into normalized results", () => {
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

test("parseExaSearchText supports current Exa search labels and strips boilerplate", () => {
	const results = parseExaSearchText(CURRENT_PROVIDER_TEXT);
	assert.equal(results.length, 2);
	assert.deepEqual(results[0], {
		title: "Cloudflare Testing - Hono",
		url: "https://hono.dev/examples/cloudflare-vitest",
		snippet: "Use env from cloudflare:test with app.request().",
		publishedAt: undefined,
		source: undefined,
		score: undefined,
	});
	assert.equal(results[1]?.publishedAt, "2026-03-18T20:14:02.561Z");
	assert.equal(results[1]?.source, undefined);
	assert.equal(results[1]?.snippet, "fetchMock.disableNetConnect()");
});

test("normalizeExaDepth keeps compatible depths and downgrades deep to fast", () => {
	assert.equal(normalizeExaDepth("auto"), "auto");
	assert.equal(normalizeExaDepth("fast"), "fast");
	assert.equal(normalizeExaDepth("deep"), "fast");
});

test("ExaSearchProvider sends fast when deep is requested", async () => {
	const originalFetch = globalThis.fetch;
	let requestBody = "";

	globalThis.fetch = async (_input, init) => {
		requestBody = String(init?.body ?? "");
		return new Response(
			JSON.stringify({
				result: {
					content: [{ type: "text", text: LEGACY_PROVIDER_TEXT }],
				},
			}),
			{
				status: 200,
				headers: { "content-type": "application/json" },
			},
		);
	};

	try {
		const provider = new ExaSearchProvider("https://example.test/mcp");
		const results = await provider.search({ query: "example", maxResults: 5, depth: "deep" });
		assert.equal(results.length, 2);
		const payload = JSON.parse(requestBody) as { params?: { arguments?: { type?: string } } };
		assert.equal(payload.params?.arguments?.type, "fast");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("ExaSearchProvider throws provider-side errors instead of treating them as empty results", async () => {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = async () =>
		new Response(SSE_ERROR_RESPONSE, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});

	try {
		const provider = new ExaSearchProvider("https://example.test/mcp");
		await assert.rejects(
			provider.search({ query: "example", maxResults: 5, depth: "fast" }),
			/MCP error -32602: Invalid enum value/,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
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
