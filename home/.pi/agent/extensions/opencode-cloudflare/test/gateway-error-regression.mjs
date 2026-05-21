import assert from "node:assert/strict";
import { streamOpencodeCloudflare } from "../dispatch.ts";
import { clearGatewayConfigCache } from "../wellknown.ts";

const gatewayToken = "cf-access-token-value";
const structuredUnauthorized = JSON.stringify({
	error: "Unauthorized",
	message: "Invalid token",
	status: 401,
	timestamp: "2026-05-19T00:00:00.000Z",
});
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
	const url = typeof input === "string" ? input : input.url;
	if (url.endsWith("/.well-known/opencode")) {
		return new Response("gateway config unavailable in test", { status: 503 });
	}
	if (url.includes(":streamGenerateContent?alt=sse")) {
		return new Response(structuredUnauthorized, {
			status: 401,
			headers: { "content-type": "application/json" },
		});
	}
	throw new Error(`Unexpected fetch in gateway error regression: ${url}`);
};

try {
	clearGatewayConfigCache();
	const model = {
		id: "gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		api: "opencode-cloudflare",
		provider: "opencode.cloudflare.dev",
		baseUrl: "https://opencode.cloudflare.dev",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 64000,
	};
	const context = {
		messages: [{ role: "user", content: "Reply", timestamp: Date.now() }],
	};

	let errorMessage;
	const stream = streamOpencodeCloudflare(model, context, { apiKey: gatewayToken });
	for await (const event of stream) {
		if (event.type === "error") errorMessage = event.error.errorMessage;
	}

	assert.match(errorMessage || "", /rejected the Access token/);
	assert.match(errorMessage || "", /Invalid token/);
	assert.match(errorMessage || "", /\/login opencode\.cloudflare\.dev/);
	assert.match(errorMessage || "", /\/opencode-cf-sync-auth/);
	console.log("gateway error regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
	clearGatewayConfigCache();
}
