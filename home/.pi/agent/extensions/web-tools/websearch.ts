import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createOperationSignal, isOperationTimeoutError } from "./network.ts";
import { FetchHttpTextClient, ExaSearchProvider } from "./providers/exa.ts";
import type { SearchProvider } from "./providers/types.ts";
import { appendExpandHint, appendExpandedPreview, getTextContent } from "./render.ts";
import { SearchWeb, type SearchWebError } from "./search-web.ts";
import { getWebToolsSettings, SEARCH_DEPTHS, type ToolInputParseError } from "./settings.ts";
import {
	TempFileToolOutputStore,
	formatSearchResults,
	projectSearchWebResultToPiToolResult,
	type PiToolResult,
	type ToolOutputStore,
	type ToolOutputStoreError,
	type WebSearchDetails,
} from "./tool-output.ts";
import { parseWebSearchToolParams } from "./websearch-input.ts";
import type { ParseSearchQueryError, SearchDepth, WebToolsSettings } from "./types.ts";

export { formatSearchResults };

export interface WebSearchToolComposition {
	readonly settings: WebToolsSettings;
	readonly searchWeb: SearchWeb;
	readonly outputStore: ToolOutputStore;
}

interface RenderTheme {
	fg(name: string, value: string): string;
	bold(value: string): string;
}

type WebSearchBoundaryError = ToolInputParseError | ParseSearchQueryError | SearchWebError | ToolOutputStoreError;

export function createWebSearchTool(composition?: WebSearchToolComposition) {
	return {
		name: "websearch",
		label: "Web Search",
		description: "Search the public web for current information and candidate URLs to inspect with webfetch.",
		promptSnippet: "Search the public web for current information and relevant URLs",
		promptGuidelines: [
			"Use websearch when the user needs current public-web information or when the right URL is not yet known.",
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
			params: unknown,
			signal?: AbortSignal,
			onUpdate?: (update: PiToolResult<WebSearchDetails>) => void,
		) {
			const actualComposition = composition ?? createDefaultWebSearchComposition();
			const parsed = parseWebSearchToolParams(params, actualComposition.settings.search);
			if (parsed._tag === "err") {
				throw toWebSearchToolError(parsed.error);
			}

			const composed = createOperationSignal(parsed.value.timeoutSeconds * 1000, signal);
			onUpdate?.({
				content: [textContent(`Searching for ${JSON.stringify(parsed.value.query)}...`)],
				details: {
					query: parsed.value.query,
					depth: parsed.value.depth,
					maxResults: parsed.value.maxResults,
					provider: actualComposition.settings.search.provider,
					resultCount: 0,
					results: [],
				},
			});

			try {
				const result = await actualComposition.searchWeb.search(
					{
						query: parsed.value.query,
						maxResults: parsed.value.maxResults,
						depth: parsed.value.depth,
					},
					{ signal: composed.signal },
				);
				if (result._tag === "err") {
					throw toWebSearchBoundaryError(result.error, parsed.value.timeoutSeconds, signal, composed.signal);
				}

				const projected = await projectSearchWebResultToPiToolResult(result.value, actualComposition.outputStore);
				if (projected._tag === "err") {
					throw toWebSearchBoundaryError(projected.error, parsed.value.timeoutSeconds, signal, composed.signal);
				}

				return projected.value;
			} finally {
				composed.cleanup();
			}
		},

		renderCall(args: { query: string; depth?: SearchDepth; maxResults?: number }, theme: RenderTheme) {
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
			theme: RenderTheme,
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

export function toWebSearchToolError(error: WebSearchBoundaryError): Error {
	return new Error(renderSafeWebSearchError(error));
}

function createDefaultWebSearchComposition(): WebSearchToolComposition {
	const settings = getWebToolsSettings();
	const provider = createSearchProvider(settings.search);
	return {
		settings,
		searchWeb: new SearchWeb({ provider, settings: settings.search }),
		outputStore: new TempFileToolOutputStore(),
	};
}

function createSearchProvider(settings: WebToolsSettings["search"]): SearchProvider {
	switch (settings.provider) {
		case "exa":
			return new ExaSearchProvider(settings.endpoint, new FetchHttpTextClient());
	}
}

function toWebSearchBoundaryError(
	error: WebSearchBoundaryError,
	timeoutSeconds: number,
	outerSignal: AbortSignal | undefined,
	operationSignal: AbortSignal,
): Error {
	if (outerSignal?.aborted) {
		return new Error("Web search cancelled");
	}
	if (isOperationTimeoutError(operationSignal.reason)) {
		return new Error(`Web search timed out after ${timeoutSeconds}s`);
	}
	return toWebSearchToolError(error);
}

function renderSafeWebSearchError(error: WebSearchBoundaryError): string {
	switch (error._tag) {
		case "InvalidToolInput":
			return error.message;
		case "InvalidToolField":
			return `${error.field}: ${error.message}`;
		case "UnknownToolField":
			return `Unknown websearch field: ${error.field}`;
		case "EmptySearchQuery":
			return "Search query cannot be empty";
		case "SearchDisabled":
			return "websearch is disabled in web-tools settings. Enable it to use this tool.";
		case "SearchProviderUnavailable":
			return "Search provider unavailable";
		case "SearchProviderStatusRejected":
			return `Search request failed (${error.status})`;
		case "SearchProviderResponseTooLarge":
			return `Search response too large (${Math.floor(error.maxBytes / (1024 * 1024))}MB limit)`;
		case "SearchProviderProtocolInvalid":
			return "Search provider returned an invalid response";
		case "SearchProviderReturnedError":
			return error.safeMessage;
		case "SearchProviderNoRecognizedResults":
			return "Search provider returned an unrecognized response format";
		case "SearchProviderCancelled":
			return "Web search cancelled";
		case "TempFileWriteFailed":
			return "Failed to write full websearch output";
	}
}

function textContent(text: string) {
	return { type: "text" as const, text };
}
