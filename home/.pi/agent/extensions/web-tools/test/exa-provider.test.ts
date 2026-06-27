import test from "node:test";
import assert from "node:assert/strict";
import { ok, type Result } from "../result.ts";
import { parsePublicHttpUrl, parseSearchQuery } from "../types.ts";
import {
	ExaSearchProvider,
	type HttpClientError,
	type HttpJsonRequest,
	type HttpTextClient,
	type HttpTextResponse,
} from "../providers/exa.ts";

const LEGACY_PROVIDER_TEXT = [
	"Title: Example Domain",
	"URL: https://example.com/",
	"Text: Example Domain",
	"",
	"Documentation-safe example domain.",
].join("\n");

class RecordingHttpTextClient implements HttpTextClient {
	readonly requests: HttpJsonRequest[] = [];

	constructor(private readonly response: Result<HttpTextResponse, HttpClientError>) {}

	async postJson(
		request: HttpJsonRequest,
		_options?: { readonly signal?: AbortSignal },
	): Promise<Result<HttpTextResponse, HttpClientError>> {
		this.requests.push(request);
		return this.response;
	}
}

test("ExaSearchProvider sends fast when deep is requested", async () => {
	const http = new RecordingHttpTextClient(
		ok({
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": "application/json" }),
			bodyText: JSON.stringify({ result: { content: [{ type: "text", text: LEGACY_PROVIDER_TEXT }] } }),
			bytes: 123,
		}),
	);
	const endpoint = parsePublicHttpUrl("https://example.test/mcp");
	const query = parseSearchQuery("example");
	assert.equal(endpoint._tag, "ok");
	assert.equal(query._tag, "ok");

	const provider = new ExaSearchProvider(endpoint.value, http);
	const result = await provider.search({ query: query.value, maxResults: 5, depth: "deep" });

	assert.equal(result._tag, "ok");
	assert.equal(result.value.length, 1);
	const requestBody = http.requests[0]?.body;
	assert.ok(isEncodedExaRequest(requestBody));
	assert.equal(requestBody.params.arguments.type, "fast");
});

test("ExaSearchProvider returns safe provider errors", async () => {
	const http = new RecordingHttpTextClient(
		ok({
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": "text/event-stream" }),
			bodyText: `event: message\ndata: ${JSON.stringify({ result: { isError: true, content: [{ type: "text", text: "raw provider details" }] } })}\n\n`,
			bytes: 123,
		}),
	);
	const endpoint = parsePublicHttpUrl("https://example.test/mcp");
	const query = parseSearchQuery("example");
	assert.equal(endpoint._tag, "ok");
	assert.equal(query._tag, "ok");

	const provider = new ExaSearchProvider(endpoint.value, http);
	const result = await provider.search({ query: query.value, maxResults: 5, depth: "fast" });

	assert.deepEqual(result, {
		_tag: "err",
		error: { _tag: "SearchProviderReturnedError", provider: "exa", safeMessage: "Search provider returned an error" },
	});
});

function isEncodedExaRequest(value: unknown): value is { readonly params: { readonly arguments: { readonly type: string } } } {
	return (
		typeof value === "object" &&
		value !== null &&
		"params" in value &&
		typeof value.params === "object" &&
		value.params !== null &&
		"arguments" in value.params &&
		typeof value.params.arguments === "object" &&
		value.params.arguments !== null &&
		"type" in value.params.arguments &&
		typeof value.params.arguments.type === "string"
	);
}
