import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getCookiesFromProfileDb, tryDecryptChromiumCookieValue } from "../auth-cookies.ts";
import type { WebProfile } from "../types.ts";

const profile: WebProfile = {
	browser: "helium",
	profileId: "Default",
	displayName: "dillon",
	userDataDir: "/tmp/helium",
	profileDir: "/tmp/helium/Default",
	cookieDbPath: "/tmp/helium/Default/Cookies",
};

test("tryDecryptChromiumCookieValue decrypts Chromium v24 cookies with a host hash prefix", () => {
	const encryptedValueHex = encryptChromiumCookieValueHex("session=abc123", "top-secret", {
		hostKey: ".example.com",
		metaVersion: 24,
	});

	assert.equal(
		tryDecryptChromiumCookieValue(encryptedValueHex, "top-secret", {
			hostKey: ".example.com",
			metaVersion: 24,
		}),
		"session=abc123",
	);
	assert.equal(
		tryDecryptChromiumCookieValue(encryptedValueHex, "top-secret", {
			hostKey: ".wrong-example.com",
			metaVersion: 24,
		}),
		undefined,
	);
});

test("getCookiesFromProfileDb maps persisted cookies, excludes partitioned cookies, and passes db metadata into decryption", async () => {
	const cookies = await getCookiesFromProfileDb(profile, {
		querySnapshot: async () => ({
			metaVersion: 24,
			rows: [
				{
					host_key: ".example.com",
					name: "plain",
					value: "visible",
					encrypted_value_hex: "",
					path: "/",
					is_secure: 1,
					is_httponly: 1,
					has_expires: 1,
					expires_utc: 13253760000000000,
					top_frame_site_key: "",
				},
				{
					host_key: ".chips.example.com",
					name: "partitioned",
					value: "skip",
					encrypted_value_hex: "",
					path: "/",
					is_secure: 1,
					is_httponly: 1,
					has_expires: 0,
					expires_utc: 0,
					top_frame_site_key: "https://example.com",
				},
				{
					host_key: "app.example.com",
					name: "encrypted",
					value: "",
					encrypted_value_hex: "763130AABB",
					path: "/",
					is_secure: 0,
					is_httponly: 0,
					has_expires: 0,
					expires_utc: 0,
					top_frame_site_key: "",
				},
				{
					host_key: ".empty.example.com",
					name: "empty",
					value: "",
					encrypted_value_hex: "763130CCDD",
					path: "/",
					is_secure: 0,
					is_httponly: 0,
					has_expires: 0,
					expires_utc: 0,
					top_frame_site_key: "",
				},
			],
		}),
		decryptValue: async (encryptedValueHex, context) => {
			if (encryptedValueHex === "763130AABB") {
				assert.deepEqual(context, { hostKey: "app.example.com", metaVersion: 24 });
				return "secret";
			}
			assert.equal(encryptedValueHex, "763130CCDD");
			assert.deepEqual(context, { hostKey: ".empty.example.com", metaVersion: 24 });
			return "";
		},
	});

	assert.deepEqual(cookies, [
		{
			name: "plain",
			value: "visible",
			domain: ".example.com",
			path: "/",
			secure: true,
			httpOnly: true,
			expiresAt: 1609286400000,
			hostOnly: false,
		},
		{
			name: "encrypted",
			value: "secret",
			domain: "app.example.com",
			path: "/",
			secure: false,
			httpOnly: false,
			hostOnly: true,
		},
		{
			name: "empty",
			value: "",
			domain: ".empty.example.com",
			path: "/",
			secure: false,
			httpOnly: false,
			hostOnly: false,
		},
	]);
});

test("getCookiesFromProfileDb fails clearly when cookie decryption fails", async () => {
	await assert.rejects(
		getCookiesFromProfileDb(profile, {
			querySnapshot: async () => ({
				metaVersion: 24,
				rows: [
					{
						host_key: ".example.com",
						name: "encrypted",
						value: "",
						encrypted_value_hex: "763130AABB",
						path: "/",
						is_secure: 1,
						is_httponly: 1,
						has_expires: 0,
						expires_utc: 0,
						top_frame_site_key: "",
					},
				],
			}),
			decryptValue: async () => {
				throw new Error("bad password");
			},
		}),
		/Unable to decrypt one or more Helium cookies/,
	);
});

function encryptChromiumCookieValueHex(
	value: string,
	password: string,
	context: { hostKey: string; metaVersion: number },
): string {
	const plaintext = Buffer.concat([
		...(context.metaVersion >= 24 ? [crypto.createHash("sha256").update(context.hostKey, "utf8").digest()] : []),
		Buffer.from(value, "utf8"),
	]);
	const key = crypto.pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from("saltysalt"), 1003, 16, "sha1");
	const iv = Buffer.alloc(16, 0x20);
	const blockSize = 16;
	const paddingLength = blockSize - (plaintext.length % blockSize || blockSize);
	const padded = Buffer.concat([plaintext, Buffer.alloc(paddingLength || blockSize, paddingLength || blockSize)]);
	const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
	cipher.setAutoPadding(false);
	return Buffer.concat([Buffer.from("v10", "utf8"), cipher.update(padded), cipher.final()]).toString("hex").toUpperCase();
}
