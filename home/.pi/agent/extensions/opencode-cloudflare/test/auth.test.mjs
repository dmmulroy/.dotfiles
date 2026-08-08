import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createGatewayAuthService,
	createGatewayTokenSource,
	describeTokenState,
	GatewayToken,
	getGatewayTokenExpiry,
	validateGatewayAuthCommand,
} from "../auth.ts";
import { Redacted } from "../redacted.ts";

function jwt(exp) {
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${encode({ alg: "none" })}.${encode({ exp })}.signature`;
}

function createAuth(overrides = {}) {
	const environment = new Map(Object.entries(overrides.environment ?? {}));
	const files = new Map(Object.entries(overrides.files ?? {}));
	const now = () => overrides.now ?? 1000;
	const credential = overrides.credential;
	const credentialReader = overrides.credentialReader ?? {
		get: () => credential,
	};
	const tokenSource = createGatewayTokenSource({
		environment: (name) => environment.get(name),
		homeDirectory: () => "/home/tester",
		fileExists: (path) => files.has(path),
		readTextFile: (path) => {
			const value = files.get(path);
			if (value === undefined) throw new Error("missing test file");
			return value;
		},
		credentialReader,
		now,
	});
	return createGatewayAuthService({ configStore: overrides.configStore ?? {}, tokenSource, credentialReader, now });
}

test("GatewayToken uses the Redacted primitive and reports JWT expiry", () => {
	const value = jwt(1000);
	const token = GatewayToken.parse(value);
	assert.ok(token);
	assert.equal(Redacted.value(token), value);
	assert.equal(getGatewayTokenExpiry(token), 700000);
	assert.match(describeTokenState(token, 1000), /present \(expires/);
});

test("resolves explicit environment auth before imported OpenCode auth", () => {
	const authPath = "/tmp/opencode-auth.json";
	const auth = createAuth({
		environment: {
			OPENCODE_CLOUDFLARE_AUTH_FILE: authPath,
			OPENCODE_CLOUDFLARE_TOKEN: "environment-token",
		},
		files: {
			[authPath]: JSON.stringify({
				"https://opencode.cloudflare.dev": { type: "oauth", token: "imported-token" },
			}),
		},
	});
	const imported = auth.readImportedToken();
	assert.equal(imported.ok, true);
	assert.equal(imported.value?.authPath, authPath);
	const resolved = auth.resolveToken();
	assert.equal(resolved.ok, true);
	assert.equal(Redacted.value(resolved.value), "environment-token");
});

test("resolves stored Pi auth before imported OpenCode auth", () => {
	const authPath = "/tmp/opencode-auth.json";
	const auth = createAuth({
		environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
		files: { [authPath]: JSON.stringify({ "https://opencode.cloudflare.dev": { token: "imported-token" } }) },
		credential: { type: "oauth", refresh: "", access: "stored-token", expires: 5000 },
	});
	const resolved = auth.resolveToken();
	assert.equal(resolved.ok, true);
	assert.equal(Redacted.value(resolved.value), "stored-token");
});

test("expired opaque Pi auth falls back to and refreshes identical imported auth", async () => {
	const authPath = "/tmp/opencode-auth.json";
	const auth = createAuth({
		now: 1000,
		environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
		files: { [authPath]: JSON.stringify({ "https://opencode.cloudflare.dev": { token: "same-token" } }) },
		credential: { type: "oauth", refresh: "", access: "same-token", expires: 999 },
	});
	const resolved = auth.resolveToken();
	assert.equal(resolved.ok, true);
	assert.equal(Redacted.value(resolved.value), "same-token");
	const refreshed = await auth.refresh(
		{ refresh: "", access: "same-token", expires: 999 },
		new AbortController().signal,
	);
	assert.equal(refreshed.access, "same-token");
	assert.ok(refreshed.expires > 1000);
});

test("OAuth credential refresh honors cancellation", async () => {
	const auth = createAuth();
	const controller = new AbortController();
	controller.abort();

	await assert.rejects(
		auth.refresh({ refresh: "", access: "expired-token", expires: 999 }, controller.signal),
		(error) => error === controller.signal.reason,
	);
});

test("auth file parsing rejects malformed storage instead of trusting it", () => {
	const authPath = "/tmp/opencode-auth.json";
	const auth = createAuth({
		environment: { OPENCODE_CLOUDFLARE_AUTH_FILE: authPath },
		files: { [authPath]: "[]" },
	});
	const imported = auth.readImportedToken();
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
