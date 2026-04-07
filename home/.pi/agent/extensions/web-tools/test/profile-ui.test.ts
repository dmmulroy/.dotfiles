import test from "node:test";
import assert from "node:assert/strict";
import { formatWebProfileStatus, resolveSelectedProfile } from "../profile-ui.ts";
import type { ActiveWebIdentity, WebProfile } from "../types.ts";

const profiles: WebProfile[] = [
	{
		browser: "helium",
		profileId: "Default",
		displayName: "dillon",
		userDataDir: "/tmp/helium",
		profileDir: "/tmp/helium/Default",
		cookieDbPath: "/tmp/helium/Default/Cookies",
	},
];

test("formatWebProfileStatus renders the footer label for public and Helium selections", () => {
	assert.equal(formatWebProfileStatus({ kind: "public" }), "web: public");
	assert.equal(
		formatWebProfileStatus({ kind: "helium", profileId: "Default", displayName: "dillon", userDataDir: "/tmp/helium" }),
		"web: Helium/dillon",
	);
});

test("resolveSelectedProfile matches the persisted Helium selection against discovered profiles", () => {
	const selected: ActiveWebIdentity = {
		kind: "helium",
		profileId: "Default",
		displayName: "dillon",
		userDataDir: "/tmp/helium",
	};
	assert.equal(resolveSelectedProfile(selected, profiles), profiles[0]);
	assert.equal(resolveSelectedProfile({ kind: "public" }, profiles), undefined);
});
