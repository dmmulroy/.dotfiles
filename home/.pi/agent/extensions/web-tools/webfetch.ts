import { formatSize } from "@mariozechner/pi-coding-agent";
import { StringEnum, type ImageContent, type TextContent } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { htmlToMarkdown, htmlToText, isPoorMarkdownConversion } from "./html.ts";
import {
	createOperationSignal,
	decodeTextBuffer,
	fetchWithRedirects as defaultFetchWithRedirects,
	isAbortError,
	normalizeAndValidateUrl,
	parseContentType,
	readBodyWithLimit,
} from "./network.ts";
import { mergeCookieHeader, type ResolveRequestAuthOptions, type ResolvedRequestAuth } from "./auth.ts";
import { appendExpandHint, appendExpandedPreview, getTextContent } from "./render.ts";
import { getWebToolsSettings } from "./settings.ts";
import { truncateTextOutput } from "./truncation.ts";
import type { WebFetchDetails, WebFetchFormat } from "./types.ts";

export interface WebFetchToolOptions {
	resolveAuth?: (url: URL, options?: ResolveRequestAuthOptions, signal?: AbortSignal) => Promise<ResolvedRequestAuth>;
	fetchWithRedirects?: typeof defaultFetchWithRedirects;
}

const WEBFETCH_FORMATS = ["text", "markdown", "html"] as const;
export const OPENCODE_WEBFETCH_DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
export const OPENCODE_WEBFETCH_FALLBACK_USER_AGENT = "opencode";

