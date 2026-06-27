import test from "node:test";
import assert from "node:assert/strict";
import { ok, type Result } from "../result.ts";
import { FetchPage } from "../fetch-page.ts";
import { parsePublicHttpUrl, type WebToolsSettings } from "../types.ts";
import type { PublicWebClient, PublicWebError, PublicWebRequest, PublicWebResponse } from "../public-web-client.ts";

const requestUrl = mustParsePublicHttpUrl("https://example.com/page");

const testFetchSettings: WebToolsSettings["fetch"] = {
	defaultFormat: "markdown",
	timeoutSeconds: 30,
	maxResponseBytes: 5 * 1024 * 1024,
	blockPrivateHosts: true,
	maxRedirects: 5,
	fallbackUserAgent: "opencode",
};

class FakePublicWebClient implements PublicWebClient {
	readonly requests: PublicWebRequest[] = [];

	constructor(private readonly response: Result<PublicWebResponse, PublicWebError>) {}

	async get(
		request: PublicWebRequest,
		_options?: { readonly signal?: AbortSignal },
	): Promise<Result<PublicWebResponse, PublicWebError>> {
		this.requests.push(request);
		return this.response;
	}
}

test("FetchPage returns text responses unchanged", async () => {
	const publicWeb = new FakePublicWebClient(ok(response("text/plain; charset=utf-8", "Plain text.")));
	const service = new FetchPage({ publicWeb, settings: testFetchSettings });

	const result = await service.fetch({ url: requestUrl, format: "text" });

	assert.equal(result._tag, "ok");
	assert.equal(result.value._tag, "Text");
	assert.equal(result.value._tag === "Text" ? result.value.text : "", "Plain text.");
	assert.match(publicWeb.requests[0]?.accept ?? "", /text\/plain/);
});

test("FetchPage converts HTML to markdown when requested", async () => {
	const publicWeb = new FakePublicWebClient(
		ok(response("text/html; charset=utf-8", "<html><body><main><h1>Hello</h1><p>World</p></main></body></html>")),
	);
	const service = new FetchPage({ publicWeb, settings: testFetchSettings });

	const result = await service.fetch({ url: requestUrl, format: "markdown" });

	assert.equal(result._tag, "ok");
	assert.equal(result.value._tag, "Text");
	assert.match(result.value._tag === "Text" ? result.value.text : "", /# Hello/);
	assert.match(result.value._tag === "Text" ? result.value.text : "", /World/);
});

test("FetchPage returns raster image content", async () => {
	const publicWeb = new FakePublicWebClient(ok(response("image/png", Buffer.from([1, 2, 3]))));
	const service = new FetchPage({ publicWeb, settings: testFetchSettings });

	const result = await service.fetch({ url: requestUrl, format: "markdown" });

	assert.equal(result._tag, "ok");
	assert.equal(result.value._tag, "Image");
	assert.equal(result.value._tag === "Image" ? result.value.data.toString("base64") : "", "AQID");
});

test("FetchPage rejects unsupported binary content", async () => {
	const publicWeb = new FakePublicWebClient(ok(response("application/octet-stream", Buffer.from([1, 2, 3]))));
	const service = new FetchPage({ publicWeb, settings: testFetchSettings });

	const result = await service.fetch({ url: requestUrl, format: "markdown" });

	assert.deepEqual(result, {
		_tag: "err",
		error: { _tag: "UnsupportedBinaryContent", mime: "application/octet-stream" },
	});
});

function response(contentType: string, body: string | Buffer): PublicWebResponse {
	const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
	return {
		requestedUrl: requestUrl,
		finalUrl: requestUrl,
		status: 200,
		statusText: "OK",
		headers: new Headers({ "content-type": contentType }),
		body: buffer,
		bytes: buffer.byteLength,
	};
}

function mustParsePublicHttpUrl(input: string) {
	const parsed = parsePublicHttpUrl(input);
	if (parsed._tag === "err") {
		throw new Error("Invalid test URL");
	}
	return parsed.value;
}
