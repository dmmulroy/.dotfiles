import { StringEnum, type TextContent } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { createOperationSignal, isAbortError } from "./network.ts";
import { ExaSearchProvider } from "./providers/exa.ts";
import type { SearchProvider } from "./providers/types.ts";
import { appendExpandHint, appendExpandedPreview, getTextContent } from "./render.ts";
import { getWebToolsSettings } from "./settings.ts";
import { truncateTextOutput } from "./truncation.ts";
import type { NormalizedSearchResult, SearchDepth, WebSearchDetails } from "./types.ts";

const SEARCH_DEPTHS = ["auto", "fast", "deep"] as const;

export function createWebSearchTool() {
	return {
		name: "websearch",
		label: "Web Search",
		description: "Search the public web for current information and candidate URLs to inspect with webfetch.",
		promptSnippet: "Search the public web for current information and relevant URLs",
		promptGuidelines: [
			"Use this tool when the user needs current public-web information or when the right URL is not yet known.",
			"After picking a promising result, use webfetch on that URL for deeper inspection.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query." }),
			maxResults: Type.Optional(
				Type.Number({
					description: "Maximum number of results to return. Overrides the web-tools search default max results setting.",
				}),
			),
			depth: Type.Optional(
				StringEnum([...SEARCH_DEPTHS], {
					description:
						"Search depth. Overrides the web-tools search default depth setting. 'deep' is accepted as a compatibility alias and mapped to 'fast' for the current Exa provider.",
				}),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { query: string; maxResults?: number; depth?: SearchDepth },
			signal?: AbortSignal,
			onUpdate?: (...args: any[]) => void,
		) {
			const settings = getWebToolsSettings();
			if (!settings.search.enabled) {
				throw new Error("websearch is disabled in web-tools settings. Enable it to use this tool.");
			}

			const query = params.query.trim();
			if (!query) {
				throw new Error("Search query cannot be empty");
			}

			const maxResults = clampMaxResults(params.maxResults ?? settings.search.defaultMaxResults);
			const depth = params.depth ?? settings.search.defaultDepth;
			const timeoutSeconds = clampTimeoutSeconds(settings.search.timeoutSeconds);
			const composed = createOperationSignal(timeoutSeconds * 1000, signal);

			onUpdate?.({
				content: [textContent(`Searching for ${JSON.stringify(query)}...`)],
				details: {
					query,
					depth,
					maxResults,
					provider: settings.search.provider,
					resultCount: 0,
					results: [],
				},
			});

			try {
				const provider = createProvider();
				const results = await provider.search({ query, maxResults, depth }, composed.signal);
				const output = formatSearchResults(query, results);
				const truncated = await truncateTextOutput(output, {
					tempPrefix: "pi-websearch-",
					fileName: "output.txt",
				});

				const details: WebSearchDetails = {
					query,
					depth,
					maxResults,
					provider: provider.name,
					resultCount: results.length,
					truncated: truncated.truncated,
					fullOutputPath: truncated.fullOutputPath,
					results,
				};

				return {
					content: [textContent(truncated.text)],
					details,
				};
			} catch (error) {
				if (signal?.aborted) {
					throw new Error("Web search cancelled");
				}
				if (isAbortError(error) || composed.signal.aborted) {
					throw new Error(`Web search timed out after ${timeoutSeconds}s`);
				}
				throw error instanceof Error ? error : new Error(String(error));
			} finally {
				composed.cleanup();
			}
		},

		renderCall(args: { query: string; depth?: SearchDepth; maxResults?: number }, theme: any) {
			let text = theme.fg("toolTitle", theme.bold("websearch "));
			text += theme.fg("accent", JSON.stringify(String(args.query)));
			if (args.depth && args.depth !== "auto") {
				text += theme.fg("muted", ` (${args.depth})`);
			}
			if (args.maxResults) {
				text += theme.fg("dim", ` limit=${args.maxResults}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(
			result: { content: Array<{ type: string; text?: string }>; details?: WebSearchDetails; isError?: boolean },
			options: { expanded: boolean; isPartial: boolean },
			theme: any,
		) {
			if (options.isPartial) {
				return new Text(theme.fg("warning", "Searching..."), 0, 0);
			}
			if (result.isError) {
				return new Text(theme.fg("error", `✗ ${getTextContent(result.content) || "Search failed"}`), 0, 0);
			}

			const details = result.details;
			let text = theme.fg("success", `✓ ${details?.resultCount ?? 0} results`);
			if (details?.provider) {
				text += theme.fg("muted", ` (${details.provider})`);
			}
			if (details?.truncated) {
				text += theme.fg("warning", " [truncated]");
			}
			text = appendExpandHint(text, options.expanded);

			if (options.expanded) {
				text = appendExpandedPreview(text, getTextContent(result.content), theme, { maxLines: 16, maxColumns: 220 });
				if (details?.fullOutputPath) {
					text += `\n${theme.fg("dim", `Full output: ${details.fullOutputPath}`)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	};
}

export function formatSearchResults(query: string, results: NormalizedSearchResult[]): string {
	if (results.length === 0) {
		return `Search results for: ${query}\n\nNo results found.`;
	}

	const lines = [`Search results for: ${query}`, ""];
	for (const [index, result] of results.entries()) {
		lines.push(`${index + 1}. ${result.title}`);
		lines.push(`   URL: ${result.url}`);
		if (result.publishedAt) {
			lines.push(`   Published: ${result.publishedAt}`);
		}
		if (result.source) {
			lines.push(`   Source: ${result.source}`);
		}
		if (typeof result.score === "number") {
			lines.push(`   Score: ${result.score}`);
		}
		if (result.snippet) {
			lines.push(`   Snippet: ${result.snippet}`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

function createProvider(): SearchProvider {
	const settings = getWebToolsSettings();
	switch (settings.search.provider) {
		case "exa":
			return new ExaSearchProvider(settings.search.endpoint);
	}
}

function clampMaxResults(value: number): number {
	if (!Number.isFinite(value)) return 8;
	return Math.max(1, Math.min(20, Math.round(value)));
}

function clampTimeoutSeconds(timeout: number): number {
	if (!Number.isFinite(timeout)) return 25;
	return Math.max(1, Math.min(120, Math.round(timeout)));
}

function textContent(text: string): TextContent {
	return { type: "text", text };
}
