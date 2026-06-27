import test from "node:test";
import assert from "node:assert/strict";
import { ok, type Result } from "../result.ts";
import { SearchWeb } from "../search-web.ts";
import { parsePublicHttpUrl, parseSearchQuery, type WebToolsSettings } from "../types.ts";
import type { NormalizedSearchResult, SearchProvider, SearchProviderError, SearchProviderRequest } from "../providers/types.ts";

const endpoint = parsePublicHttpUrl("https://example.test/mcp");
assert.equal(endpoint._tag, "ok");

const testSearchSettings: WebToolsSettings["search"] = {
	enabled: true,
	provider: "exa",
	endpoint: endpoint.value,
	timeoutSeconds: 25,
	defaultMaxResults: 8,
	defaultDepth: "auto",
};

class FakeSearchProvider implements SearchProvider {
	readonly name = "exa" as const;
	readonly requests: SearchProviderRequest[] = [];

	constructor(private readonly response: Result<readonly NormalizedSearchResult[], SearchProviderError>) {}

	async search(
		input: SearchProviderRequest,
		_options?: { readonly signal?: AbortSignal },
	): Promise<Result<readonly NormalizedSearchResult[], SearchProviderError>> {
		this.requests.push(input);
		return this.response;
	}
}

test("SearchWeb returns provider results with query metadata", async () => {
	const query = parseSearchQuery("example");
	const resultUrl = parsePublicHttpUrl("https://example.com/");
	assert.equal(query._tag, "ok");
	assert.equal(resultUrl._tag, "ok");
	const exampleResult: NormalizedSearchResult = {
		title: "Example Domain",
		url: resultUrl.value,
		snippet: "Documentation-safe example domain.",
	};
	const provider = new FakeSearchProvider(ok([exampleResult]));
	const service = new SearchWeb({ provider, settings: testSearchSettings });

	const result = await service.search({ query: query.value, maxResults: 8, depth: "auto" });

	assert.equal(result._tag, "ok");
	assert.equal(result.value.provider, "exa");
	assert.equal(result.value.query, "example");
	assert.equal(result.value.results.length, 1);
});
