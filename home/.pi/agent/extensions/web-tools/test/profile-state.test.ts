import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadActiveWebIdentity, saveActiveWebIdentity } from "../profile-state.ts";

test("loadActiveWebIdentity falls back to public when the state file does not exist", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-tools-state-"));
	const identity = await loadActiveWebIdentity(path.join(tempDir, "state.json"));
	assert.deepEqual(identity, { kind: "public" });
});

test("saveActiveWebIdentity persists the selected Helium profile and loadActiveWebIdentity restores it", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-tools-state-"));
	const statePath = path.join(tempDir, "nested", "state.json");
	const selection = {
		kind: "helium" as const,
		profileId: "Default",
		displayName: "dillon",
		userDataDir: "/tmp/helium",
	};

	await saveActiveWebIdentity(selection, statePath);

	const raw = JSON.parse(await readFile(statePath, "utf8"));
	assert.deepEqual(raw, selection);
	assert.deepEqual(await loadActiveWebIdentity(statePath), selection);
});
