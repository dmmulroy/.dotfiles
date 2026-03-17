import assert from "node:assert/strict";
import { streamSimpleAnthropic } from "@mariozechner/pi-ai";

const gatewayToken = "cf-access-token-value";
const capturedRequests = [];

const sseBody = [
	'event: message_start\n',
	'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
	'event: content_block_start\n',
	'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
	'event: content_block_delta\n',
	'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
	'event: content_block_stop\n',
	'data: {"type":"content_block_stop","index":0}\n\n',
	'event: message_delta\n',
	'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}\n\n',
	'event: message_stop\n',
	'data: {"type":"message_stop"}\n\n',
].join("");

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	capturedRequests.push({
		url: typeof input === "string" ? input : input.url,
		headers: new Headers(init?.headers),
	});

	return new Response(sseBody, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
};

try {
	const model = {
		id: "claude-opus-4-6",
		name: "Claude Opus 4.6",
		api: "anthropic-messages",
		provider: "github-copilot",
		baseUrl: "https://opencode.cloudflare.dev/anthropic",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 128000,
		headers: {
			"cf-access-token": gatewayToken,
			"X-Requested-With": "xmlhttprequest",
			"anthropic-beta": "context-1m-2025-08-07,fine-grained-tool-streaming-2025-05-14",
		},
	};

	const context = {
		messages: [
			{ role: "user", content: "Reply with exactly ok", timestamp: Date.now() },
		],
	};

	const stream = streamSimpleAnthropic(model, context, { apiKey: gatewayToken });
	for await (const event of stream) {
		if (event.type === "error") {
			throw new Error(event.error.errorMessage || "unexpected anthropic stream error");
		}
	}

	assert.equal(capturedRequests.length, 1);
	const request = capturedRequests[0];
	assert.equal(request.url, "https://opencode.cloudflare.dev/anthropic/v1/messages");
	assert.equal(request.headers.get("authorization"), `Bearer ${gatewayToken}`);
	assert.equal(request.headers.get("x-api-key"), null);
	assert.equal(request.headers.get("cf-access-token"), gatewayToken);
	assert.equal(request.headers.get("x-initiator"), "user");
	assert.equal(request.headers.get("openai-intent"), "conversation-edits");

	console.log("anthropic auth regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
}
