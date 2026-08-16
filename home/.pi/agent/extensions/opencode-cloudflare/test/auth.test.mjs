import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createGatewayOAuthAuth,
	createGatewayProviderAuth,
	createOpenCodeAuthSource,
	describeTokenState,
	GatewayToken,
	getGatewayTokenExpiry,
	isUsableGatewayToken,
	toGatewayModelAuth,
	validateGatewayAuthCommand,
} from "../auth.ts";
import { Redacted } from "../redacted.ts";

function jwt(exp) {
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${encode({ alg: "none" })}.${encode({ exp })}.signature`;
}

function createAuthSource(overrides = {}) {
	const environment = new Map(Object.entries(overrides.environment ?? {}));
	const files = new Map(Object.entries(overrides.files ?? {}));
	return createOpenCodeAuthSource({
		environment: (name) => environment.get(name),
		homeDirectory: () => "/home/tester",
		fileExists: (path) => files.has(path),
		readTextFile: (path) => {
			const value = files.get(path);
			if (value === undefined) throw new Error("missing test file");
			return value;
		},
		now: () => overrides.now ?? 1000,
	});
}

test("GatewayToken uses the Redacted primitive and reports JWT expiry", () => {
	const value = jwt(1000);
	const token = GatewayToken.parse(value);
	assert.ok(token);
	assert.equal(Redacted.value(token), value);
	assert.equal(getGatewayTokenExpiry(token), 700000);
	assert.match(describeTokenState(token, 1000), /present \(expires/);
	assert.equal(isUsableGatewayToken(token, 1000), true);
	assert.equal(isUsableGatewayToken(token, 700000), false);
});

test("imports a usable OpenCode auth-file token", () => {
	const authPath = "/tmp/opencode-auth.json";
	const source = createAuthSource({
		environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
		files: {
			[authPath]: JSON.stringify({
				"https://opencode.cloudflare.dev": { type: "oauth", token: "imported-token" },
			}),
		},
	});
	const imported = source.readImportedToken();
	assert.equal(imported.ok, true);
	assert.equal(imported.value?.authPath, authPath);
	assert.equal(Redacted.value(imported.value.token), "imported-token");
});

test("auth file parsing rejects malformed storage instead of trusting it", () => {
	const authPath = "/tmp/opencode-auth.json";
	const source = createAuthSource({
		environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
		files: { [authPath]: "[]" },
	});
	const imported = source.readImportedToken();
	assert.equal(imported.ok, false);
	assert.equal(imported.error.reason, "invalid-auth-file");
});

test("only accepts the exact shell-free Cloudflare Access login command", () => {
	const accepted = validateGatewayAuthCommand([
		"cloudflared",
		"access",
		"login",
		"--no-verbose",
		"-app=https://opencode.cloudflare.dev",
	]);
	assert.equal(accepted.ok, true);

	for (const command of [
		"cloudflared access login -app=https://opencode.cloudflare.dev",
		["sh", "-lc", "echo token"],
		["cloudflared", "access", "login", "--no-verbose"],
		["cloudflared", "access", "login", "-app=https://example.test"],
		[
			"cloudflared",
			"access",
			"login",
			"-app=https://opencode.cloudflare.dev",
			"--app=https://opencode.cloudflare.dev",
		],
	]) {
		const result = validateGatewayAuthCommand(command);
		assert.equal(result.ok, false);
		assert.equal(result.error.reason, "untrusted-auth-command");
	}
});

test("native credential resolution prefers a stored token over OpenCode import", async () => {
	const authPath = "/tmp/opencode-auth.json";
	const auth = createGatewayProviderAuth(
		createAuthSource({
			environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
			files: { [authPath]: JSON.stringify({ "https://opencode.cloudflare.dev": { token: "imported-token" } }) },
		}),
		async () => undefined,
		() => 1000,
	);
	const resolved = await auth.apiKey.resolve({
		ctx: { env: async () => undefined, fileExists: async () => false },
		credential: { type: "api_key", key: "stored-token" },
		signal: new AbortController().signal,
	});
	assert.equal(resolved?.source, "stored credential");
	assert.equal(resolved?.auth.apiKey, "stored-token");
	assert.equal(resolved?.auth.headers["cf-access-token"], "stored-token");
	assert.equal(resolved?.auth.headers.Authorization, "Bearer stored-token");
	assert.equal(resolved?.auth.headers["x-api-key"], null);
});

test("environment override and OpenCode import remain usable when nothing is stored", async () => {
	const authPath = "/tmp/opencode-auth.json";
	const auth = createGatewayProviderAuth(
		createAuthSource({
			environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
			files: { [authPath]: JSON.stringify({ "https://opencode.cloudflare.dev": { token: "imported-token" } }) },
		}),
		async () => undefined,
		() => 1000,
	);
	const fromEnv = await auth.apiKey.resolve({
		ctx: { env: async (name) => name === "OPENCODE_CLOUDFLARE_TOKEN" ? "environment-token" : undefined, fileExists: async () => false },
		signal: new AbortController().signal,
	});
	assert.equal(fromEnv?.source, "OPENCODE_CLOUDFLARE_TOKEN");
	assert.equal(fromEnv?.auth.apiKey, "environment-token");

	const fromImport = await auth.apiKey.resolve({
		ctx: { env: async () => undefined, fileExists: async () => false },
		signal: new AbortController().signal,
	});
	assert.equal(fromImport?.source, "OpenCode auth file");
	assert.equal(fromImport?.auth.apiKey, "imported-token");
});

test("expired JWT tokens are not treated as usable credentials", async () => {
	const expired = jwt(1);
	const auth = createGatewayProviderAuth(
		createAuthSource(),
		async () => undefined,
		() => 10_000,
	);
	const resolved = await auth.apiKey.resolve({
		ctx: { env: async () => undefined, fileExists: async () => false },
		credential: { type: "api_key", key: expired },
		signal: new AbortController().signal,
	});
	assert.equal(resolved, undefined);
});

test("OAuth login reuses a usable imported token", async () => {
	const authPath = "/tmp/opencode-auth.json";
	const oauth = createGatewayOAuthAuth(
		createAuthSource({
			environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
			files: { [authPath]: JSON.stringify({ "https://opencode.cloudflare.dev": { token: "imported-token" } }) },
		}),
		async () => {
			throw new Error("login command should not run");
		},
		() => 1000,
	);
	const events = [];
	const credential = await oauth.login({
		signal: new AbortController().signal,
		prompt: async () => {
			throw new Error("prompt should not run");
		},
		notify: (event) => events.push(event),
	});
	assert.equal(credential.type, "oauth");
	assert.equal(credential.access, "imported-token");
	assert.ok(events.some((event) => event.type === "progress"));
});

test("OAuth refresh honors cancellation and expired imported tokens", async () => {
	const oauth = createGatewayOAuthAuth(createAuthSource(), async () => undefined, () => 1000);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		oauth.refresh({ type: "oauth", refresh: "", access: "expired-token", expires: 999 }, controller.signal),
		(error) => error === controller.signal.reason,
	);

	await assert.rejects(
		oauth.refresh({ type: "oauth", refresh: "", access: "expired-token", expires: 999 }, new AbortController().signal),
		(error) => error.reason === "expired-token",
	);
});

test("toAuth never returns a token in object stringification", () => {
	const token = GatewayToken.parse("super-secret-access-token");
	const auth = toGatewayModelAuth(token);
	assert.doesNotMatch(JSON.stringify(token), /super-secret-access-token/);
	assert.equal(auth.headers["cf-access-token"], "super-secret-access-token");
});
