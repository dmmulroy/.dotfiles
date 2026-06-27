import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { FetchPublicWebClient, classifyMimeType, isPrivateOrLocalIp, parseContentType } from "../network.ts";
import { parsePublicHttpUrl } from "../types.ts";
import type { PublicWebRequest } from "../public-web-client.ts";

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

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
	assert.equal(isPrivateOrLocalIp("::ffff:127.0.0.1"), true);
	assert.equal(isPrivateOrLocalIp("::ffff:7f00:1"), true);
	assert.equal(isPrivateOrLocalIp("0:0:0:0:0:ffff:7f00:1"), true);
	assert.equal(isPrivateOrLocalIp("::ffff:a00:1"), true);
	assert.equal(isPrivateOrLocalIp("::ffff:c0a8:114"), true);
	assert.equal(isPrivateOrLocalIp("::127.0.0.1"), true);
	assert.equal(isPrivateOrLocalIp("::7f00:1"), true);
	assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
	assert.equal(isPrivateOrLocalIp("::ffff:808:808"), false);
});

test("FetchPublicWebClient follows redirects when private host blocking is disabled", async () => {
	const server = await startServer((request, response) => {
		if (request.url === "/redirect") {
			response.writeHead(302, { location: "/final" });
			response.end();
			return;
		}
		response.writeHead(200, { "content-type": "text/plain" });
		response.end("ok");
	});
	try {
		const client = new FetchPublicWebClient();
		const result = await client.get(makeRequest(`${server.origin}/redirect`, { blockPrivateHosts: false }));

		assert.equal(result._tag, "ok");
		assert.equal(result.value.finalUrl, `${server.origin}/final`);
		assert.equal(result.value.body.toString("utf8"), "ok");
	} finally {
		await server.close();
	}
});

test("FetchPublicWebClient rejects private hosts before fetching", async () => {
	const client = new FetchPublicWebClient();
	const result = await client.get(makeRequest("http://localhost:9/", { blockPrivateHosts: true }));

	assert.equal(result._tag, "err");
	assert.equal(result.error._tag, "PrivateHostBlocked");
});

test("FetchPublicWebClient rejects IPv4-mapped IPv6 private hosts before fetching", async () => {
	const client = new FetchPublicWebClient();
	const result = await client.get(makeRequest("http://[::ffff:127.0.0.1]:9/", { blockPrivateHosts: true }));

	assert.equal(result._tag, "err");
	assert.equal(result.error._tag, "PrivateIpBlocked");
});

test("FetchPublicWebClient rejects redirects with URL credentials before fetching target", async () => {
	const server = await startServer((_request, response) => {
		response.writeHead(302, { location: "http://user:pass@example.com/secret" });
		response.end();
	});
	try {
		const client = new FetchPublicWebClient();
		const result = await client.get(makeRequest(server.origin, { blockPrivateHosts: false }));

		assert.equal(result._tag, "err");
		if (result._tag !== "err") {
			return;
		}
		assert.equal(result.error._tag, "UrlCredentialsUnsupported");
		assert.doesNotMatch(JSON.stringify(result.error), /user|pass/);
	} finally {
		await server.close();
	}
});

test("FetchPublicWebClient rejects oversized content-length and streamed bodies", async () => {
	const server = await startServer((request, response) => {
		if (request.url === "/length") {
			response.writeHead(200, { "content-length": "100", "content-type": "text/plain" });
			response.end();
			return;
		}
		response.writeHead(200, { "content-type": "text/plain" });
		response.write("123456");
		response.end();
	});
	try {
		const client = new FetchPublicWebClient();
		const tooLargeByLength = await client.get(
			makeRequest(`${server.origin}/length`, { blockPrivateHosts: false, maxResponseBytes: 5 }),
		);
		const tooLargeByBody = await client.get(
			makeRequest(`${server.origin}/body`, { blockPrivateHosts: false, maxResponseBytes: 5 }),
		);

		assert.equal(tooLargeByLength._tag, "err");
		assert.equal(tooLargeByLength.error._tag, "ResponseTooLarge");
		assert.equal(tooLargeByBody._tag, "err");
		assert.equal(tooLargeByBody.error._tag, "ResponseTooLarge");
	} finally {
		await server.close();
	}
});

test("FetchPublicWebClient retries Cloudflare challenge with fallback user agent", async () => {
	const seenUserAgents: string[] = [];
	const server = await startServer((request, response) => {
		seenUserAgents.push(request.headers["user-agent"] ?? "");
		if (request.headers["user-agent"] !== "fallback-agent") {
			response.writeHead(403, { "cf-mitigated": "challenge" });
			response.end("challenge");
			return;
		}
		response.writeHead(200, { "content-type": "text/plain" });
		response.end("ok");
	});
	try {
		const client = new FetchPublicWebClient();
		const result = await client.get(
			makeRequest(server.origin, { blockPrivateHosts: false, fallbackUserAgent: "fallback-agent" }),
		);

		assert.equal(result._tag, "ok");
		assert.deepEqual(seenUserAgents, ["default-agent", "fallback-agent"]);
	} finally {
		await server.close();
	}
});

function makeRequest(
	url: string,
	overrides: { readonly blockPrivateHosts?: boolean; readonly maxResponseBytes?: number; readonly fallbackUserAgent?: string } = {},
): PublicWebRequest {
	const parsed = parsePublicHttpUrl(url);
	assert.equal(parsed._tag, "ok");
	return {
		url: parsed.value,
		accept: "text/plain",
		userAgent: "default-agent",
		fallbackUserAgent: overrides.fallbackUserAgent ?? "fallback-agent",
		maxRedirects: 5,
		maxResponseBytes: overrides.maxResponseBytes ?? 1024,
		blockPrivateHosts: overrides.blockPrivateHosts ?? true,
	};
}

async function startServer(
	handler: RequestHandler,
): Promise<{ readonly origin: string; readonly close: () => Promise<void> }> {
	const server = createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address === "object");
	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () => closeServer(server),
	};
}

async function closeServer(server: Server): Promise<void> {
	server.close();
	await once(server, "close");
}
