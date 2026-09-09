import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink, lstat, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gatewayModelIncluded, parseGatewaySettings } from "./gateway-profile.ts";
import { readGatewaySettings, saveGatewayModelFilter } from "./gateway-settings.ts";
import { exampleGatewayProfile } from "./gateway-test-fixtures.ts";

const profiles = [exampleGatewayProfile(), exampleGatewayProfile("another")] as const;

test("JSON profiles are independent, arbitrarily sized, strictly parsed, and carry no credentials", () => {
	assert.equal(parseGatewaySettings({ profiles: [profiles[1]] }).ok, true);
	assert.equal(parseGatewaySettings({ profiles: [] }).ok, true);
	for (const input of [
		{ profiles: [...profiles, profiles[0]] },
		{ profiles: [{ ...profiles[0], token: "must-not-be-stored" }] },
		{ profiles: [{ ...profiles[0], authOrigin: "http://example.test" }] },
		{ profiles: [{ ...profiles[0], inferenceOrigin: "https://user:secret@example.test" }] },
		{ profiles: [{ ...profiles[0], authOrigin: "https://example.test/other" }] },
		{ profiles: [{ ...profiles[0], models: { include: ["model-a", "model-a"] } }] },
	]) assert.equal(parseGatewaySettings(input).ok, false);
});

test("include omission, empty include, and exclude-wins are different policies", () => {
	assert.equal(gatewayModelIncluded("model-a", {}), true);
	assert.equal(gatewayModelIncluded("model-a", { include: [] }), false);
	assert.equal(gatewayModelIncluded("model-a", { include: ["model-a"], exclude: ["model-a"] }), false);
	assert.equal(gatewayModelIncluded("model-a", { include: ["model-a"] }), true);
});

test("filter saves are atomic, preserve stow symlinks and other profiles, and reject stale writers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "gateway-settings-test-"));
	try {
		const canonical = join(directory, "canonical.json"), link = join(directory, "settings.json");
		await writeFile(canonical, JSON.stringify({ profiles }));
		await symlink(canonical, link);
		const original = await readGatewaySettings(link);
		assert.ok(original.ok && original.value);
		assert.equal(original.value.path, canonical);
		const saved = await saveGatewayModelFilter(original.value, profiles[0].id, { include: ["model-a"], exclude: [] }, new AbortController().signal);
		assert.ok(saved.ok);
		assert.equal((await lstat(link)).isSymbolicLink(), true);
		assert.equal((await stat(canonical)).mode & 0o777, 0o600);
		assert.deepEqual(saved.value.settings.profiles[1], profiles[1]);
		const stale = await saveGatewayModelFilter(original.value, profiles[0].id, { include: [] }, new AbortController().signal);
		assert.ok(!stale.ok && stale.error.reason === "conflict");
		assert.deepEqual(JSON.parse(await readFile(canonical, "utf8")).profiles[0].models.include, ["model-a"]);
		await writeFile(`${canonical}.lock`, "other writer");
		const locked = await saveGatewayModelFilter(saved.value, profiles[0].id, {}, new AbortController().signal);
		assert.ok(!locked.ok && locked.error.reason === "locked");
		assert.equal(await readFile(`${canonical}.lock`, "utf8"), "other writer");
		const cancelled = await saveGatewayModelFilter(saved.value, profiles[0].id, {}, AbortSignal.abort());
		assert.ok(!cancelled.ok && cancelled.error.reason === "cancelled");
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing settings disable loading, whereas corrupt settings remain untouched and fail safely", async () => {
	const directory = await mkdtemp(join(tmpdir(), "gateway-settings-test-"));
	try {
		const path = join(directory, "private-gateway.json");
		const absent = await readGatewaySettings(path);
		assert.ok(absent.ok && absent.value === undefined);
		await writeFile(path, '{"profiles":["private-malformed-value"]');
		const bad = await readGatewaySettings(path);
		assert.ok(!bad.ok);
		assert.doesNotMatch(bad.error.message, /private-malformed-value/);
		assert.equal(await readFile(path, "utf8"), '{"profiles":["private-malformed-value"]');
	} finally { await rm(directory, { recursive: true, force: true }); }
});
