import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "..");
const fixturesDir = path.join(testDir, "fixtures");

const wellKnown = JSON.parse(fs.readFileSync(path.join(fixturesDir, "wellknown.json"), "utf8"));
assert.equal(wellKnown.auth.env, "TOKEN");
assert.equal(wellKnown.config.provider.openai.options.baseURL, "https://opencode.cloudflare.dev/openai");
assert.equal(wellKnown.config.provider["workers-ai"].options.baseURL, "https://opencode.cloudflare.dev/compat");
assert.ok(wellKnown.config.provider["workers-ai"].models["workers-ai/@cf/moonshotai/kimi-k2.5"]);

const importedToken = execFileSync(process.execPath, [path.join(rootDir, "print-token.mjs")], {
	encoding: "utf8",
	env: {
		...process.env,
		OPENCODE_CLOUDFLARE_AUTH_FILE: path.join(fixturesDir, "opencode-auth.json"),
	},
}).trim();
assert.match(importedToken, /^eyJ/);

const envToken = execFileSync(process.execPath, [path.join(rootDir, "print-token.mjs")], {
	encoding: "utf8",
	env: {
		...process.env,
		OPENCODE_CLOUDFLARE_AUTH_FILE: path.join(fixturesDir, "opencode-auth.json"),
		OPENCODE_CLOUDFLARE_TOKEN: "override-token",
	},
}).trim();
assert.equal(envToken, "override-token");

console.log("opencode-cloudflare smoke checks passed");
