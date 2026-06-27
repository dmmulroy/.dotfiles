import test from "node:test";
import assert from "node:assert/strict";
import {
	createWebFetchTool,
	createWebFetchHeaders,
	getFallbackUserAgent,
	OPENCODE_WEBFETCH_DEFAULT_USER_AGENT,
	OPENCODE_WEBFETCH_FALLBACK_USER_AGENT,
	shouldRetryWithFallbackUserAgent,
} from "../webfetch.ts";

test("webfetch execute rejects URL credentials with a safe message", async () => {
	const tool = createWebFetchTool();

	await assert.rejects(
		tool.execute("id", { url: "https://user:pass@example.com/secret" }),
		(error: unknown) => error instanceof Error && error.message === "URL credentials are not supported",
	);
});

test("createWebFetchHeaders uses the OpenCode browser-like default user agent", () => {
	const headers = createWebFetchHeaders("text/html");
	assert.equal(headers["User-Agent"], OPENCODE_WEBFETCH_DEFAULT_USER_AGENT);
	assert.equal(headers.Accept, "text/html");
	assert.equal(headers["Accept-Language"], "en-US,en;q=0.9");
});

test("getFallbackUserAgent prefers the configured setting and otherwise falls back to opencode", () => {
	assert.equal(getFallbackUserAgent("my-agent/1.0"), "my-agent/1.0");
	assert.equal(getFallbackUserAgent("  custom-agent  "), "custom-agent");
	assert.equal(getFallbackUserAgent(""), OPENCODE_WEBFETCH_FALLBACK_USER_AGENT);
	assert.equal(getFallbackUserAgent("   "), OPENCODE_WEBFETCH_FALLBACK_USER_AGENT);
	assert.equal(getFallbackUserAgent(undefined), OPENCODE_WEBFETCH_FALLBACK_USER_AGENT);
});

test("shouldRetryWithFallbackUserAgent only retries the Cloudflare challenge case", () => {
	assert.equal(
		shouldRetryWithFallbackUserAgent({
			status: 403,
			headers: new Headers({ "cf-mitigated": "challenge" }),
		}),
		true,
	);
	assert.equal(
		shouldRetryWithFallbackUserAgent({
			status: 403,
			headers: new Headers(),
		}),
		false,
	);
	assert.equal(
		shouldRetryWithFallbackUserAgent({
			status: 429,
			headers: new Headers({ "cf-mitigated": "challenge" }),
		}),
		false,
	);
});
