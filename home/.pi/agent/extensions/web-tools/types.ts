export const WEB_TOOLS_EXTENSION_NAME = "web-tools";

export type WebFetchFormat = "markdown" | "text" | "html";
export type SearchDepth = "auto" | "fast" | "deep";
export type SearchProviderName = "exa";
export type ContentKind = "html" | "text" | "raster-image" | "svg" | "binary";

export interface WebToolsSettings {
	fetch: {
		defaultFormat: WebFetchFormat;
		timeoutSeconds: number;
		maxResponseBytes: number;
		blockPrivateHosts: boolean;
		maxRedirects: number;
		fallbackUserAgent: string;
	};
	search: {
		enabled: boolean;
		provider: SearchProviderName;
		endpoint: string;
		timeoutSeconds: number;
		defaultMaxResults: number;
		defaultDepth: SearchDepth;
	};
}

export interface ParsedContentType {
	contentType: string;
	mime: string;
	charset?: string;
	kind: ContentKind;
}

export interface WebFetchDetails {
	requestedUrl: string;
	finalUrl: string;
	format: WebFetchFormat;
	status: number;
	mime: string;
	contentType: string;
	charset?: string;
	decoder?: string;
	bytes: number;
	image?: boolean;
	truncated?: boolean;
	fullOutputPath?: string;
}

export interface NormalizedSearchResult {
	title: string;
	url: string;
	snippet?: string;
	publishedAt?: string;
	source?: string;
	score?: number;
}

export interface WebSearchDetails {
	query: string;
	depth: SearchDepth;
	maxResults: number;
	provider: SearchProviderName;
	resultCount: number;
	truncated?: boolean;
	fullOutputPath?: string;
	results: NormalizedSearchResult[];
}
