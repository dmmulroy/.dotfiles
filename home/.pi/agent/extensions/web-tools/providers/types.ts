import type { NormalizedSearchResult, SearchDepth, SearchProviderName } from "../types.ts";

export interface SearchRequest {
	query: string;
	maxResults: number;
	depth: SearchDepth;
}

export interface SearchProvider {
	readonly name: SearchProviderName;
	search(input: SearchRequest, signal?: AbortSignal): Promise<NormalizedSearchResult[]>;
}
