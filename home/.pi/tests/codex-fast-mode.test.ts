import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCodexFastMode, isFastSupported } from "../agent/extensions/codex-fast-mode.ts";

function createFakePi(flagValue?: boolean) {
	const commands = new Map<string, any>();
	const handlers = new Map<string, any>();
	const providers = new Map<string, any>();
	const flags = new Map<string, any>();

	return {
		pi: {
			registerCommand(name: string, options: any) {
				commands.set(name, options);
			},
			registerFlag(name: string, options: any) {
				flags.set(name, options);
			},
			getFlag(name: string) {
				return name === "codex-fast" ? flagValue : undefined;
			},
			registerProvider(name: string, config: any) {
				providers.set(name, config);
			},
			on(event: string, handler: any) {
				handlers.set(event, handler);
			},
		},
		commands,
		handlers,
		providers,
		flags,
	};
}

function createFakeContext(model: any, confirmResult = true) {
	const notifications: Array<{ message: string; level: string }> = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	let confirmCalls = 0;

	return {
		ctx: {
			model,
			hasUI: true,
			ui: {
				async confirm(_title: string, _message: string) {
					confirmCalls += 1;
					return confirmResult;
				},
				notify(message: string, level: string) {
					notifications.push({ message, level });
				},
				setStatus(key: string, value: string | undefined) {
					statuses.push({ key, value });
				},
			},
		},
		notifications,
		statuses,
		get confirmCalls() {
			return confirmCalls;
		},
	};
}

async function withTempState<T>(initial: unknown | undefined, fn: (statePath: string) => Promise<T>) {
	const dir = await mkdtemp(join(tmpdir(), "codex-fast-mode-"));
	try {
		const statePath = join(dir, "state.json");
		if (initial !== undefined) await writeFile(statePath, JSON.stringify(initial), "utf8");
		return await fn(statePath);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test("isFastSupported only matches OpenAI Codex GPT-5.5", () => {
	assert.equal(isFastSupported({ provider: "openai-codex", id: "gpt-5.5" }), true);
	assert.equal(isFastSupported({ provider: "openai-codex", id: "gpt-5.4" }), false);
	assert.equal(isFastSupported({ provider: "openai", id: "gpt-5.5" }), false);
});

test("provider wrapper injects priority service tier when enabled for supported Codex model", async () => {
	await withTempState({ enabled: true, acknowledgedPriorityCost: true }, async (statePath) => {
		let capturedOptions: any;
		const fakeStream = (_model: any, _context: any, options: any) => {
			capturedOptions = options;
			return {} as any;
		};
		const fake = createFakePi();

		await createCodexFastMode({ statePath, stream: fakeStream })(fake.pi as any);

		const provider = fake.providers.get("openai-codex");
		provider.streamSimple(
			{ provider: "openai-codex", id: "gpt-5.5" },
			{ messages: [], systemPrompt: "" },
			{ reasoning: "high", apiKey: "test-key" },
		);

		assert.equal(capturedOptions.serviceTier, "priority");
		assert.equal(capturedOptions.reasoningEffort, "high");
		assert.equal(capturedOptions.apiKey, "test-key");
	});
});

test("provider wrapper leaves service tier unset for unsupported models", async () => {
	await withTempState({ enabled: true, acknowledgedPriorityCost: true }, async (statePath) => {
		let capturedOptions: any;
		const fakeStream = (_model: any, _context: any, options: any) => {
			capturedOptions = options;
			return {} as any;
		};
		const fake = createFakePi();

		await createCodexFastMode({ statePath, stream: fakeStream })(fake.pi as any);
		fake.providers.get("openai-codex").streamSimple(
			{ provider: "openai-codex", id: "gpt-5.4" },
			{ messages: [], systemPrompt: "" },
			{},
		);

		assert.equal(capturedOptions.serviceTier, undefined);
	});
});

test("/fast on asks for first-time acknowledgement, persists enabled default, and sets footer", async () => {
	await withTempState(undefined, async (statePath) => {
		const fake = createFakePi();
		await createCodexFastMode({ statePath, stream: (() => ({})) as any })(fake.pi as any);

		const ctx = createFakeContext({ provider: "openai-codex", id: "gpt-5.5" });
		await fake.commands.get("fast").handler("on", ctx.ctx);

		const saved = JSON.parse(await readFile(statePath, "utf8"));
		assert.equal(ctx.confirmCalls, 1);
		assert.equal(saved.enabled, true);
		assert.equal(saved.acknowledgedPriorityCost, true);
		assert.deepEqual(ctx.statuses.at(-1), { key: "codex-fast", value: "⚡ fast" });
		assert.match(ctx.notifications.at(-1)?.message ?? "", /2\.5x credits/);
	});
});
