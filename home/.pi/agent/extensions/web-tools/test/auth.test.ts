import test from "node:test";
import assert from "node:assert/strict";
import { buildCookieHeader, mergeCookieHeader, resolveRequestAuth, selectCookiesForUrl } from "../auth.ts";
import { AuthSourceError } from "../auth-errors.ts";
import type { ActiveWebIdentity, AuthCookie, WebProfile } from "../types.ts";

const now = Date.UTC(2026, 0, 1);
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

test("selectCookiesForUrl keeps only cookies that match the request host, path, scheme, and expiry", () => {
	const cookies: AuthCookie[] = [
		{
			name: "session",
			value: "abc",
			domain: ".example.com",
			path: "/account",
			secure: true,
			httpOnly: true,
			expiresAt: now + 60_000,
		},
		{
			name: "host-only",
			value: "root",
			domain: "app.example.com",
			path: "/",
			secure: false,
			httpOnly: false,
			hostOnly: true,
		},
		{
			name: "wrong-subdomain",
			value: "nope",
			domain: "example.com",
			path: "/",
			secure: false,
			httpOnly: false,
			hostOnly: true,
		},
		{
			name: "expired",
			value: "gone",
			domain: ".example.com",
			path: "/",
			secure: false,
			httpOnly: false,
			expiresAt: now - 1,
		},
		{
			name: "wrong-path",
			value: "skip",
			domain: ".example.com",
			path: "/admin",
			secure: false,
			httpOnly: false,
		},
		{
			name: "insecure-on-http",
			value: "ok",
			domain: ".example.com",
			path: "/",
			secure: false,
			httpOnly: false,
		},
	];

	const selected = selectCookiesForUrl(cookies, new URL("https://app.example.com/account/settings"), now);

	assert.deepEqual(
		selected.map((cookie) => cookie.name),
		["session", "host-only", "insecure-on-http"],
	);
});

test("buildCookieHeader sorts longer paths first and mergeCookieHeader preserves existing cookies", () => {
	const cookies: AuthCookie[] = [
		{
			name: "root",
			value: "1",
			domain: ".example.com",
			path: "/",
			secure: false,
			httpOnly: false,
		},
		{
			name: "nested",
			value: "2",
			domain: ".example.com",
			path: "/account",
			secure: false,
			httpOnly: false,
		},
	];

	assert.equal(buildCookieHeader(cookies), "nested=2; root=1");
	assert.equal(mergeCookieHeader("existing=ok", "nested=2; root=1"), "existing=ok; nested=2; root=1");
	assert.equal(mergeCookieHeader(undefined, "nested=2"), "nested=2");
	assert.equal(mergeCookieHeader("existing=ok", undefined), "existing=ok");
});

test("resolveRequestAuth prefers CDP cookies and falls back to disk cookies when CDP fails fast", async () => {
	const url = new URL("https://app.example.com/account");
	const cdpCookie: AuthCookie = {
		name: "cdp",
		value: "fresh",
		domain: ".example.com",
		path: "/",
		secure: true,
		httpOnly: true,
	};
	const diskCookie: AuthCookie = {
		name: "disk",
		value: "stale",
		domain: ".example.com",
		path: "/",
		secure: true,
		httpOnly: true,
	};

	const fromCdp = await resolveRequestAuth(identity, url, profile, {
		getCdpCookies: async () => [cdpCookie],
		getDiskCookies: async () => [diskCookie],
		now: () => now,
	});
	assert.equal(fromCdp.cookieHeader, "cdp=fresh");
	assert.deepEqual(fromCdp.context, { identity: "helium", strategy: "cdp", cookieCount: 1 });

	const fromDisk = await resolveRequestAuth(identity, url, profile, {
		getCdpCookies: async () => {
			throw new AuthSourceError("cdp", "failed", "Helium CDP connection closed before reply for Storage.getCookies");
		},
		getDiskCookies: async () => [diskCookie],
		now: () => now,
	});
	assert.equal(fromDisk.cookieHeader, "disk=stale");
	assert.deepEqual(fromDisk.context, { identity: "helium", strategy: "disk-cookies", cookieCount: 1 });
});

test("resolveRequestAuth fails clearly when both auth sources fail operationally", async () => {
	await assert.rejects(
		resolveRequestAuth(identity, new URL("https://app.example.com/account"), profile, {
			getCdpCookies: async () => {
				throw new AuthSourceError("cdp", "failed", "Helium CDP connection closed before reply for Storage.getCookies");
			},
			getDiskCookies: async () => {
				throw new AuthSourceError("disk-cookies", "failed", "Unable to decrypt one or more Helium cookies");
			},
		}),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /Authenticated Helium cookies unavailable/);
			assert.match(error.message, /CDP: Helium CDP connection closed before reply/);
			assert.match(error.message, /disk cookies: Unable to decrypt one or more Helium cookies/);
			return true;
		},
	);
});

test("resolveRequestAuth keeps zero-cookie results non-fatal when auth sources succeed but nothing matches the URL", async () => {
	const result = await resolveRequestAuth(identity, new URL("https://app.example.com/account"), profile, {
		getCdpCookies: async () => [
			{
				name: "other-domain",
				value: "1",
				domain: ".elsewhere.example.com",
				path: "/",
				secure: true,
				httpOnly: true,
			},
		],
		now: () => now,
	});

	assert.equal(result.cookieHeader, undefined);
	assert.deepEqual(result.context, { identity: "helium", strategy: "cdp", cookieCount: 0 });
});
