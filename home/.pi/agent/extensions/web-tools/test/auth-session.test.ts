import test from "node:test";
import assert from "node:assert/strict";
import { createSessionAuthResolver } from "../auth-session.ts";
import type { ActiveWebIdentity, AuthCookie, WebProfile } from "../types.ts";

const identity: ActiveWebIdentity = {
	kind: "helium",
	profileId: "Default",
	displayName: "dillon",
	userDataDir: "/tmp/helium",
};
const profile: WebProfile = {
	browser: "helium",
	profileId: "Default",
	displayName: "dillon",
	userDataDir: "/tmp/helium",
	profileDir: "/tmp/helium/Default",
	cookieDbPath: "/tmp/helium/Default/Cookies",
};
const baseCookie: AuthCookie = {
	name: "session",
	value: "abc",
	domain: ".example.com",
	path: "/",
	secure: true,
	httpOnly: true,
};

test("session auth resolver caches disk auth per profile within the TTL", async () => {
	let diskLoads = 0;
	let now = Date.UTC(2026, 0, 1, 0, 0, 0);
	const resolver = createSessionAuthResolver(
		() => ({ identity, profile }),
		{
			loadSourceCookies: async (_identity, _url, _profile, source) => {
				assert.equal(source, "disk-cookies");
				diskLoads += 1;
				return [baseCookie];
			},
			now: () => now,
			diskCacheTtlMs: 30_000,
			cdpCacheTtlMs: 120_000,
		},
	);

	const first = await resolver.resolve(new URL("https://example.com/private"));
	const second = await resolver.resolve(new URL("https://example.com/private"));

	assert.equal(diskLoads, 1);
	assert.equal(first.cookieHeader, "session=abc");
	assert.equal(second.cookieHeader, "session=abc");

	now += 31_000;
	await resolver.resolve(new URL("https://example.com/private"));
	assert.equal(diskLoads, 2);
});

test("session auth resolver reuses cached CDP auth after a successful fallback and clears on demand", async () => {
	let now = Date.UTC(2026, 0, 1, 0, 0, 0);
	const loads: string[] = [];
	const resolver = createSessionAuthResolver(
		() => ({ identity, profile }),
		{
			loadSourceCookies: async (_identity, _url, _profile, source) => {
				loads.push(source);
				return [{ ...baseCookie, value: source === "cdp" ? "fresh" : "stale" }];
			},
			now: () => now,
			diskCacheTtlMs: 30_000,
			cdpCacheTtlMs: 120_000,
		},
	);

	const initial = await resolver.resolve(new URL("https://example.com/private"));
	const refreshed = await resolver.resolve(new URL("https://example.com/private"), {
		preferredSources: ["cdp"],
	});
	const reused = await resolver.resolve(new URL("https://example.com/private"));

	assert.equal(initial.cookieHeader, "session=stale");
	assert.equal(refreshed.cookieHeader, "session=fresh");
	assert.equal(reused.cookieHeader, "session=fresh");
	assert.deepEqual(loads, ["disk-cookies", "cdp"]);

	resolver.clear();
	now += 1;
	await resolver.resolve(new URL("https://example.com/private"));
	assert.deepEqual(loads, ["disk-cookies", "cdp", "disk-cookies"]);
});
