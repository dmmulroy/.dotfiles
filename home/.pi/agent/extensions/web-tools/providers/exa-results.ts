import { parsePublicHttpUrl } from "../types.ts";
import type { NormalizedSearchResult } from "./types.ts";

export type ExaResultsParseError =
	| { readonly _tag: "NoRecognizedResults" }
	| { readonly _tag: "MalformedResultSection"; readonly reason: string };

export interface ParseExaSearchTextResult {
	readonly results: readonly NormalizedSearchResult[];
	readonly discardedSections: number;
	readonly explicitNoResults: boolean;
}

/** Parse Exa's untrusted text search-result format into normalized results. */
export function parseExaSearchText(input: string): ParseExaSearchTextResult {
	const trimmed = input.replace(/\r\n/g, "\n").trim();
	if (!trimmed) {
		return { results: [], discardedSections: 0, explicitNoResults: true };
	}

	const explicitNoResults = isExplicitNoResultsText(trimmed);
	if (explicitNoResults) {
		return { results: [], discardedSections: 0, explicitNoResults };
	}

	const sections = splitSearchSections(trimmed);
	const results: NormalizedSearchResult[] = [];
	let discardedSections = 0;

	for (const section of sections) {
		const parsed = parseSearchSection(section);
		if (!parsed) {
			discardedSections += 1;
			continue;
		}
		results.push(parsed);
	}

	return { results, discardedSections, explicitNoResults };
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

	return sections.filter((section) => section.length > 0);
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

	if (!url) {
		return undefined;
	}

	const parsedUrl = parsePublicHttpUrl(url);
	if (parsedUrl._tag === "err") {
		return undefined;
	}

	return {
		title: title || parsedUrl.value,
		url: parsedUrl.value,
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
