import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverHeliumProfilesFromUserDataDir } from "../profiles.ts";

test("discoverHeliumProfilesFromUserDataDir returns Chromium-style Helium profiles with cookie and CDP availability", async () => {
	const userDataDir = await mkdtemp(path.join(os.tmpdir(), "web-tools-profiles-"));
	await mkdir(path.join(userDataDir, "Default"), { recursive: true });
	await writeFile(path.join(userDataDir, "Default", "Cookies"), "");
	await writeFile(path.join(userDataDir, "DevToolsActivePort"), "9222\n/devtools/browser/test\n");
	await writeFile(
		path.join(userDataDir, "Local State"),
		JSON.stringify({
			profile: {
				last_used: "Default",
				info_cache: {
					Default: {
						name: "dillon",
					},
				},
			},
		}),
	);

	const profiles = await discoverHeliumProfilesFromUserDataDir(userDataDir);

	assert.deepEqual(profiles, [
		{
			browser: "helium",
			profileId: "Default",
			displayName: "dillon",
			userDataDir,
			profileDir: path.join(userDataDir, "Default"),
			cookieDbPath: path.join(userDataDir, "Default", "Cookies"),
			isLastActive: true,
			cdpReachable: true,
			diskCookiesAvailable: true,
		},
	]);
});

test("discoverHeliumProfilesFromUserDataDir falls back to the profile id when the display name is absent", async () => {
	const userDataDir = await mkdtemp(path.join(os.tmpdir(), "web-tools-profiles-"));
	await mkdir(path.join(userDataDir, "Profile 2"), { recursive: true });
	await writeFile(path.join(userDataDir, "Profile 2", "Cookies"), "");
	await writeFile(
		path.join(userDataDir, "Local State"),
		JSON.stringify({
			profile: {
				info_cache: {
					"Profile 2": {},
				},
			},
		}),
	);

	const profiles = await discoverHeliumProfilesFromUserDataDir(userDataDir);

	assert.equal(profiles[0]?.displayName, "Profile 2");
	assert.equal(profiles[0]?.cdpReachable, false);
	assert.equal(profiles[0]?.diskCookiesAvailable, true);
});
