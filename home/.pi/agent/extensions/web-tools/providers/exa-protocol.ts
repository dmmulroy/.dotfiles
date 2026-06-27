import { err, ok, type Result } from "../result.ts";
import type { SearchDepth } from "../types.ts";
import type { SearchProviderRequest } from "./types.ts";

const DEFAULT_CONTEXT_MAX_CHARACTERS = 2_000;

export type ExaDepth = "auto" | "fast";

export interface ExaMcpRequestDto {
	readonly jsonrpc: "2.0";
	readonly id: 1;
	readonly method: "tools/call";
	readonly params: {
		readonly name: "web_search_exa";
		readonly arguments: {
			readonly query: string;
			readonly type: ExaDepth;
			readonly numResults: number;
			readonly livecrawl: "fallback";
			readonly contextMaxCharacters: number;
		};
	};
}

export type ExaProtocolMessage =
	| { readonly _tag: "Text"; readonly text: string }
	| { readonly _tag: "ProviderError"; readonly safeMessage: string };

export type ExaProtocolParseError =
	| { readonly _tag: "InvalidJson"; readonly source: "sse" | "json" }
	| { readonly _tag: "InvalidMcpPayload"; readonly reason: string }
	| { readonly _tag: "NoMcpMessages" };

/** Map public web-tools search depth to Exa's supported protocol depth. */
export function normalizeExaDepth(depth: SearchDepth): ExaDepth {
	return depth === "deep" ? "fast" : depth;
}

/** Encode an Exa MCP search request DTO. */
export function encodeExaSearchRequest(input: SearchProviderRequest): ExaMcpRequestDto {
	return {
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
	};
}

/** Parse Exa MCP JSON or SSE responses into safe protocol messages. */
export function parseExaMcpResponse(
	body: string,
	contentType: string,
): Result<readonly ExaProtocolMessage[], ExaProtocolParseError> {
	if (isSseResponse(body, contentType)) {
		return parseSseMcpResponse(body);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return err({ _tag: "InvalidJson", source: "json" });
	}

	const messages = parseMcpPayload(payload);
	if (messages._tag === "err") {
		return messages;
	}
	if (messages.value.length === 0) {
		return err({ _tag: "NoMcpMessages" });
	}
	return messages;
}

/** Extract data payloads from an SSE event stream. */
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

	return chunks.filter((chunk) => chunk.trim().length > 0);
}

function parseSseMcpResponse(body: string): Result<readonly ExaProtocolMessage[], ExaProtocolParseError> {
	const chunks = parseSseDataLines(body);
	const messages: ExaProtocolMessage[] = [];
	let sawInvalidJson = false;
	let firstPayloadError: ExaProtocolParseError | undefined;

	for (const chunk of chunks) {
		let payload: unknown;
		try {
			payload = JSON.parse(chunk);
		} catch {
			sawInvalidJson = true;
			continue;
		}

		const parsed = parseMcpPayload(payload);
		if (parsed._tag === "err") {
			firstPayloadError ??= parsed.error;
			continue;
		}
		messages.push(...parsed.value);
	}

	if (messages.length > 0) {
		return ok(messages);
	}
	if (sawInvalidJson) {
		return err({ _tag: "InvalidJson", source: "sse" });
	}
	if (firstPayloadError) {
		return err(firstPayloadError);
	}
	return err({ _tag: "NoMcpMessages" });
}

function parseMcpPayload(payload: unknown): Result<readonly ExaProtocolMessage[], ExaProtocolParseError> {
	if (!isRecord(payload)) {
		return err({ _tag: "InvalidMcpPayload", reason: "Expected an object payload" });
	}

	if (isRecord(payload["error"])) {
		return ok([{ _tag: "ProviderError", safeMessage: "Search provider returned an error" }]);
	}

	const result = payload["result"];
	if (!isRecord(result)) {
		return err({ _tag: "InvalidMcpPayload", reason: "Missing result object" });
	}

	const content = result["content"];
	if (!Array.isArray(content)) {
		return err({ _tag: "InvalidMcpPayload", reason: "Missing result.content array" });
	}

	if (result["isError"] === true) {
		return ok([{ _tag: "ProviderError", safeMessage: "Search provider returned an error" }]);
	}

	const messages: ExaProtocolMessage[] = [];
	for (const item of content) {
		if (!isRecord(item)) {
			continue;
		}
		if (item["type"] !== "text" || typeof item["text"] !== "string") {
			continue;
		}
		const text = item["text"].trim();
		if (text) {
			messages.push({ _tag: "Text", text });
		}
	}

	return ok(messages);
}

function isSseResponse(body: string, contentType: string): boolean {
	return contentType.toLowerCase().includes("text/event-stream") || /^data:/m.test(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
