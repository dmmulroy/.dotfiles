import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { InMemoryCredentialStore, type AssistantMessage } from "@earendil-works/pi-ai";
import {
	discoverAndLoadExtensions,
	ExtensionRunner,
	ModelRegistry,
	ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

import {
	createCloudflareAccessTokenProvider,
	type CloudflareAccessToken,
	type CloudflareAccessTokenProvider,
	type CloudflaredAccessError,
	type CloudflaredExecutor,
} from "../cloudflared-access-token.ts";
import {
	createMarkdownPasteClient,
	type CreateMarkdownPasteInput,
	type MarkdownPasteClient,
} from "../markdown-paste-client.ts";
import { Redacted } from "../redacted.ts";
import { type Result, success } from "../result.ts";

const extensionPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"cfpaste-test-extension.ts",
);

function assistantMessage(markdown: string): AssistantMessage {
	return {
		role: "assistant",
		content: [
			{ type: "thinking", thinking: "private reasoning" },
			{ type: "text", text: markdown },
		],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

class RecordingMarkdownPasteClient implements MarkdownPasteClient {
	readonly inputs: CreateMarkdownPasteInput[] = [];

	async createMarkdownPaste(
		input: CreateMarkdownPasteInput,
	): Promise<Result<string, never>> {
		this.inputs.push(input);
		return success("https://paste.cfdata.org/example/markdown");
	}
}

async function createHarness(cwd: string, client: MarkdownPasteClient) {
	globalThis.cfpasteTestClient = client;
	const sessionManager = SessionManager.inMemory(cwd);
	const loaded = await discoverAndLoadExtensions([extensionPath], cwd, join(cwd, ".agent"));
	assert.deepEqual(loaded.errors, []);
	const modelRuntime = await ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	const runner = new ExtensionRunner(
		loaded.extensions,
		loaded.runtime,
		cwd,
		sessionManager,
		new ModelRegistry(modelRuntime),
	);
	const notifications: Array<{
		message: string;
		type: "info" | "warning" | "error" | undefined;
	}> = [];
	runner.setUIContext({
		...runner.getUIContext(),
		notify: (message, type) => notifications.push({ message, type }),
	});
	return { notifications, runner, sessionManager };
}

test("/cf-paste reads a Markdown path and returns the rendered URL", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-cfpaste-"));
	try {
		const markdown = "# Design\n\nPreserve **Markdown**.\n";
		await writeFile(join(cwd, "design.md"), markdown, "utf8");
		const client = new RecordingMarkdownPasteClient();
		const { notifications, runner } = await createHarness(cwd, client);
		const command = runner.getCommand("cf-paste");
		assert.ok(command);

		await command.handler("design.md", runner.createCommandContext());

		assert.deepEqual(client.inputs, [{ title: "design.md", markdown }]);
		assert.deepEqual(notifications, [{
			message: "Created Markdown paste: https://paste.cfdata.org/example/markdown",
			type: "info",
		}]);
	} finally {
		globalThis.cfpasteTestClient = undefined;
		await rm(cwd, { recursive: true, force: true });
	}
});

test("/cf-paste-last pastes the latest agent message on the active branch", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-cfpaste-"));
	try {
		const client = new RecordingMarkdownPasteClient();
		const { runner, sessionManager } = await createHarness(cwd, client);
		const activeId = sessionManager.appendMessage(assistantMessage("# Active"));
		sessionManager.appendMessage(assistantMessage("# Abandoned"));
		sessionManager.branch(activeId);
		const command = runner.getCommand("cf-paste-last");
		assert.ok(command);

		await command.handler("", runner.createCommandContext());

		assert.deepEqual(client.inputs, [{
			title: "Pi agent response",
			markdown: "# Active",
		}]);
	} finally {
		globalThis.cfpasteTestClient = undefined;
		await rm(cwd, { recursive: true, force: true });
	}
});

test("/cf-paste rejects non-Markdown files before reading or uploading", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-cfpaste-"));
	try {
		const client = new RecordingMarkdownPasteClient();
		const { notifications, runner } = await createHarness(cwd, client);
		const command = runner.getCommand("cf-paste");
		assert.ok(command);

		await command.handler("notes.txt", runner.createCommandContext());

		assert.deepEqual(client.inputs, []);
		assert.deepEqual(notifications, [{
			message: "Cloudflare Paste currently supports only .md and .markdown files",
			type: "warning",
		}]);
	} finally {
		globalThis.cfpasteTestClient = undefined;
		await rm(cwd, { recursive: true, force: true });
	}
});

