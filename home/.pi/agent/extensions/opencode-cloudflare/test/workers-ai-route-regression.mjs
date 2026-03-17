import assert from "node:assert/strict";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai";

const gatewayToken = "cf-access-token-value";
const capturedRequests = [];

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	capturedRequests.push({
		url: typeof input === "string" ? input : input.url,
		headers: new Headers(init?.headers),
	});

	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n'));
			controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n'));
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			controller.close();
		},
	});

	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
};

try {
	const model = {
		id: "@cf/moonshotai/kimi-k2.5",
		name: "Kimi K2.5",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://opencode.cloudflare.dev/compat",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 256000,
		maxTokens: 64000,
		headers: {
			"cf-access-token": gatewayToken,
			"X-Requested-With": "xmlhttprequest",
		},
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			maxTokensField: "max_tokens",
		},
	};

	const context = {
		messages: [
			{ role: "user", content: "Reply with exactly ok", timestamp: Date.now() },
		],
	};

	const stream = streamSimpleOpenAICompletions(model, context, { apiKey: gatewayToken });
	for await (const event of stream) {
		if (event.type === "error") {
			throw new Error(event.error.errorMessage || "unexpected workers-ai stream error");
		}
	}

	assert.equal(capturedRequests.length, 1);
	const request = capturedRequests[0];
	assert.equal(request.url, "https://opencode.cloudflare.dev/compat/chat/completions");
	assert.equal(request.headers.get("authorization"), `Bearer ${gatewayToken}`);
	assert.equal(request.headers.get("cf-access-token"), gatewayToken);

	console.log("workers ai route regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
}
