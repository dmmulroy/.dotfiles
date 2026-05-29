import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cf-anthropic-auth-"));
const overlayPath = path.join(tempDir, "overlay.jsonc");
fs.writeFileSync(overlayPath, JSON.stringify({
	provider: {
		anthropic: {
			models: {
				"anthropic/claude-opus-4-8": {
					id: "claude-opus-4-8",
					name: "Claude Opus 4.8",
					reasoning: true,
					thinkingLevelMap: { xhigh: "xhigh" },
					compat: { forceAdaptiveThinking: true },
					limit: { context: 1000000, output: 128000 },
				},
			},
		},
	},
}));
process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG = overlayPath;
const { streamOpencodeCloudflare } = await import("../dispatch.ts");

const gatewayToken = "cf-access-token-value";
const capturedRequests = [];

const sseBody = [
	'event: message_start\n',
	'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-opus-4-8","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
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
	const url = typeof input === "string" ? input : input.url;
	if (url.endsWith("/.well-known/opencode")) {
		return new Response("gateway config unavailable in test", { status: 503 });
	}

	capturedRequests.push({
		url,
		headers: new Headers(init?.headers ?? (typeof input === "string" ? undefined : input.headers)),
		body: JSON.parse(String(init?.body || "{}")),
	});

	return new Response(sseBody, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
};

try {
	const model = {
		id: "claude-opus-4-8",
		name: "Claude Opus 4.8",
		api: "opencode-cloudflare",
		provider: "opencode.cloudflare.dev",
		baseUrl: "https://opencode.cloudflare.dev",
		reasoning: true,
		thinkingLevelMap: { xhigh: "xhigh" },
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 128000,
	};

	const context = {
		messages: [
			{ role: "user", content: "Reply with exactly ok", timestamp: Date.now() },
		],
	};

	let done;
	const stream = streamOpencodeCloudflare(model, context, { apiKey: gatewayToken, reasoning: "xhigh" });
	for await (const event of stream) {
		if (event.type === "error") {
			throw new Error(event.error.errorMessage || "unexpected anthropic stream error");
		}
		if (event.type === "done") {
			done = event.message;
		}
	}

	assert.equal(capturedRequests.length, 1);
	const request = capturedRequests[0];
	assert.equal(request.url, "https://opencode.cloudflare.dev/anthropic/v1/messages");
	assert.equal(request.headers.get("authorization"), `Bearer ${gatewayToken}`);
	assert.equal(request.headers.get("x-api-key"), null);
	assert.equal(request.headers.get("cf-access-token"), gatewayToken);
	assert.equal(request.headers.get("x-initiator"), null);
	assert.equal(request.headers.get("openai-intent"), null);
	assert.equal(request.headers.get("cf-aig-authorization"), null);
	assert.equal(request.body.model, "claude-opus-4-8");
	assert.deepEqual(request.body.thinking, { type: "adaptive", display: "summarized" });
	assert.deepEqual(request.body.output_config, { effort: "xhigh" });
	assert.equal(done?.api, "anthropic-messages");
	assert.equal(done?.provider, "opencode.cloudflare.dev");
	assert.equal(done?.model, "claude-opus-4-8");

	console.log("anthropic auth regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
	delete process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG;
	fs.rmSync(tempDir, { recursive: true, force: true });
}
