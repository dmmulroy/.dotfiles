import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicHttpUrl, redactUrlCredentialsForDisplay } from "../types.ts";

test("parsePublicHttpUrl requires explicit HTTP URL slashes", () => {
	assert.deepEqual(parsePublicHttpUrl("http:example.com"), {
		_tag: "err",
		error: { _tag: "UnsupportedUrlProtocol", protocol: "http:" },
	});
});

test("parsePublicHttpUrl rejects URL credentials with redacted diagnostics", () => {
	const result = parsePublicHttpUrl("https://user:pass@example.com/docs");

	assert.equal(result._tag, "err");
	assert.equal(result.error._tag, "UrlCredentialsUnsupported");
	if (result.error._tag !== "UrlCredentialsUnsupported") {
		return;
	}
	assert.equal(String(result.error.url), "<redacted>");
	assert.deepEqual(JSON.parse(JSON.stringify(result.error)), {
		_tag: "UrlCredentialsUnsupported",
		url: "<redacted>",
	});
});

test("parsePublicHttpUrl redacts invalid URL input in parse errors", () => {
	const result = parsePublicHttpUrl("http://user:pass@");

	assert.equal(result._tag, "err");
	assert.equal(result.error._tag, "InvalidUrl");
	if (result.error._tag !== "InvalidUrl") {
		return;
	}
	assert.equal(String(result.error.input), "<redacted>");
	assert.deepEqual(JSON.parse(JSON.stringify(result.error)), {
		_tag: "InvalidUrl",
		input: "<redacted>",
	});
});

test("redactUrlCredentialsForDisplay hides userinfo credentials only", () => {
	assert.equal(redactUrlCredentialsForDisplay("https://user:pass@example.com/docs"), "<redacted>");
	assert.equal(redactUrlCredentialsForDisplay("https://example.com/docs"), "https://example.com/docs");
	assert.equal(redactUrlCredentialsForDisplay("http://user:pass@"), "<redacted>");
});
