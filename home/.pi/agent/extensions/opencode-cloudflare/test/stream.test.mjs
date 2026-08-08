import assert from "node:assert/strict";
import { test } from "node:test";
import { GatewayToken } from "../auth.ts";
import { resolveGatewayConfig } from "../config.ts";
import { success } from "../result.ts";
import { createGatewayStream } from "../stream.ts";

const gatewayToken = "cf-access-token-value";

function visibleModel(id, overrides = {}) {
	return {
		id,
		name: id,
		api: "opencode-cloudflare",
		provider: "opencode.cloudflare.dev",
		baseUrl: "https://gateway.opencode.cloudflare.dev",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 128000,
		...overrides,
	};
}

function createHarness(route) {
	const config = resolveGatewayConfig(undefined);
	return createGatewayStream({
		auth: { resolveToken: () => success(GatewayToken.parse(gatewayToken)) },
		catalog: { resolveRoute: async () => success({ route, config }) },
	});
}

async function consume(stream) {
	let done;
	let error;
	for await (const event of stream) {
		if (event.type === "done") done = event.message;
		if (event.type === "error") error = event.error;
	}
	return { done, error };
}

test("OpenAI Responses delegates payload construction and adds route options", async () => {
	const captured = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		captured.push({
			url: typeof input === "string" ? input : input.url,
			headers: new Headers(init?.headers),
			body: JSON.parse(String(init?.body ?? "{}")),
		});
		return new Response(
			'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
			{ status: 200, headers: { "content-type": "text/event-stream" } },
		);
	};
	try {
		const stream = createHarness({
			backend: "openai",
			api: "openai-responses",
			baseUrl: "https://gateway.opencode.cloudflare.dev/openai",
			headers: {},
			responseVerbosity: "medium",
			reasoningContext: "all_turns",
		});
		const observedPayloads = [];
		const result = await consume(stream(visibleModel("fixture-openai-model"), {
			messages: [{ role: "user", content: "Reply", timestamp: 1 }],
		}, {
			reasoning: "high",
			onPayload: (payload) => {
				observedPayloads.push(payload);
			},
		}));
		assert.equal(result.error, undefined);
		assert.equal(captured.length, 1);
		assert.equal(captured[0].url, "https://gateway.opencode.cloudflare.dev/openai/responses");
		assert.equal(captured[0].headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(captured[0].headers.get("cf-access-token"), gatewayToken);
		assert.equal(captured[0].body.text.verbosity, "medium");
		assert.equal(captured[0].body.reasoning.context, "all_turns");
		assert.equal(observedPayloads.length, 1);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Anthropic uses bearer auth and native adaptive-thinking semantics", async () => {
	const captured = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		captured.push({
			url: typeof input === "string" ? input : input.url,
			headers: new Headers(init?.headers),
			body: JSON.parse(String(init?.body ?? "{}")),
		});
		const body = [
			'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"fixture-adaptive-model","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
			'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
			'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
			'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
			'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}\n\n',
			'event: message_stop\ndata: {"type":"message_stop"}\n\n',
		].join("");
		return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
	};
	try {
		const stream = createHarness({
			backend: "anthropic",
			api: "anthropic-messages",
			baseUrl: "https://gateway.opencode.cloudflare.dev/anthropic",
			headers: {},
			requestModelId: "fixture-adaptive-model",
			compat: { forceAdaptiveThinking: true },
		});
		const result = await consume(stream(visibleModel("fixture-adaptive-model", {
			thinkingLevelMap: { xhigh: "xhigh" },
		}), {
			messages: [{ role: "user", content: "Reply", timestamp: 1 }],
		}, { reasoning: "xhigh" }));
		assert.equal(result.error, undefined);
		assert.equal(result.done?.api, "anthropic-messages");
		assert.equal(result.done?.provider, "opencode.cloudflare.dev");
		assert.equal(captured[0].url, "https://gateway.opencode.cloudflare.dev/anthropic/v1/messages");
		assert.equal(captured[0].headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(captured[0].headers.get("x-api-key"), null);
		assert.deepEqual(captured[0].body.thinking, { type: "adaptive", display: "summarized" });
		assert.deepEqual(captured[0].body.output_config, { effort: "xhigh" });
		assert.equal(captured[0].body.max_tokens, 128000);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Google delegates conversations while preserving header deletion markers", async () => {
	const captured = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		captured.push({
			url: typeof input === "string" ? input : input.url,
			headers: new Headers(init?.headers),
			body: JSON.parse(String(init?.body ?? "{}")),
		});
		return new Response(
			'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n',
			{ status: 200, headers: { "content-type": "text/event-stream" } },
		);
	};
	try {
		const stream = createHarness({
			backend: "google",
			api: "google-generative-ai",
			baseUrl: "https://gateway.opencode.cloudflare.dev/google-ai-studio/v1beta",
			headers: {},
		});
		const context = {
			systemPrompt: "Be concise",
			messages: [
				{ role: "user", content: "First", timestamp: 1 },
				{
					role: "assistant",
					content: [{ type: "text", text: "Earlier" }],
					api: "google-generative-ai",
					provider: "opencode.cloudflare.dev",
					model: "gemini-2.5-flash",
					usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "stop",
					timestamp: 2,
				},
				{ role: "user", content: "Second", timestamp: 3 },
			],
			tools: [{
				name: "lookup",
				description: "Look something up",
				parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
			}],
		};
		const result = await consume(stream(visibleModel("gemini-2.5-flash"), context, {
			headers: { "cf-access-token": null },
		}));
		assert.equal(result.error, undefined);
		assert.match(captured[0].url, /^https:\/\/gateway\.opencode\.cloudflare\.dev\/google-ai-studio\/v1beta\/models\/gemini-2\.5-flash:streamGenerateContent\?alt=sse/);
		assert.equal(captured[0].headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(captured[0].headers.get("cf-access-token"), null);
		assert.equal(captured[0].headers.get("x-goog-api-key"), "gateway-authenticated");
		assert.equal(captured[0].body.contents.length, 3);
		assert.equal(captured[0].body.systemInstruction.parts[0].text, "Be concise");
		assert.equal(captured[0].body.tools[0].functionDeclarations[0].name, "lookup");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("xAI delegates to the OpenAI-compatible streamer through the Grok route", async () => {
	const captured = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		captured.push({ url: typeof input === "string" ? input : input.url, headers: new Headers(init?.headers) });
		return new Response([
			'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
			'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
			"data: [DONE]\n\n",
		].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
	};
	try {
		const stream = createHarness({
			backend: "xai",
			api: "openai-completions",
			baseUrl: "https://gateway.opencode.cloudflare.dev/grok",
			headers: {},
		});
		const result = await consume(stream(visibleModel("grok-4.5"), {
			messages: [{ role: "user", content: "Reply", timestamp: 1 }],
		}));
		assert.equal(result.error, undefined);
		assert.equal(captured[0].url, "https://gateway.opencode.cloudflare.dev/grok/chat/completions");
		assert.equal(captured[0].headers.get("authorization"), `Bearer ${gatewayToken}`);
		assert.equal(captured[0].headers.get("cf-access-token"), gatewayToken);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Workers AI delegates to the OpenAI-compatible streamer", async () => {
	const captured = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		captured.push({ url: typeof input === "string" ? input : input.url, headers: new Headers(init?.headers) });
		return new Response([
			'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
			'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
			"data: [DONE]\n\n",
		].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
	};
	try {
		const stream = createHarness({
			backend: "workers-ai",
			api: "openai-completions",
			baseUrl: "https://gateway.opencode.cloudflare.dev/compat",
			headers: {},
			requestModelId: "workers-ai/@cf/example/model",
			compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" },
		});
		const result = await consume(stream(visibleModel("@cf/example/model"), {
			messages: [{ role: "user", content: "Reply", timestamp: 1 }],
		}));
		assert.equal(result.error, undefined);
		assert.equal(captured[0].url, "https://gateway.opencode.cloudflare.dev/compat/chat/completions");
		assert.equal(captured[0].headers.get("authorization"), `Bearer ${gatewayToken}`);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("structured gateway failures become actionable errors", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify({
		error: "Unauthorized",
		message: `Invalid token ${gatewayToken}`,
		status: 401,
	}), { status: 401, headers: { "content-type": "application/json" } });
	try {
		const stream = createHarness({
			backend: "google",
			api: "google-generative-ai",
			baseUrl: "https://gateway.opencode.cloudflare.dev/google-ai-studio/v1beta",
			headers: {},
		});
		const result = await consume(stream(visibleModel("gemini-2.5-flash"), {
			messages: [{ role: "user", content: "Reply", timestamp: 1 }],
		}));
		assert.match(result.error?.errorMessage ?? "", /rejected the Access token/);
		assert.match(result.error?.errorMessage ?? "", /Invalid token <redacted>/);
		assert.doesNotMatch(result.error?.errorMessage ?? "", new RegExp(gatewayToken));
		assert.match(result.error?.errorMessage ?? "", /\/login opencode\.cloudflare\.dev/);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
