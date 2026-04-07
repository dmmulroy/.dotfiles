import test from "node:test";
import assert from "node:assert/strict";
import { classifyMimeType, fetchWithRedirects, isPrivateOrLocalIp, parseContentType } from "../network.ts";

test("parseContentType normalizes html and xhtml content types", () => {
	assert.equal(parseContentType("TEXT/HTML; charset=UTF-8").kind, "html");
	assert.equal(parseContentType("TEXT/HTML; charset=UTF-8").mime, "text/html");
	assert.equal(parseContentType("application/xhtml+xml; charset=utf-8").kind, "html");
	assert.equal(parseContentType("image/svg+xml").kind, "svg");
});

test("classifyMimeType recognizes supported raster images and binary fallback", () => {
	assert.equal(classifyMimeType("image/png"), "raster-image");
	assert.equal(classifyMimeType("application/octet-stream"), "binary");
	assert.equal(classifyMimeType("application/json"), "text");
});

test("isPrivateOrLocalIp detects local and private IP ranges", () => {
	assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
	assert.equal(isPrivateOrLocalIp("10.0.0.5"), true);
	assert.equal(isPrivateOrLocalIp("192.168.1.20"), true);
	assert.equal(isPrivateOrLocalIp("172.20.0.1"), true);
	assert.equal(isPrivateOrLocalIp("::1"), true);
	assert.equal(isPrivateOrLocalIp("fc00::1"), true);
	assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
});

test("fetchWithRedirects can recompute headers for each redirect hop", async () => {
	const originalFetch = globalThis.fetch;
	const seen: Array<{ url: string; cookie: string | null }> = [];
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = String(input);
		const headers = new Headers(init?.headers);
		seen.push({ url, cookie: headers.get("cookie") });
		if (url === "https://first.example.com/start") {
			return new Response(null, {
				status: 302,
				headers: { location: "https://second.example.com/next" },
			});
		}
		return new Response("ok", { status: 200 });
	}) as typeof fetch;

	try {
		const result = await fetchWithRedirects(new URL("https://first.example.com/start"), {
			getHeaders: (url) => ({ Cookie: `for=${url.hostname}` }),
			maxRedirects: 5,
			blockPrivateHosts: false,
		});
		assert.equal(result.finalUrl.toString(), "https://second.example.com/next");
		assert.deepEqual(seen, [
			{ url: "https://first.example.com/start", cookie: "for=first.example.com" },
			{ url: "https://second.example.com/next", cookie: "for=second.example.com" },
		]);
		await result.response.text();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
