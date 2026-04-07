import test from "node:test";
import assert from "node:assert/strict";
import {
	createWebFetchHeaders,
	createWebFetchTool,
	getFallbackUserAgent,
	OPENCODE_WEBFETCH_DEFAULT_USER_AGENT,
	OPENCODE_WEBFETCH_FALLBACK_USER_AGENT,
	shouldRetryWithFallbackUserAgent,
} from "../webfetch.ts";

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

test("webfetch injects resolved profile cookies into the request headers and reports auth context", async () => {
	let capturedHeaders: Record<string, string> | undefined;
	const tool = createWebFetchTool({
		resolveAuth: async () => ({
			cookieHeader: "session=abc123",
			context: { identity: "helium", strategy: "cdp", cookieCount: 1 },
		}),
		fetchWithRedirects: async (url, options) => {
			capturedHeaders = options.getHeaders ? await options.getHeaders(url) : options.headers;
			return {
				response: new Response("hello from auth", {
					status: 200,
					headers: { "content-type": "text/plain; charset=utf-8" },
				}),
				finalUrl: new URL("https://example.com/private"),
			};
		},
	});

	const result = await tool.execute("tool-call-1", {
		url: "https://example.com/private",
		format: "text",
	});

	assert.equal(capturedHeaders?.Cookie, "session=abc123");
	assert.equal(result.details?.auth?.strategy, "cdp");
	assert.equal(result.details?.auth?.cookieCount, 1);
	const firstContent = result.content[0];
	assert.equal(firstContent?.type, "text");
	assert.match(firstContent?.type === "text" ? firstContent.text : "", /hello from auth/);
});

test("webfetch reuses resolved auth across fallback retries for the same URL", async () => {
	let resolveAuthCalls = 0;
	const seenUserAgents: string[] = [];
	const tool = createWebFetchTool({
		resolveAuth: async () => {
			resolveAuthCalls += 1;
			return {
				cookieHeader: "session=abc123",
				context: { identity: "helium", strategy: "cdp", cookieCount: 1 },
			};
		},
		fetchWithRedirects: async (url, options) => {
			const headers = options.getHeaders ? await options.getHeaders(url) : options.headers;
			seenUserAgents.push(headers?.["User-Agent"] ?? "");
			if (seenUserAgents.length === 1) {
				return {
					response: new Response("challenge", {
						status: 403,
						headers: { "cf-mitigated": "challenge", "content-type": "text/plain" },
					}),
					finalUrl: url,
				};
			}
			return {
				response: new Response("ok", {
					status: 200,
					headers: { "content-type": "text/plain; charset=utf-8" },
				}),
				finalUrl: url,
			};
		},
	});

	const result = await tool.execute("tool-call-retry", {
		url: "https://example.com/private",
		format: "text",
	});

	assert.equal(resolveAuthCalls, 1);
	assert.equal(seenUserAgents[0], OPENCODE_WEBFETCH_DEFAULT_USER_AGENT);
	assert.equal(seenUserAgents[1], OPENCODE_WEBFETCH_FALLBACK_USER_AGENT);
	assert.equal(result.details?.auth?.strategy, "cdp");
});

test("webfetch surfaces Helium auth resolution failures instead of silently downgrading to public fetches", async () => {
	const tool = createWebFetchTool({
		resolveAuth: async () => {
			throw new Error(
				"Authenticated Helium cookies unavailable (CDP: Helium CDP connection closed before reply for Storage.getCookies; disk cookies: Unable to decrypt one or more Helium cookies)",
			);
		},
		fetchWithRedirects: async (url, options) => {
			await options.getHeaders?.(url);
			throw new Error("fetch should not run when auth resolution fails");
		},
	});

	await assert.rejects(
		tool.execute("tool-call-2", {
			url: "https://example.com/private",
			format: "text",
		}),
		/Authenticated Helium cookies unavailable/,
	);
});