test("Cloudflare Access provider invokes cloudflared without a shell and redacts its token", async () => {
	const calls: Array<{
		readonly args: readonly string[];
		readonly timeout: number;
	}> = [];
	const executor: CloudflaredExecutor = {
		async execute(args, options) {
			calls.push({ args, timeout: options.timeout });
			return { stdout: "secret-token\n", stderr: "", code: 0 };
		},
	};
	const provider = createCloudflareAccessTokenProvider(
		executor,
		"https://paste.cfdata.org",
	);

	const result = await provider.resolveToken();

	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(String(result.value), "<redacted>");
	assert.deepEqual(calls, [{
		args: ["access", "token", "-app=https://paste.cfdata.org"],
		timeout: 300_000,
	}]);
});

test("Cloudflare Access login requests a JWT-only stdout response", async () => {
	const calls: Array<readonly string[]> = [];
	const executor: CloudflaredExecutor = {
		async execute(args) {
			calls.push([...args]);
			return args.includes("--no-verbose")
				? { stdout: "refreshed-token\n", stderr: "", code: 0 }
				: { stdout: "", stderr: "Login completed", code: 0 };
		},
	};
	const provider = createCloudflareAccessTokenProvider(
		executor,
		"https://paste.cfdata.org",
	);

	const result = await provider.refreshToken();

	assert.equal(result.ok, true);
	assert.deepEqual(calls, [[
		"access",
		"login",
		"--no-verbose",
		"-app=https://paste.cfdata.org",
	]]);
});

test("Cloudflare Access provider logs in when no cached token is available", async () => {
	const calls: Array<readonly string[]> = [];
	const executor: CloudflaredExecutor = {
		async execute(args) {
			calls.push([...args]);
			return args[1] === "token"
				? { stdout: "", stderr: "Unable to find token", code: 1 }
				: { stdout: "new-token\n", stderr: "", code: 0 };
		},
	};
	const provider = createCloudflareAccessTokenProvider(
		executor,
		"https://paste.cfdata.org",
	);

	const result = await provider.resolveToken();

	assert.equal(result.ok, true);
	assert.deepEqual(calls, [
		["access", "token", "-app=https://paste.cfdata.org"],
		["access", "login", "--no-verbose", "-app=https://paste.cfdata.org"],
	]);
});

test("HTTP client posts form-encoded Markdown and appends /markdown to the result URL", async () => {
	let requestBody = "";
	let accessHeader = "";
	const server = createServer((request, response) => {
		accessHeader = String(request.headers["cf-access-token"] ?? "");
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			requestBody += chunk;
		});
		request.on("end", () => {
			response.statusCode = 303;
			response.setHeader("location", "/pasteId123");
			response.end();
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		assert.ok(address && typeof address === "object");
		const origin = new URL(`http://127.0.0.1:${address.port}`);
		const tokenProvider: CloudflareAccessTokenProvider = {
			resolveToken: async () => success(Redacted.make("test-access-token")),
			refreshToken: async () => success(Redacted.make("unused")),
		};
		const client = createMarkdownPasteClient(origin, tokenProvider);

		const result = await client.createMarkdownPaste({
			title: "design.md",
			markdown: "# Design",
		});

		assert.deepEqual(result, success(`${origin.origin}/pasteId123/markdown`));
		assert.equal(accessHeader, "test-access-token");
		assert.deepEqual(
			Object.fromEntries(new URLSearchParams(requestBody)),
			{
				expiry: "8035200",
				language: "markdown",
				content: "# Design",
				title: "design.md",
			},
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => error ? reject(error) : resolve()),
		);
	}
});

test("HTTP client refreshes Cloudflare Access once after an unauthorized redirect", async () => {
	let requestCount = 0;
	const server = createServer((_request, response) => {
		requestCount += 1;
		response.statusCode = requestCount === 1 ? 302 : 303;
		response.setHeader(
			"location",
			requestCount === 1 ? "/cdn-cgi/access/login" : "/refreshedPaste",
		);
		response.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		assert.ok(address && typeof address === "object");
		let refreshCount = 0;
		const tokenProvider: CloudflareAccessTokenProvider = {
			resolveToken: async () => success(Redacted.make("cached")),
			refreshToken: async (): Promise<Result<CloudflareAccessToken, CloudflaredAccessError>> => {
				refreshCount += 1;
				return success(Redacted.make("refreshed"));
			},
		};
		const origin = new URL(`http://127.0.0.1:${address.port}`);
		const client = createMarkdownPasteClient(origin, tokenProvider);

		const result = await client.createMarkdownPaste({ markdown: "# Retry" });

		assert.deepEqual(result, success(`${origin.origin}/refreshedPaste/markdown`));
		assert.equal(requestCount, 2);
		assert.equal(refreshCount, 1);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => error ? reject(error) : resolve()),
		);
	}
});
