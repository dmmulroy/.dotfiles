import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:https";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { IncomingHttpHeaders } from "node:http";

const cli = fileURLToPath(new URL("./gateway-cli.ts", import.meta.url));
const source = (name: string) => fileURLToPath(new URL(name, import.meta.url));

function runProcess(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
		let stdout = "", stderr = "";
		child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
		child.once("error", reject);
		child.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

test("real HTTPS wire: native Anthropic/Google/OpenAI SDKs, CLI diff, partial coverage, and read-only state", async () => {
	const directory = await mkdtemp(join(tmpdir(), "gateway-wire-test-"));
	const requests: { url: string; headers: IncomingHttpHeaders; body: string }[] = [];
	const keyPath = join(directory, "key.pem"), certPath = join(directory, "cert.pem");
	const certificate = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1", "-days", "1"], { timeout: 10_000, stdio: "ignore" });
	assert.equal(certificate.status, 0, "openssl is required for local TLS contract tests");
	let rejectGoogle = false;
	const server = createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
		let body = "";
		request.on("data", (chunk: Buffer) => { body += chunk.toString(); });
		request.on("end", () => {
			const url = request.url ?? "";
			requests.push({ url, headers: request.headers, body });
			let payload: unknown;
			if (url === "/.well-known/opencode") payload = { enabled_providers: ["anthropic", "openai", "google"], provider: {
				anthropic: { models: { "claude-haiku-4-5": {} }, whitelist: ["claude-haiku-4-5"] },
				openai: { models: { "gpt-4o": {} }, whitelist: ["gpt-4o"] },
				google: { models: { "gemini-2.5-flash": {} }, whitelist: ["gemini-2.5-flash"] },
			} };
			else if (url.endsWith("/models")) {
				if (rejectGoogle && url.includes("google")) { response.writeHead(403); response.end('token-must-not-be-printed'); return; }
				payload = url.includes("google") ? { models: [{ name: "models/gemini-2.5-flash" }] }
					: { data: [{ id: url.includes("anthropic") ? "claude-haiku-4-5" : "gpt-4o" }, ...(request.headers["cf-access-token"] === "right-fixture-token" && url.includes("openai") ? [{ id: "example-extra-model" }] : [])] };
			}
			if (payload) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(payload)); return; }
			response.writeHead(200, { "content-type": "text/event-stream" });
			if (url.includes("/anthropic/")) response.end([
				'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
				'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
				'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
				'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
				'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}\n\n',
				'event: message_stop\ndata: {"type":"message_stop"}\n\n',
			].join(""));
			else if (url.includes("google")) response.end('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n');
			else response.end('event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n');
		});
	});
	server.listen(0, "127.0.0.1"); await once(server, "listening");
	const address = server.address(); assert.ok(address && typeof address !== "string");
	const origin = `https://127.0.0.1:${address.port}`;
	const config = join(directory, "settings.json");
	const settingsText = JSON.stringify({ profiles: ["left", "right"].map((id) => ({ id, name: id, authOrigin: origin, inferenceOrigin: origin, tokenEnvironmentVariable: `${id.toUpperCase()}_TOKEN` })) });
	await writeFile(config, settingsText);
	const env = { ...process.env, PI_CODING_AGENT_DIR: directory, NODE_EXTRA_CA_CERTS: certPath, LEFT_TOKEN: "left-fixture-token", RIGHT_TOKEN: "right-fixture-token" };
	try {
		const probe = join(directory, "probe.mjs");
		await writeFile(probe, `
import { createModels, InMemoryCredentialStore, InMemoryModelsStore } from ${JSON.stringify(import.meta.resolve("@earendil-works/pi-ai"))};
import { readGatewaySettings } from ${JSON.stringify(source("./gateway-settings.ts"))};
import { FetchGatewayHttp } from ${JSON.stringify(source("./gateway-http.ts"))};
import { HttpGatewayDiscovery } from ${JSON.stringify(source("./gateway-discovery.ts"))};
import { HttpGatewayInventory } from ${JSON.stringify(source("./gateway-inventory.ts"))};
import { NativeGatewayCatalog } from ${JSON.stringify(source("./gateway-catalog.ts"))};
import { buildGatewayProvider } from ${JSON.stringify(source("./gateway-provider.ts"))};
const settings=await readGatewaySettings(${JSON.stringify(config)});
const http=new FetchGatewayHttp(),handle=buildGatewayProvider(settings.value.settings.profiles[0],{discovery:new HttpGatewayDiscovery(http),catalog:new NativeGatewayCatalog(new HttpGatewayInventory(http)),now:()=>Date.now()});
const models=createModels({credentials:new InMemoryCredentialStore(),modelsStore:new InMemoryModelsStore(),authContext:{env:async n=>process.env[n],fileExists:async()=>false}});
models.setProvider(handle.provider);const refresh=await models.refresh();if(refresh.errors.size)throw Error('refresh failed');
const results=[];for(const model of models.getModels('left')) {const result=await models.completeSimple(model,{messages:[{role:'user',content:'Reply',timestamp:1}]});results.push({api:model.api,stopReason:result.stopReason,error:result.errorMessage});}
console.log(JSON.stringify(results));
`);
		const probeResult = await runProcess(["--import", "tsx", probe], env);
		assert.equal(probeResult.code, 0, probeResult.stderr);
		const results: { api: string; stopReason: string; error?: string }[] = JSON.parse(probeResult.stdout);
		assert.equal(results.length, 3);
		for (const result of results) assert.notEqual(result.stopReason, "error", result.error ?? "native request failed");
		const anthropic = requests.find((entry) => entry.url.includes("/anthropic/v1/messages")); assert.ok(anthropic);
		assert.equal(anthropic.headers["x-api-key"], undefined); assert.equal(anthropic.headers["cf-access-token"], env.LEFT_TOKEN);
		const google = requests.find((entry) => entry.url.includes("streamGenerateContent")); assert.ok(google);
		assert.equal(google.headers["x-goog-api-key"], "gateway-authenticated");
		assert.equal(google.headers.authorization, `Bearer ${env.LEFT_TOKEN}`); assert.doesNotMatch(google.url, /left-fixture-token/);
		const diff = await runProcess(["--import", "tsx", cli, "diff", "left", "right", "--config", config, "--json"], env);
		assert.equal(diff.code, 0, diff.stderr);
		const report = JSON.parse(diff.stdout);
		assert.equal(report.complete, true); assert.deepEqual(report.delta.onlyTo.map((model: { id: string }) => model.id), ["example-extra-model"]);
		assert.doesNotMatch(diff.stdout, /fixture-token/);
		rejectGoogle = true;
		const partial = await runProcess(["--import", "tsx", cli, "diff", "left", "right", "--config", config, "--json"], env);
		assert.equal(partial.code, 2); assert.deepEqual(JSON.parse(partial.stdout).delta.unknownBackends, ["google"]);
		assert.doesNotMatch(partial.stdout, /token-must-not-be-printed/);
		const listed = await runProcess(["--import", "tsx", cli, "list", "right", "--backend", "openai", "--config", config, "--json"], env);
		assert.equal(listed.code, 0); assert.equal(JSON.parse(listed.stdout).from.inventory[0].models.length, 2);
		assert.equal(await readFile(config, "utf8"), settingsText);
		await assert.rejects(() => readFile(join(directory, "auth.json")), { code: "ENOENT" });
	} finally {
		server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(directory, { recursive: true, force: true });
	}
});
