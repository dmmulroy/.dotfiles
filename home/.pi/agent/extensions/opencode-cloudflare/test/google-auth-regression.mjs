import assert from "node:assert/strict";
import { streamOpencodeCloudflare } from "../dispatch.ts";
import { clearGatewayConfigCache } from "../wellknown.ts";

const gatewayToken = "cf-access-token-value";
const capturedRequests = [];

const sseBody = [
	'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n',
].join("");

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = typeof input === "string" ? input : input.url;
	capturedRequests.push({
		url,
		headers: new Headers(init?.headers),
	});

	if (url.endsWith("/.well-known/opencode")) {
		return new Response("gateway unavailable", { status: 503 });
	}

	return new Response(sseBody, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
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
		messages: [
			{ role: "user", content: "Reply with exactly ok", timestamp: Date.now() },
		],
	};

	const stream = streamOpencodeCloudflare(model, context, { apiKey: gatewayToken });
	for await (const event of stream) {
		if (event.type === "error") {
			throw new Error(event.error.errorMessage || "unexpected google stream error");
		}
	}

	const request = capturedRequests.find((entry) => entry.url.includes(":streamGenerateContent?alt=sse"));
	assert.ok(request, "expected a Google gateway request");
	assert.equal(request.url, "https://opencode.cloudflare.dev/google-ai-studio/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
	assert.equal(request.headers.get("authorization"), `Bearer ${gatewayToken}`);
	assert.equal(request.headers.get("x-goog-api-key"), null);
	assert.equal(request.headers.get("cf-access-token"), gatewayToken);

	console.log("google auth regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
	clearGatewayConfigCache();
}
