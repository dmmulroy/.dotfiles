import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const SEARCH_TIMEOUT_MS = 25_000;
const FALLBACK_NO_RESULTS = "No search results found. Please try a different query.";

const WebSearchParamsSchema = Type.Object({
	query: Type.String({ description: "Search query" }),
	numResults: Type.Optional(
		Type.Integer({ minimum: 1, maximum: 25, description: "Number of results to return (default: 8)" }),
	),
	livecrawl: Type.Optional(
		StringEnum(["fallback", "preferred"] as const, {
			description: "Live crawl behavior (default: fallback)",
		}),
	),
	type: Type.Optional(
		StringEnum(["auto", "fast", "deep"] as const, {
			description: "Search depth/type (default: auto)",
		}),
	),
	contextMaxCharacters: Type.Optional(
		Type.Integer({
			minimum: 1_000,
			maximum: 100_000,
			description: "Max characters of context to retrieve (default: 10000)",
		}),
	),
});

type WebSearchParams = Static<typeof WebSearchParamsSchema>;
type LivecrawlMode = "fallback" | "preferred";
type SearchType = "auto" | "fast" | "deep";

interface ExaSearchArguments {
	query: string;
	type: SearchType;
	numResults: number;
	livecrawl: LivecrawlMode;
	contextMaxCharacters: number;
}

interface WebSearchDetails {
	query: string;
	type: SearchType;
	numResults: number;
	livecrawl: LivecrawlMode;
	contextMaxCharacters: number;
	endpoint: string;
	timeoutMs: number;
	statusCode?: number;
	responseBytes?: number;
	truncated?: boolean;
	fullOutputPath?: string;
}

function getSearchArguments(params: WebSearchParams): ExaSearchArguments {
	return {
		query: params.query,
		type: params.type ?? "auto",
		numResults: params.numResults ?? 8,
		livecrawl: params.livecrawl ?? "fallback",
		contextMaxCharacters: params.contextMaxCharacters ?? 10_000,
	};
}

function extractTextFromJsonRpcPayload(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const candidate = (payload as any)?.result?.content?.[0]?.text;
	if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
	return undefined;
}

function parseExaResponse(responseText: string): string {
	for (const line of responseText.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) continue;

		const data = trimmed.slice(5).trim();
		if (!data || data === "[DONE]") continue;

		try {
			const parsed = JSON.parse(data);
			const extracted = extractTextFromJsonRpcPayload(parsed);
			if (extracted) return extracted;
		} catch {
			// Ignore malformed SSE data lines and continue scanning.
		}
	}

	try {
		const parsed = JSON.parse(responseText);
		const extracted = extractTextFromJsonRpcPayload(parsed);
		if (extracted) return extracted;
	} catch {
		// Ignore non-JSON response and fall back.
	}

	return FALLBACK_NO_RESULTS;
}

export default function (pi: ExtensionAPI) {
	const currentYear = new Date().getFullYear();

	pi.registerTool({
		name: "websearch",
		label: "Web Search",
		description:
			`Search the web via Exa MCP (no API key required). ` +
			`Use for current events, external docs, and facts outside the local repo. ` +
			`For recency-sensitive queries, include the current year (${currentYear}) in the query. ` +
			`Results are truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: WebSearchParamsSchema,

		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			const search = getSearchArguments(params as WebSearchParams);

			onUpdate?.({
				content: [{ type: "text", text: "Searching web..." }],
				details: { phase: "requesting" },
			});

			const timeoutSignal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
			const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

			const rpcBody = {
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "web_search_exa",
					arguments: search,
				},
			};

			const details: WebSearchDetails = {
				query: search.query,
				type: search.type,
				numResults: search.numResults,
				livecrawl: search.livecrawl,
				contextMaxCharacters: search.contextMaxCharacters,
				endpoint: EXA_MCP_URL,
				timeoutMs: SEARCH_TIMEOUT_MS,
			};

			let responseText = "";
			try {
				const response = await fetch(EXA_MCP_URL, {
					method: "POST",
					headers: {
						accept: "application/json, text/event-stream",
						"content-type": "application/json",
					},
					body: JSON.stringify(rpcBody),
					signal: requestSignal,
				});

				details.statusCode = response.status;
				responseText = await response.text();
				details.responseBytes = Buffer.byteLength(responseText, "utf8");

				if (!response.ok) {
					throw new Error(`Search error (${response.status}): ${responseText}`);
				}
			} catch (error) {
				if (timeoutSignal.aborted) {
					throw new Error("Search request timed out");
				}
				if (signal?.aborted) {
					throw new Error("Search request cancelled");
				}
				throw error;
			}

			let output = parseExaResponse(responseText);
			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			if (truncation.truncated) {
				const tempDir = mkdtempSync(join(tmpdir(), "pi-websearch-"));
				const tempFile = join(tempDir, "full-output.txt");
				writeFileSync(tempFile, output, "utf8");

				details.truncated = true;
				details.fullOutputPath = tempFile;

				output =
					truncation.content +
					`\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines ` +
					`(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ` +
					`Full output saved to: ${tempFile}]`;
			}

			return {
				content: [{ type: "text", text: output }],
				details,
			};
		},
	});
}
