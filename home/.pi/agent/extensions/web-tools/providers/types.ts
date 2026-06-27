import type { Result } from "../result.ts";
import type { NormalizedSearchResult, SearchDepth, SearchProviderName, SearchQuery } from "../types.ts";
export type { NormalizedSearchResult } from "../types.ts";

export interface SearchProviderRequest {
	readonly query: SearchQuery;
	readonly maxResults: number;
	readonly depth: SearchDepth;
}

export type SearchProviderError =
	| { readonly _tag: "SearchProviderUnavailable"; readonly provider: SearchProviderName; readonly cause: unknown }
	| { readonly _tag: "SearchProviderStatusRejected"; readonly provider: SearchProviderName; readonly status: number }
	| { readonly _tag: "SearchProviderResponseTooLarge"; readonly provider: SearchProviderName; readonly maxBytes: number }
	| { readonly _tag: "SearchProviderProtocolInvalid"; readonly provider: SearchProviderName; readonly reason: string }
	| { readonly _tag: "SearchProviderReturnedError"; readonly provider: SearchProviderName; readonly safeMessage: string }
	| { readonly _tag: "SearchProviderNoRecognizedResults"; readonly provider: SearchProviderName }
	| { readonly _tag: "SearchProviderCancelled"; readonly provider: SearchProviderName; readonly cause?: unknown };

export interface SearchProvider {
	readonly name: SearchProviderName;

	search(
		input: SearchProviderRequest,
		options?: { readonly signal?: AbortSignal },
	): Promise<Result<readonly NormalizedSearchResult[], SearchProviderError>>;
}

export type SearchRequest = SearchProviderRequest;
