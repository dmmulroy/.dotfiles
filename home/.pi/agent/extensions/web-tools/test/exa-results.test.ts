import test from "node:test";
import assert from "node:assert/strict";
import { parseExaSearchText } from "../providers/exa-results.ts";

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

test("parseExaSearchText converts legacy provider text into normalized results", () => {
	const parsed = parseExaSearchText(LEGACY_PROVIDER_TEXT);

	assert.equal(parsed.results.length, 2);
	assert.deepEqual(parsed.results[0], {
		title: "Example Domain",
		url: "https://example.com/",
		snippet: "This domain is for use in documentation examples without needing permission.",
		publishedAt: undefined,
		source: undefined,
		score: undefined,
	});
	assert.equal(parsed.results[1]?.publishedAt, "2024-01-01T00:00:00.000Z");
	assert.equal(parsed.discardedSections, 0);
	assert.equal(parsed.explicitNoResults, false);
});

test("parseExaSearchText supports current Exa labels and strips repeated titles", () => {
	const parsed = parseExaSearchText(CURRENT_PROVIDER_TEXT);

	assert.equal(parsed.results.length, 2);
	assert.deepEqual(parsed.results[0], {
		title: "Cloudflare Testing - Hono",
		url: "https://hono.dev/examples/cloudflare-vitest",
		snippet: "Use env from cloudflare:test with app.request().",
		publishedAt: undefined,
		source: undefined,
		score: undefined,
	});
	assert.equal(parsed.results[1]?.publishedAt, "2026-03-18T20:14:02.561Z");
	assert.equal(parsed.results[1]?.source, undefined);
	assert.equal(parsed.results[1]?.snippet, "fetchMock.disableNetConnect()");
});

test("parseExaSearchText discards sections without valid public HTTP URLs", () => {
	const parsed = parseExaSearchText(
		[
			"Title: Missing URL",
			"Text: no url here",
			"",
			"Title: Bad URL",
			"URL: file:///tmp/example",
			"Text: bad url",
			"",
			"Title: Credentialed URL",
			"URL: https://user:pass@example.com/secret",
			"Text: bad credentials",
			"",
			"Title: Good URL",
			"URL: https://example.net/path",
			"Text: useful",
		].join("\n"),
	);

	assert.equal(parsed.results.length, 1);
	assert.equal(parsed.results[0]?.url, "https://example.net/path");
	assert.equal(parsed.discardedSections, 3);
});

test("parseExaSearchText recognizes explicit no-results text", () => {
	const parsed = parseExaSearchText("No results found for this query.");

	assert.deepEqual(parsed.results, []);
	assert.equal(parsed.explicitNoResults, true);
});