export function createWebFetchTool(options: WebFetchToolOptions = {}) {
	return {
		name: "webfetch",
		label: "Web Fetch",
		description:
			"Fetch a single URL and return readable markdown, text, raw HTML/source, or an inline raster image.",
		promptSnippet: "Fetch one public URL as markdown, text, html, or an inline raster image",
		promptGuidelines: [
			"Use this tool when the user provides a URL or after websearch identifies a page to inspect.",
			"Prefer format=markdown unless the user explicitly wants plain text or raw source.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "The http:// or https:// URL to fetch." }),
			format: Type.Optional(
				StringEnum([...WEBFETCH_FORMATS], {
					description: "Return format. Defaults to the web-tools fetch default format setting.",
				}),
			),
			timeout: Type.Optional(
				Type.Number({
					description: "Optional timeout in seconds. Overrides the web-tools fetch timeout setting.",
				}),
			),
		}),

		async execute(_toolCallId: string, params: { url: string; format?: WebFetchFormat; timeout?: number }, signal?: AbortSignal, onUpdate?: (...args: any[]) => void) {
			const settings = getWebToolsSettings();
			const requestedUrl = normalizeAndValidateUrl(params.url);
			const resolveAuth = options.resolveAuth;
			const fetchWithRedirects = options.fetchWithRedirects ?? defaultFetchWithRedirects;
			const format = params.format ?? settings.fetch.defaultFormat;
			const timeoutSeconds = clampTimeoutSeconds(params.timeout ?? settings.fetch.timeoutSeconds);
			const composed = createOperationSignal(timeoutSeconds * 1000, signal);

			onUpdate?.({
				content: [textContent(`Fetching ${requestedUrl.toString()}...`)],
				details: {
					requestedUrl: requestedUrl.toString(),
					finalUrl: requestedUrl.toString(),
					format,
					status: 0,
					mime: "",
					contentType: "",
					bytes: 0,
				},
			});

			try {
				const accept = getAcceptHeader(format);
				let auth: ResolvedRequestAuth = { context: { identity: "public", strategy: "none", cookieCount: 0 } };
				const attemptDebug: string[] = [];
				const authCache = new Map<string, Promise<ResolvedRequestAuth>>();
				const getResolvedAuth = (targetUrl: URL, authOptions: ResolveRequestAuthOptions = {}) => {
					const cacheKey = `${authOptions.preferredSources?.join(",") ?? "default"}:${targetUrl.toString()}`;
					let pending = authCache.get(cacheKey);
					if (!pending) {
						pending = resolveAuth
							? resolveAuth(targetUrl, authOptions, composed.signal)
							: Promise.resolve({ context: { identity: "public", strategy: "none", cookieCount: 0 } });
						authCache.set(cacheKey, pending);
					}
					return pending;
				};
				const buildRequestHeaders = async (
					targetUrl: URL,
					userAgent = OPENCODE_WEBFETCH_DEFAULT_USER_AGENT,
					authOptions: ResolveRequestAuthOptions = {},
				) => {
					const baseHeaders = createWebFetchHeaders(accept, userAgent);
					auth = await getResolvedAuth(targetUrl, authOptions);
					return {
						...baseHeaders,
						...(auth.cookieHeader ? { Cookie: mergeCookieHeader(baseHeaders.Cookie, auth.cookieHeader) } : {}),
					};
				};
				const performFetch = async (
					userAgent = OPENCODE_WEBFETCH_DEFAULT_USER_AGENT,
					authOptions: ResolveRequestAuthOptions = {},
				) =>
					fetchWithRedirects(requestedUrl, {
						getHeaders: (url) => buildRequestHeaders(url, userAgent, authOptions),
						signal: composed.signal,
						maxRedirects: settings.fetch.maxRedirects,
						blockPrivateHosts: settings.fetch.blockPrivateHosts,
					});
				const fallbackUserAgent = getFallbackUserAgent(settings.fetch.fallbackUserAgent);
				let currentUserAgent = OPENCODE_WEBFETCH_DEFAULT_USER_AGENT;
				let currentAuthOptions: ResolveRequestAuthOptions = {};
				let { response, finalUrl } = await performFetch(currentUserAgent, currentAuthOptions);
				attemptDebug.push(formatWebFetchAttemptDebug(response, auth.context, currentUserAgent, finalUrl));

				if (shouldRetryWithFallbackUserAgent(response)) {
					await response.body?.cancel().catch(() => undefined);
					currentUserAgent = fallbackUserAgent;
					({ response, finalUrl } = await performFetch(currentUserAgent, currentAuthOptions));
					attemptDebug.push(formatWebFetchAttemptDebug(response, auth.context, currentUserAgent, finalUrl));
				}

				if (shouldRetryWithCdpAuth(response, auth.context)) {
					await response.body?.cancel().catch(() => undefined);
					currentAuthOptions = { preferredSources: ["cdp"] };
					({ response, finalUrl } = await performFetch(currentUserAgent, currentAuthOptions));
					attemptDebug.push(formatWebFetchAttemptDebug(response, auth.context, currentUserAgent, finalUrl));
					if (shouldRetryWithFallbackUserAgent(response) && currentUserAgent !== fallbackUserAgent) {
						await response.body?.cancel().catch(() => undefined);
						currentUserAgent = fallbackUserAgent;
						({ response, finalUrl } = await performFetch(currentUserAgent, currentAuthOptions));
						attemptDebug.push(formatWebFetchAttemptDebug(response, auth.context, currentUserAgent, finalUrl));
					}
				}

				if (!response.ok) {
					const debugSuffix = attemptDebug.length > 0 ? ` [debug: ${attemptDebug.join(" | ")}]` : "";
					throw new Error(`Request failed (${response.status} ${response.statusText || ""})${debugSuffix}`.trim());
				}

				const contentLength = response.headers.get("content-length");
				if (contentLength) {
					const declaredBytes = Number.parseInt(contentLength, 10);
					if (Number.isFinite(declaredBytes) && declaredBytes > settings.fetch.maxResponseBytes) {
						throw new Error(`Response too large (exceeds ${Math.floor(settings.fetch.maxResponseBytes / (1024 * 1024))}MB limit)`);
					}
				}

				const parsedContentType = parseContentType(response.headers.get("content-type"));
				const { buffer, bytes } = await readBodyWithLimit(response, settings.fetch.maxResponseBytes, composed.signal);

				if (parsedContentType.kind === "raster-image") {
					const details: WebFetchDetails = {
						requestedUrl: requestedUrl.toString(),
						finalUrl: finalUrl.toString(),
						format,
						status: response.status,
						mime: parsedContentType.mime,
						contentType: parsedContentType.contentType,
						bytes,
						image: true,
						auth: auth.context,
					};
					return {
						content: [
							textContent(`Fetched image from ${finalUrl.toString()} (${parsedContentType.mime || "image"}, ${formatSize(bytes)})`),
							imageContent(buffer.toString("base64"), parsedContentType.mime),
						],
						details,
					};
				}

				if (parsedContentType.kind === "binary") {
					throw new Error(
						`Unsupported binary content${parsedContentType.mime ? ` (${parsedContentType.mime})` : ""}. Try a more text-oriented URL.`,
					);
				}

				const { text: decodedText, decoder } = decodeTextBuffer(buffer, parsedContentType.charset);
				let outputText = decodedText;
				if (parsedContentType.kind === "html" && format === "markdown") {
					outputText = htmlToMarkdown(decodedText, finalUrl.toString());
					if (isPoorMarkdownConversion(outputText)) {
						outputText = htmlToText(decodedText, finalUrl.toString());
					}
				} else if (parsedContentType.kind === "html" && format === "text") {
					outputText = htmlToText(decodedText, finalUrl.toString());
				}

				const truncated = await truncateTextOutput(outputText, {
					tempPrefix: "pi-webfetch-",
					fileName: "output.txt",
				});

				const details: WebFetchDetails = {
					requestedUrl: requestedUrl.toString(),
					finalUrl: finalUrl.toString(),
					format,
					status: response.status,
					mime: parsedContentType.mime,
					contentType: parsedContentType.contentType,
					charset: parsedContentType.charset,
					decoder,
					bytes,
					truncated: truncated.truncated,
					fullOutputPath: truncated.fullOutputPath,
					auth: auth.context,
				};

				return {
					content: [textContent(truncated.text)],
					details,
				};
			} catch (error) {
				if (signal?.aborted) {
					throw new Error("Web fetch cancelled");
				}
				if (isAbortError(error) || composed.signal.aborted) {
					throw new Error(`Web fetch timed out after ${timeoutSeconds}s`);
				}
				throw error instanceof Error ? error : new Error(String(error));
			} finally {
				composed.cleanup();
			}
		},

		renderCall(args: { url: string; format?: WebFetchFormat }, theme: any) {
			let text = theme.fg("toolTitle", theme.bold("webfetch "));
			text += theme.fg("accent", String(args.url));
			if (args.format && args.format !== "markdown") {
				text += theme.fg("muted", ` (${args.format})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result: { content: Array<{ type: string; text?: string }>; details?: WebFetchDetails; isError?: boolean }, options: { expanded: boolean; isPartial: boolean }, theme: any) {
			if (options.isPartial) {
				return new Text(theme.fg("warning", "Fetching..."), 0, 0);
			}
			if (result.isError) {
				return new Text(theme.fg("error", `✗ ${getTextContent(result.content) || "Fetch failed"}`), 0, 0);
			}

			const details = result.details;
			let text = theme.fg("success", "✓ Fetched");
			if (details?.mime) {
				text += theme.fg("muted", ` (${details.mime})`);
			}
			if (details?.bytes) {
				text += theme.fg("dim", ` ${formatSize(details.bytes)}`);
			}
			if (details?.truncated) {
				text += theme.fg("warning", " [truncated]");
			}
			if (details?.image) {
				text += theme.fg("muted", " [image]");
			}
			text = appendExpandHint(text, options.expanded);

			if (options.expanded) {
				if (details?.image) {
					text += `\n${theme.fg("dim", `Image URL: ${details.finalUrl}`)}`;
				} else {
					text = appendExpandedPreview(text, getTextContent(result.content), theme, { maxLines: 12, maxColumns: 220 });
				}
				if (details?.fullOutputPath) {
					text += `\n${theme.fg("dim", `Full output: ${details.fullOutputPath}`)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	};
}

function getAcceptHeader(format: WebFetchFormat): string {
	switch (format) {
		case "markdown":
			return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, application/xhtml+xml;q=0.6, */*;q=0.1";
		case "text":
			return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, application/xhtml+xml;q=0.7, */*;q=0.1";
		case "html":
			return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
	}
}

export function createWebFetchHeaders(accept: string, userAgent = OPENCODE_WEBFETCH_DEFAULT_USER_AGENT): Record<string, string> {
	return {
		"User-Agent": userAgent,
		Accept: accept,
		"Accept-Language": "en-US,en;q=0.9",
	};
}

export function getFallbackUserAgent(configuredUserAgent?: string): string {
	const trimmed = configuredUserAgent?.trim();
	return trimmed || OPENCODE_WEBFETCH_FALLBACK_USER_AGENT;
}

export function shouldRetryWithFallbackUserAgent(response: Pick<Response, "status" | "headers">): boolean {
	return response.status === 403 && response.headers.get("cf-mitigated") === "challenge";
}

export function shouldRetryWithCdpAuth(
	response: Pick<Response, "status" | "headers">,
	auth: ResolvedRequestAuth["context"],
): boolean {
	return (response.status === 401 || response.status === 403) && auth.identity === "helium" && auth.strategy === "disk-cookies";
}

function formatWebFetchAttemptDebug(
	response: Pick<Response, "status" | "statusText" | "headers">,
	auth: ResolvedRequestAuth["context"],
	userAgent: string,
	finalUrl: URL,
): string {
	const userAgentLabel = userAgent === OPENCODE_WEBFETCH_DEFAULT_USER_AGENT ? "default-ua" : `ua=${userAgent}`;
	const parts = [
		`${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
		`auth=${auth.identity}/${auth.strategy}`,
		`cookies=${auth.cookieCount ?? 0}`,
		userAgentLabel,
		`url=${finalUrl.toString()}`,
	];
	const mitigated = response.headers.get("cf-mitigated");
	if (mitigated) {
		parts.push(`cf-mitigated=${mitigated}`);
	}
	return parts.join(" ");
}

function clampTimeoutSeconds(timeout: number): number {
	if (!Number.isFinite(timeout)) return 30;
	return Math.max(1, Math.min(120, Math.round(timeout)));
}

function textContent(text: string): TextContent {
	return { type: "text", text };
}

function imageContent(data: string, mimeType: string): ImageContent {
	return { type: "image", data, mimeType };
}
