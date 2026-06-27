import test from "node:test";
import assert from "node:assert/strict";
import { parseWebSearchToolParams } from "../websearch-input.ts";
import { parsePublicHttpUrl, type WebToolsSettings } from "../types.ts";

const endpoint = mustParsePublicHttpUrl("https://example.test/mcp");

const testSearchSettings: WebToolsSettings["search"] = {
	enabled: true,
	provider: "exa",
	endpoint,
	timeoutSeconds: 25,
	defaultMaxResults: 8,
	defaultDepth: "auto",
};

test("parseWebSearchToolParams trims query and applies defaults", () => {
	const result = parseWebSearchToolParams({ query: "  example docs  " }, testSearchSettings);

	assert.equal(result._tag, "ok");
	assert.equal(result.value.query, "example docs");
	assert.equal(result.value.maxResults, 8);
	assert.equal(result.value.depth, "auto");
	assert.equal(result.value.timeoutSeconds, 25);
});

test("parseWebSearchToolParams accepts deep and clamps maxResults", () => {
	const low = parseWebSearchToolParams({ query: "example", maxResults: 0, depth: "deep" }, testSearchSettings);
	const high = parseWebSearchToolParams({ query: "example", maxResults: 999 }, testSearchSettings);
	const clampedDefault = parseWebSearchToolParams(
		{ query: "example" },
		{ ...testSearchSettings, defaultMaxResults: 999 },
	);

	assert.equal(low._tag, "ok");
	assert.equal(low.value.depth, "deep");
	assert.equal(low.value.maxResults, 1);
	assert.equal(high._tag, "ok");
	assert.equal(high.value.maxResults, 20);
	assert.equal(clampedDefault._tag, "ok");
	assert.equal(clampedDefault.value.maxResults, 20);
});

test("parseWebSearchToolParams rejects invalid boundary input", () => {
	assert.deepEqual(parseWebSearchToolParams({ query: "   " }, testSearchSettings), {
		_tag: "err",
		error: { _tag: "EmptySearchQuery" },
	});
	assert.deepEqual(parseWebSearchToolParams({ query: "example", depth: "slow" }, testSearchSettings), {
		_tag: "err",
		error: { _tag: "InvalidToolField", field: "depth", message: "Expected one of: auto, fast, deep" },
	});
	assert.deepEqual(parseWebSearchToolParams({ query: "example", maxResults: "8" }, testSearchSettings), {
		_tag: "err",
		error: { _tag: "InvalidToolField", field: "maxResults", message: "Expected a finite number" },
	});
	assert.deepEqual(parseWebSearchToolParams({ query: "example", timeout: 1 }, testSearchSettings), {
		_tag: "err",
		error: { _tag: "UnknownToolField", field: "timeout" },
	});
});

function mustParsePublicHttpUrl(input: string) {
	const parsed = parsePublicHttpUrl(input);
	if (parsed._tag === "err") {
		throw new Error("Invalid test URL");
	}
	return parsed.value;
}
