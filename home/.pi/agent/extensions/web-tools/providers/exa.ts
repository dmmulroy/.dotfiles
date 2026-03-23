import { decodeTextBuffer, parseContentType, readBodyWithLimit } from "../network.ts";
import type { NormalizedSearchResult } from "../types.ts";
import type { SearchProvider, SearchRequest } from "./types.ts";

const DEFAULT_CONTEXT_MAX_CHARACTERS = 2_000;
const MAX_SEARCH_RESPONSE_BYTES = 1 * 1024 * 1024;

type ExaEventPayload = {
	result?: {
		content?: Array<{
			type?: string;
			text?: string;
		}>;
		isError?: boolean;
	};
};

type ExaMessage = {
	text: string;
	isError: boolean;
};

export class ExaSearchProvider implements SearchProvider {
	readonly name = "exa" as const;

	constructor(private readonly endpoint: string) {}

	async search(input: SearchRequest, signal?: AbortSignal): Promise<NormalizedSearchResult[]> {
		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: {
				accept: "application/json, text/event-stream",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "web_search_exa",
					arguments: {
						query: input.query,
						type: normalizeExaDepth(input.depth),
						numResults: input.maxResults,
						livecrawl: "fallback",
						contextMaxCharacters: DEFAULT_CONTEXT_MAX_CHARACTERS,
					},
				},
			}),
			signal,
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Search request failed (${response.status}): ${body || response.statusText}`);
		}

		const contentLength = response.headers.get("content-length");
		if (contentLength) {
			const declaredBytes = Number.parseInt(contentLength, 10);
			if (Number.isFinite(declaredBytes) && declaredBytes > MAX_SEARCH_RESPONSE_BYTES) {
				throw new Error(`Search response too large (exceeds ${Math.floor(MAX_SEARCH_RESPONSE_BYTES / (1024 * 1024))}MB limit)`);
			}
		}

		const parsedContentType = parseContentType(response.headers.get("content-type"));
		const { buffer } = await readBodyWithLimit(response, MAX_SEARCH_RESPONSE_BYTES, signal);
		const { text: responseText } = decodeTextBuffer(buffer, parsedContentType.charset);
		const contentType = parsedContentType.contentType || parsedContentType.mime;
		const providerError = extractSearchErrorFromResponse(responseText, contentType);
		if (providerError) {
			throw new Error(providerError);
		}

		const searchText = extractSearchTextFromResponse(responseText, contentType);
		const results = parseExaSearchText(searchText);

		if (results.length === 0 && !isExplicitNoResultsText(searchText)) {
			throw new Error("Search provider returned an unrecognized response format");
		}

		return results.slice(0, input.maxResults);
	}
}

export function normalizeExaDepth(depth: SearchRequest["depth"]): Exclude<SearchRequest["depth"], "deep"> {
	// Exa MCP currently accepts only "auto" and "fast". Keep "deep" as a caller-facing
	// compatibility alias so existing prompts and docs continue to work.
	return depth === "deep" ? "fast" : depth;
}

export function extractSearchTextFromResponse(body: string, contentType: string): string {
	return extractSearchMessagesFromResponse(body, contentType)
		.filter((message) => !message.isError)
		.map((message) => message.text)
		.join("\n\n")
		.trim();
}

export function extractSearchErrorFromResponse(body: string, contentType: string): string | undefined {
	const text = extractSearchMessagesFromResponse(body, contentType)
		.filter((message) => message.isError)
		.map((message) => message.text)
		.join("\n\n")
		.trim();
	return text || undefined;
}

function extractSearchMessagesFromResponse(body: string, contentType: string): ExaMessage[] {
	const normalizedContentType = contentType.toLowerCase();
	if (normalizedContentType.includes("text/event-stream") || body.includes("\ndata:")) {
		const chunks = parseSseDataLines(body);
		return chunks.flatMap((chunk) => {
			try {
				return payloadToMessages(JSON.parse(chunk) as ExaEventPayload);
			} catch {
				return [];
			}
		});
	}

	try {
		return payloadToMessages(JSON.parse(body) as ExaEventPayload);
	} catch {
		const text = body.trim();
		return text ? [{ text, isError: false }] : [];
	}
}

function payloadToMessages(payload: ExaEventPayload): ExaMessage[] {
	const isError = Boolean(payload.result?.isError);
	return (payload.result?.content ?? [])
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text?.trim() ?? "")
		.filter(Boolean)
		.map((text) => ({ text, isError }));
}

export function parseSseDataLines(input: string): string[] {
	const lines = input.replace(/\r\n/g, "\n").split("\n");
	const chunks: string[] = [];
	let current: string[] = [];

	for (const line of lines) {
		if (line.startsWith("data:")) {
			current.push(line.slice(5).trim());
			continue;
		}
		if (!line.trim() && current.length > 0) {
			chunks.push(current.join("\n"));
			current = [];
		}
	}

	if (current.length > 0) {
		chunks.push(current.join("\n"));
	}

	return chunks.filter(Boolean);
}

export function parseExaSearchText(input: string): NormalizedSearchResult[] {
	const trimmed = input.replace(/\r\n/g, "\n").trim();
	if (!trimmed) return [];

	const sections = splitSearchSections(trimmed);
	return sections
		.map(parseSearchSection)
		.filter((result): result is NormalizedSearchResult => Boolean(result && result.url));
}

function splitSearchSections(input: string): string[] {
	const lines = input.split("\n");
	const sections: string[] = [];
	let current: string[] = [];
	let sawUrlOrText = false;

	for (const line of lines) {
		if (line.startsWith("Title: ") && current.length > 0 && sawUrlOrText) {
			sections.push(current.join("\n").trim());
			current = [line];
			sawUrlOrText = false;
			continue;
		}
		if (line.startsWith("URL: ") || line.startsWith("Text:") || line.startsWith("Highlights:")) {
			sawUrlOrText = true;
		}
		current.push(line);
	}

	if (current.length > 0) {
		sections.push(current.join("\n").trim());
	}

	return sections.filter(Boolean);
}

function parseSearchSection(section: string): NormalizedSearchResult | undefined {
	const lines = section.split("\n");
	let title = "";
	let url = "";
	let publishedAt: string | undefined;
	let source: string | undefined;
	let score: number | undefined;
	const snippetLines: string[] = [];
	let inText = false;

	for (const line of lines) {
		if (!inText && line.startsWith("Title: ")) {
			title = line.slice("Title: ".length).trim();
			continue;
		}
		if (!inText && line.startsWith("URL: ")) {
			url = line.slice("URL: ".length).trim();
			continue;
		}
		if (!inText && line.startsWith("Published Date: ")) {
			publishedAt = normalizeMetadataValue(line.slice("Published Date: ".length));
			continue;
		}
		if (!inText && line.startsWith("Published: ")) {
			publishedAt = normalizeMetadataValue(line.slice("Published: ".length));
			continue;
		}
		if (!inText && line.startsWith("Source: ")) {
			source = normalizeMetadataValue(line.slice("Source: ".length));
			continue;
		}
		if (!inText && line.startsWith("Author: ") && !source) {
			source = normalizeMetadataValue(line.slice("Author: ".length));
			continue;
		}
		if (!inText && line.startsWith("Score: ")) {
			const parsedScore = Number.parseFloat(line.slice("Score: ".length).trim());
			if (Number.isFinite(parsedScore)) score = parsedScore;
			continue;
		}
		if (!inText && line.startsWith("Text:")) {
			inText = true;
			snippetLines.push(line.slice("Text:".length).trim());
			continue;
		}
		if (!inText && line.startsWith("Highlights:")) {
			inText = true;
			snippetLines.push(line.slice("Highlights:".length).trim());
			continue;
		}
		if (inText) {
			snippetLines.push(line);
		}
	}

	if (!url) return undefined;

	return {
		title: title || url,
		url,
		snippet: summarizeSnippet(snippetLines.join("\n"), title),
		publishedAt,
		source,
		score,
	};
}

function summarizeSnippet(text: string, title: string): string | undefined {
	const collapsed = text
		.replace(/\r\n/g, "\n")
		.replace(/^\s*---+\s*$/gm, "")
		.replace(/^#+\s+/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]+/g, " ")
		.trim();
	if (!collapsed) return undefined;

	let snippet = collapsed;
	if (title) {
		snippet = stripRepeatedLeadingTitle(snippet, title);
	}
	if (!snippet) snippet = collapsed;
	if (snippet.length <= 280) return snippet;
	return `${snippet.slice(0, 277).trimEnd()}...`;
}

function stripRepeatedLeadingTitle(snippet: string, title: string): string {
	const normalizedTitle = title.trim().toLowerCase();
	let current = snippet.trim();
	while (current) {
		const lines = current.split("\n");
		const firstIndex = lines.findIndex((line) => line.trim().length > 0);
		if (firstIndex === -1) return current.trim();
		if (lines[firstIndex]?.trim().toLowerCase() !== normalizedTitle) {
			return current.trim();
		}
		current = lines.slice(firstIndex + 1).join("\n").trim();
	}
	return current.trim();
}

function normalizeMetadataValue(value: string): string | undefined {
	const normalized = value.trim();
	if (!normalized) return undefined;

	const lowered = normalized.toLowerCase();
	if (["n/a", "na", "none", "null", "undefined", "unknown"].includes(lowered)) {
		return undefined;
	}

	return normalized;
}

function isExplicitNoResultsText(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	if (!normalized) return true;
	return normalized === "no results found" || normalized.startsWith("no results found") || normalized.includes("no relevant results");
}
