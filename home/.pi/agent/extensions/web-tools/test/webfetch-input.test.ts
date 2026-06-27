import test from "node:test";
import assert from "node:assert/strict";
import { parseWebFetchToolParams } from "../webfetch-input.ts";
import type { WebToolsSettings } from "../types.ts";

const testFetchSettings: WebToolsSettings["fetch"] = {
	defaultFormat: "markdown",
	timeoutSeconds: 30,
	maxResponseBytes: 5 * 1024 * 1024,
	blockPrivateHosts: true,
	maxRedirects: 5,
	fallbackUserAgent: "opencode",
};

test("parseWebFetchToolParams parses url and applies defaults", () => {
	const result = parseWebFetchToolParams({ url: " https://example.com/docs " }, testFetchSettings);

	assert.equal(result._tag, "ok");
	assert.equal(result.value.format, "markdown");
	assert.equal(result.value.timeoutSeconds, 30);
	assert.equal(result.value.url, "https://example.com/docs");
});

test("parseWebFetchToolParams rejects invalid boundary input", () => {
	assert.equal(parseWebFetchToolParams({ url: "   " }, testFetchSettings)._tag, "err");
	assert.equal(parseWebFetchToolParams({ url: "ftp://example.com" }, testFetchSettings)._tag, "err");
	assert.deepEqual(parseWebFetchToolParams({ url: "https://example.com", format: "pdf" }, testFetchSettings), {
		_tag: "err",
		error: { _tag: "InvalidToolField", field: "format", message: "Expected one of: markdown, text, html" },
	});
	assert.deepEqual(parseWebFetchToolParams({ url: "https://example.com", depth: "auto" }, testFetchSettings), {
		_tag: "err",
		error: { _tag: "UnknownToolField", field: "depth" },
	});
	assert.deepEqual(parseWebFetchToolParams({ url: "https://example.com", timeout: "30" }, testFetchSettings), {
		_tag: "err",
		error: { _tag: "InvalidToolField", field: "timeout", message: "Expected a finite number" },
	});

	const credentialedUrl = parseWebFetchToolParams({ url: "https://user:pass@example.com" }, testFetchSettings);
	assert.equal(credentialedUrl._tag, "err");
	if (credentialedUrl._tag !== "err") {
		return;
	}
	assert.equal(credentialedUrl.error._tag, "UrlCredentialsUnsupported");
	assert.doesNotMatch(JSON.stringify(credentialedUrl.error), /user|pass/);
});

test("parseWebFetchToolParams clamps timeout to supported bounds", () => {
	const low = parseWebFetchToolParams({ url: "https://example.com", timeout: 0 }, testFetchSettings);
	const high = parseWebFetchToolParams({ url: "https://example.com", timeout: 999 }, testFetchSettings);
	const clampedDefault = parseWebFetchToolParams(
		{ url: "https://example.com" },
		{ ...testFetchSettings, timeoutSeconds: 999 },
	);

	assert.equal(low._tag, "ok");
	assert.equal(low.value.timeoutSeconds, 1);
	assert.equal(high._tag, "ok");
	assert.equal(high.value.timeoutSeconds, 120);
	assert.equal(clampedDefault._tag, "ok");
	assert.equal(clampedDefault.value.timeoutSeconds, 120);
});
