import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cf-openai-responses-options-"));
const overlayPath = path.join(tempDir, "overlay.jsonc");
fs.writeFileSync(overlayPath, JSON.stringify({
	provider: {
		openai: {
			models: {
				"custom-openai-responses-model": {
					id: "custom-openai-responses-model",
					name: "Custom OpenAI Responses Model",
					reasoning: true,
					thinkingLevelMap: { off: "none", minimal: null, xhigh: "xhigh" },
					options: {
						text: { verbosity: "medium" },
						reasoning: { context: "all_turns" },
					},
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
const observedPayloads = [];
const sseBody = [
	'data: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
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
		id: "custom-openai-responses-model",
		name: "Custom OpenAI Responses Model",
		api: "opencode-cloudflare",
		provider: "opencode.cloudflare.dev",
		baseUrl: "https://opencode.cloudflare.dev",
		reasoning: true,
		thinkingLevelMap: { off: "none", minimal: null, xhigh: "xhigh" },
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 128000,
	};
	const context = {
		messages: [{ role: "user", content: "Reply with exactly ok", timestamp: Date.now() }],
	};

	const stream = streamOpencodeCloudflare(model, context, {
		apiKey: gatewayToken,
		reasoning: "high",
		onPayload: (payload) => {
			observedPayloads.push(payload);
		},
	});
	for await (const event of stream) {
		if (event.type === "error") {
			throw new Error(event.error.errorMessage || "unexpected OpenAI Responses stream error");
		}
	}

	assert.equal(observedPayloads.length, 1);
	assert.equal(observedPayloads[0].text.verbosity, "medium");
	assert.equal(observedPayloads[0].reasoning.context, "all_turns");
	assert.equal(capturedRequests.length, 1);
	const request = capturedRequests[0];
	assert.equal(request.url, "https://opencode.cloudflare.dev/openai/responses");
	assert.equal(request.headers.get("authorization"), `Bearer ${gatewayToken}`);
	assert.equal(request.headers.get("cf-access-token"), gatewayToken);
	assert.equal(request.body.text.verbosity, "medium");
	assert.deepEqual(request.body.reasoning, { effort: "high", summary: "auto", context: "all_turns" });
	assert.deepEqual(request.body.include, ["reasoning.encrypted_content"]);

	console.log("openai responses options regression checks passed");
} finally {
	globalThis.fetch = originalFetch;
	delete process.env.OPENCODE_CLOUDFLARE_LOCAL_CONFIG;
	fs.rmSync(tempDir, { recursive: true, force: true });
}
