import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { createModels, InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { exampleGatewayProfile } from "./gateway-test-fixtures.ts";

const extensionModule = fileURLToPath(new URL("./gateway-extension.ts", import.meta.url));

test("real Pi extension loader registers native providers and commands without modifying its entrypoint", async () => {
	const directory = await mkdtemp(join(tmpdir(), "gateway-loader-test-"));
	const activeEntry = fileURLToPath(new URL("./index.ts", import.meta.url));
	const before = await readFile(activeEntry, "utf8");
	try {
		const config = join(directory, "private-gateway.json"), wrapper = join(directory, "entry.ts");
		await mkdir(join(directory, "agent"));
		await writeFile(config, JSON.stringify({ profiles: [exampleGatewayProfile()] }));
		await writeFile(wrapper, `import { registerGateway } from ${JSON.stringify(extensionModule)}; export default pi => registerGateway(pi, ${JSON.stringify(config)});`);
		const loaded = await discoverAndLoadExtensions([wrapper], directory, join(directory, "agent"));
		assert.deepEqual(loaded.errors, []);
		assert.equal(loaded.runtime.pendingNativeProviderRegistrations.length, 1);
		assert.equal(loaded.runtime.pendingProviderRegistrations.length, 0);
		const extension = loaded.extensions.find((extension) => extension.commands.has("private-gateway-models"));
		assert.ok(extension);
		assert.ok(extension.commands.has("private-gateway-doctor"));
		assert.ok(extension.handlers.has("session_start"));
		assert.ok(extension.handlers.has("message_end"));
		const provider = loaded.runtime.pendingNativeProviderRegistrations[0]?.provider; assert.ok(provider);
		const models = createModels({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore() });
		models.setProvider(provider);
		await models.login(provider.id, "api_key", { prompt: async () => "example-test-token", notify() {} });
		// Exercise lazy public API resolution inside a provider constructed by jiti, not only native TS imports.
		const result = await models.completeSimple({
			id: "gpt-4o", name: "Example", provider: provider.id, api: "openai-responses",
			baseUrl: "https://inference-example.test/openai", reasoning: false, input: ["text"], contextWindow: 1000, maxTokens: 100,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		}, { messages: [] }, {
			fetch: async () => new Response('event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n', { headers: { "content-type": "text/event-stream" } }),
		});
		assert.notEqual(result.stopReason, "error", result.errorMessage ?? "native stream failed");
		const messageEnd = extension.handlers.get("message_end")?.[0]; assert.ok(messageEnd);
		const redacted = await messageEnd({ message: { role: "assistant", provider: provider.id, stopReason: "error", errorMessage: "echo example-test-token" } }, {});
		assert.deepEqual(redacted, { message: { role: "assistant", provider: provider.id, stopReason: "error", errorMessage: "echo <redacted>" } });
		assert.equal(await messageEnd({ message: { role: "assistant", provider: "unrelated", stopReason: "error", errorMessage: "unchanged" } }, {}), undefined);
		const startup = extension.handlers.get("session_start")?.[0]; assert.ok(startup);
		await startup({ reason: "startup" }, { model: { provider: "existing-cli-selection" } });
		loaded.runtime.invalidate("test finished");
		assert.equal(await readFile(activeEntry, "utf8"), before);
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("real Pi loader registers nothing for absent settings and reports invalid settings without values", async () => {
	const directory = await mkdtemp(join(tmpdir(), "gateway-loader-test-"));
	try {
		const config = join(directory, "missing.json"), wrapper = join(directory, "entry.ts");
		await writeFile(wrapper, `import { registerGateway } from ${JSON.stringify(extensionModule)}; export default pi => registerGateway(pi, ${JSON.stringify(config)});`);
		const absent = await discoverAndLoadExtensions([wrapper], directory, directory);
		assert.deepEqual(absent.errors, []); assert.equal(absent.runtime.pendingNativeProviderRegistrations.length, 0);
		assert.equal(absent.extensions[0]?.commands.size, 0);
		absent.runtime.invalidate("test finished");
		await writeFile(config, '{"profiles":["do-not-echo-this-private-value"]}');
		const invalid = await discoverAndLoadExtensions([wrapper], directory, directory);
		assert.equal(invalid.errors.length, 1);
		assert.doesNotMatch(JSON.stringify(invalid.errors), /do-not-echo-this-private-value/);
		invalid.runtime.invalidate("test finished");
	} finally { await rm(directory, { recursive: true, force: true }); }
});
