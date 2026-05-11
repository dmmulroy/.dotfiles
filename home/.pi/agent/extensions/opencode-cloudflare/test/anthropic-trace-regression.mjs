import assert from "node:assert/strict";
import { streamOpencodeCloudflare } from "../dispatch.ts";

const gatewayToken = "cf-access-token-value";
const logs = [];

const sseBody = [
	'event: message_start\n',
	'data: {"type":"message_start","message":{"id":"msg_trace","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":2,"output_tokens":0}}}\n\n',
	'event: content_block_start\n',
	'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
	'event: content_block_delta\n',
	'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
	'event: content_block_stop\n',
	'data: {"type":"content_block_stop","index":0}\n\n',
	'event: message_delta\n',
	'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":2,"output_tokens":1}}\n\n',
	'event: message_stop\n',
	'data: {"type":"message_stop"}\n\n',
].join("");

const originalFetch = globalThis.fetch;
const originalError = console.error;
const originalTrace = process.env.OPENCODE_CLOUDFLARE_TRACE_ANTHROPIC;
process.env.OPENCODE_CLOUDFLARE_TRACE_ANTHROPIC = "1";
console.error = (...args) => logs.push(args.join(" "));

globalThis.fetch = async (input) => {
	const url = typeof input === "string" ? input : input.url;
	if (url.endsWith("/.well-known/opencode")) {
		return new Response("gateway config unavailable in test", { status: 503 });
	}
	return new Response(sseBody, {
		status: 200,
		statusText: "OK",
		headers: { "content-type": "text/event-stream", "cf-ray": "trace-test" },
	});
};

try {
	const model = {
		id: "claude-opus-4-6",
		name: "Claude Opus 4.6",
		api: "opencode-cloudflare",
		provider: "opencode.cloudflare.dev",
		baseUrl: "https://opencode.cloudflare.dev",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 128000,
	};

	const context = {
		systemPrompt: "short system prompt",
		messages: [{ role: "user", content: "Reply with exactly ok", timestamp: Date.now() }],
	};

	const stream = streamOpencodeCloudflare(model, context, { apiKey: gatewayToken, maxTokens: 123 });
	for await (const event of stream) {
		if (event.type === "error") {
			throw new Error(event.error.errorMessage || "unexpected anthropic stream error");
		}
	}

	await new Promise((resolve) => setTimeout(resolve, 25));
	const traceLine = logs.find((line) => line.includes("Anthropic SSE trace"));
	assert.ok(traceLine, "expected Anthropic SSE trace log");
	const payload = JSON.parse(traceLine.slice(traceLine.indexOf("{") ));
	assert.equal(payload.status, 200);
	assert.equal(payload.saw_message_stop, true);
	assert.deepEqual(payload.events, [
		"message_start",
		"content_block_start",
		"content_block_delta",
		"content_block_stop",
		"message_delta",
		"message_stop",
	]);
	assert.equal(payload.payload.model, "claude-opus-4-6");
	assert.equal(payload.payload.max_tokens, 123);
	assert.equal(payload.payload.message_count, 1);
	assert.equal(payload.payload.system_length, "short system prompt".length);
	assert.match(payload.tail, /message_stop/);

	console.log("anthropic trace regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
	console.error = originalError;
	if (originalTrace === undefined) delete process.env.OPENCODE_CLOUDFLARE_TRACE_ANTHROPIC;
	else process.env.OPENCODE_CLOUDFLARE_TRACE_ANTHROPIC = originalTrace;
}
