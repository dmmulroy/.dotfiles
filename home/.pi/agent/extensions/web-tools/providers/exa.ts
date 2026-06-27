import { decodeTextBuffer, isAbortError, parseContentType, readBodyWithLimit } from "../network.ts";
import { err, ok, type Result } from "../result.ts";
import type { PublicHttpUrl } from "../types.ts";
import {
	encodeExaSearchRequest,
	normalizeExaDepth,
	parseExaMcpResponse,
	parseSseDataLines,
	type ExaProtocolParseError,
} from "./exa-protocol.ts";
import { parseExaSearchText } from "./exa-results.ts";
import type { NormalizedSearchResult, SearchProvider, SearchProviderError, SearchProviderRequest } from "./types.ts";

export const MAX_SEARCH_RESPONSE_BYTES = 1 * 1024 * 1024;

export interface HttpJsonRequest {
	readonly url: PublicHttpUrl;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: unknown;
	readonly maxResponseBytes: number;
}

export interface HttpTextResponse {
	readonly status: number;
	readonly statusText: string;
	readonly headers: Headers;
	readonly bodyText: string;
	readonly bytes: number;
}

export type HttpClientError =
	| { readonly _tag: "HttpRequestFailed"; readonly cause: unknown }
	| { readonly _tag: "HttpResponseTooLarge"; readonly maxBytes: number }
	| { readonly _tag: "HttpCancelled"; readonly cause?: unknown };

export interface HttpTextClient {
	postJson(
		request: HttpJsonRequest,
		options?: { readonly signal?: AbortSignal },
	): Promise<Result<HttpTextResponse, HttpClientError>>;
}

export class FetchHttpTextClient implements HttpTextClient {
	/** Post a JSON request and return bounded response text. */
	async postJson(
		request: HttpJsonRequest,
		options: { readonly signal?: AbortSignal } = {},
	): Promise<Result<HttpTextResponse, HttpClientError>> {
		try {
			const response = await fetch(request.url, {
				method: "POST",
				headers: request.headers,
				body: JSON.stringify(request.body),
				signal: options.signal,
			});

			const contentLength = response.headers.get("content-length");
			if (contentLength) {
				const declaredBytes = Number.parseInt(contentLength, 10);
				if (Number.isFinite(declaredBytes) && declaredBytes > request.maxResponseBytes) {
					await response.body?.cancel().catch(() => undefined);
					return err({ _tag: "HttpResponseTooLarge", maxBytes: request.maxResponseBytes });
				}
			}

			const parsedContentType = parseContentType(response.headers.get("content-type"));
			const body = await readBodyWithLimit(response, request.maxResponseBytes, options.signal);
			const decoded = decodeTextBuffer(body.buffer, parsedContentType.charset);

			return ok({
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
				bodyText: decoded.text,
				bytes: body.bytes,
			});
		} catch (cause: unknown) {
			if (options.signal?.aborted || isAbortError(cause)) {
				return err({ _tag: "HttpCancelled", cause });
			}
			if (isResponseTooLargeCause(cause)) {
				return err({ _tag: "HttpResponseTooLarge", maxBytes: request.maxResponseBytes });
			}
			return err({ _tag: "HttpRequestFailed", cause });
		}
	}
}

export class ExaSearchProvider implements SearchProvider {
	readonly name = "exa" as const;

	constructor(
		private readonly endpoint: PublicHttpUrl,
		private readonly http: HttpTextClient,
	) {}

	/** Search Exa through its MCP endpoint and return normalized public-web results. */
	async search(
		input: SearchProviderRequest,
		options: { readonly signal?: AbortSignal } = {},
	): Promise<Result<readonly NormalizedSearchResult[], SearchProviderError>> {
		const response = await this.http.postJson(
			{
				url: this.endpoint,
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				body: encodeExaSearchRequest(input),
				maxResponseBytes: MAX_SEARCH_RESPONSE_BYTES,
			},
			{ signal: options.signal },
		);

		if (response._tag === "err") {
			return err(mapHttpClientError(response.error));
		}

		if (response.value.status < 200 || response.value.status >= 300) {
			return err({ _tag: "SearchProviderStatusRejected", provider: this.name, status: response.value.status });
		}

		const contentType = response.value.headers.get("content-type") ?? "";
		const protocol = parseExaMcpResponse(response.value.bodyText, contentType);
		if (protocol._tag === "err") {
			return err({ _tag: "SearchProviderProtocolInvalid", provider: this.name, reason: renderProtocolReason(protocol.error) });
		}

		const providerError = protocol.value.find((message) => message._tag === "ProviderError");
		if (providerError?._tag === "ProviderError") {
			return err({ _tag: "SearchProviderReturnedError", provider: this.name, safeMessage: providerError.safeMessage });
		}

		const searchText = protocol.value
			.filter((message) => message._tag === "Text")
			.map((message) => message.text)
			.join("\n\n")
			.trim();
		const parsedResults = parseExaSearchText(searchText);

		if (parsedResults.results.length === 0 && !parsedResults.explicitNoResults) {
			return err({ _tag: "SearchProviderNoRecognizedResults", provider: this.name });
		}

		return ok(parsedResults.results.slice(0, input.maxResults));
	}
}

export { normalizeExaDepth, parseSseDataLines };

/** Compatibility helper for extracting text messages from an Exa MCP response. */
export function extractSearchTextFromResponse(body: string, contentType: string): string {
	const parsed = parseExaMcpResponse(body, contentType);
	if (parsed._tag === "err") {
		return "";
	}
	return parsed.value
		.filter((message) => message._tag === "Text")
		.map((message) => message.text)
		.join("\n\n")
		.trim();
}

/** Compatibility helper for detecting safe provider-side MCP errors. */
export function extractSearchErrorFromResponse(body: string, contentType: string): string | undefined {
	const parsed = parseExaMcpResponse(body, contentType);
	if (parsed._tag === "err") {
		return undefined;
	}
	const providerError = parsed.value.find((message) => message._tag === "ProviderError");
	return providerError?._tag === "ProviderError" ? providerError.safeMessage : undefined;
}

export { parseExaSearchText };

function mapHttpClientError(error: HttpClientError): SearchProviderError {
	switch (error._tag) {
		case "HttpRequestFailed":
			return { _tag: "SearchProviderUnavailable", provider: "exa", cause: error.cause };
		case "HttpResponseTooLarge":
			return { _tag: "SearchProviderResponseTooLarge", provider: "exa", maxBytes: error.maxBytes };
		case "HttpCancelled":
			return { _tag: "SearchProviderCancelled", provider: "exa", cause: error.cause };
	}
}

function renderProtocolReason(error: ExaProtocolParseError): string {
	switch (error._tag) {
		case "InvalidJson":
			return `Invalid JSON ${error.source} payload`;
		case "InvalidMcpPayload":
			return error.reason;
		case "NoMcpMessages":
			return "No MCP messages";
	}
}

function isResponseTooLargeCause(cause: unknown): boolean {
	return cause instanceof Error && cause.message.startsWith("Response too large");
}
