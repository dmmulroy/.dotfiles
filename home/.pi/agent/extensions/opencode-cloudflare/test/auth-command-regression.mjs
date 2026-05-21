import assert from "node:assert/strict";
import { runGatewayAuthCommand } from "../auth.ts";

await assert.rejects(
	runGatewayAuthCommand("cloudflared access login -app=https://opencode.cloudflare.dev"),
	/Refusing string gateway auth command/,
);

await assert.rejects(
	runGatewayAuthCommand(["sh", "-lc", "echo token"]),
	/unexpected gateway auth command/,
);

await assert.rejects(
	runGatewayAuthCommand(["cloudflared", "access", "login", "--no-verbose"]),
	/without exactly one trusted/,
);

await assert.rejects(
	runGatewayAuthCommand(["cloudflared", "access", "login", "-app=https://example.test"]),
	/without exactly one trusted/,
);

await assert.rejects(
	runGatewayAuthCommand([
		"cloudflared",
		"access",
		"login",
		"-app=https://opencode.cloudflare.dev",
		"--app=https://opencode.cloudflare.dev",
	]),
	/without exactly one trusted/,
);

console.log("auth command regression checks passed");
