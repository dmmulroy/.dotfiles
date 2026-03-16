import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ContentKind, ParsedContentType } from "./types.ts";

const HTML_MIME_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const TEXT_MIME_TYPES = new Set([
	"application/json",
	"application/ld+json",
	"application/xml",
	"application/rss+xml",
	"application/atom+xml",
	"application/javascript",
	"application/x-javascript",
	"application/ecmascript",
	"image/svg+xml",
]);
const RASTER_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface FetchWithRedirectsOptions {
	headers: Record<string, string>;
	signal?: AbortSignal;
	maxRedirects: number;
	blockPrivateHosts: boolean;
}

export interface FetchWithRedirectsResult {
	response: Response;
	finalUrl: URL;
}

export interface ReadBodyResult {
	buffer: Buffer;
	bytes: number;
}

export interface ComposedSignal {
	signal: AbortSignal;
	cleanup: () => void;
}

export function createOperationSignal(timeoutMs: number, outerSignal?: AbortSignal): ComposedSignal {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort(new Error(`Operation timed out after ${Math.ceil(timeoutMs / 1000)}s`));
	}, timeoutMs);
	const signal = outerSignal ? AbortSignal.any([outerSignal, controller.signal]) : controller.signal;
	return {
		signal,
		cleanup: () => clearTimeout(timeoutId),
	};
}

export function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

export function normalizeAndValidateUrl(rawUrl: string): URL {
	const trimmed = rawUrl.trim();
	if (!trimmed) {
		throw new Error("URL cannot be empty");
	}
	if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
		throw new Error("URL must start with http:// or https://");
	}
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error(`Invalid URL: ${trimmed}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Only http:// and https:// URLs are supported");
	}
	return url;
}

export async function fetchWithRedirects(
	initialUrl: URL,
	options: FetchWithRedirectsOptions,
): Promise<FetchWithRedirectsResult> {
	let currentUrl = initialUrl;
	let redirects = 0;

	while (true) {
		if (options.blockPrivateHosts) {
			await assertPublicUrl(currentUrl);
		}

		const response = await fetch(currentUrl, {
			method: "GET",
			headers: options.headers,
			signal: options.signal,
			redirect: "manual",
		});

		if (isRedirectStatus(response.status)) {
			await response.body?.cancel().catch(() => undefined);
			const location = response.headers.get("location");
			if (!location) {
				throw new Error(`Redirect response from ${currentUrl.toString()} was missing a Location header`);
			}
			if (redirects >= options.maxRedirects) {
				throw new Error(`Too many redirects while fetching ${initialUrl.toString()}`);
			}
			const nextUrl = new URL(location, currentUrl);
			if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
				throw new Error(`Redirected to unsupported protocol: ${nextUrl.protocol}`);
			}
			currentUrl = nextUrl;
			redirects += 1;
			continue;
		}

		return { response, finalUrl: currentUrl };
	}
}

export async function readBodyWithLimit(
	response: Response,
	maxBytes: number,
	signal?: AbortSignal,
): Promise<ReadBodyResult> {
	if (!response.body) {
		return { buffer: Buffer.alloc(0), bytes: 0 };
	}

	const reader = response.body.getReader();
	const chunks: Buffer[] = [];
	let bytes = 0;

	try {
		while (true) {
			if (signal?.aborted) {
				await reader.cancel(signal.reason).catch(() => undefined);
				throw signal.reason instanceof Error ? signal.reason : new Error("Operation cancelled");
			}

			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			bytes += value.byteLength;
			if (bytes > maxBytes) {
				await reader.cancel().catch(() => undefined);
				throw new Error(`Response too large (exceeds ${Math.floor(maxBytes / (1024 * 1024))}MB limit)`);
			}

			chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
		}
	} finally {
		reader.releaseLock();
	}

	return {
		buffer: Buffer.concat(chunks),
		bytes,
	};
}

export function parseContentType(contentTypeHeader: string | null | undefined): ParsedContentType {
	const contentType = contentTypeHeader?.trim() ?? "";
	const [mimePart = ""] = contentType.split(";");
	const mime = mimePart.trim().toLowerCase();
	const charsetMatch = contentType.match(/charset\s*=\s*['\"]?([^;'\"]+)/i);
	const charset = charsetMatch?.[1]?.trim().toLowerCase();
	return {
		contentType,
		mime,
		charset,
		kind: classifyMimeType(mime),
	};
}

export function classifyMimeType(mime: string): ContentKind {
	const normalized = mime.trim().toLowerCase();
	if (!normalized) return "binary";
	if (HTML_MIME_TYPES.has(normalized)) return "html";
	if (RASTER_IMAGE_MIME_TYPES.has(normalized)) return "raster-image";
	if (normalized === "image/svg+xml") return "svg";
	if (normalized.startsWith("text/")) return normalized === "text/html" ? "html" : "text";
	if (TEXT_MIME_TYPES.has(normalized) || normalized.endsWith("+xml") || normalized.endsWith("+json")) return "text";
	return "binary";
}

export function decodeTextBuffer(buffer: Buffer, charset?: string): { text: string; decoder: string } {
	const normalizedCharset = normalizeCharset(charset);
	if (normalizedCharset) {
		try {
			return {
				text: new TextDecoder(normalizedCharset).decode(buffer),
				decoder: normalizedCharset,
			};
		} catch {
			// Fall back to utf-8 below.
		}
	}
	return {
		text: new TextDecoder("utf-8").decode(buffer),
		decoder: "utf-8",
	};
}

export function normalizeCharset(charset: string | undefined): string | undefined {
	if (!charset) return undefined;
	const normalized = charset.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === "utf8") return "utf-8";
	return normalized;
}

async function assertPublicUrl(url: URL): Promise<void> {
	const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
	if (isBlockedHostname(hostname)) {
		throw new Error(`Blocked private or local host: ${url.toString()}`);
	}
	if (isPrivateOrLocalIp(hostname)) {
		throw new Error(`Blocked private or local IP address: ${url.toString()}`);
	}

	try {
		const records = await lookup(hostname, { all: true, verbatim: true });
		for (const record of records) {
			if (isPrivateOrLocalIp(record.address)) {
				throw new Error(`Blocked private or local IP address: ${url.toString()}`);
			}
		}
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Blocked private or local IP address:")) {
			throw error;
		}
		// If DNS resolution fails, let the later fetch surface the real connectivity error.
	}
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isBlockedHostname(hostname: string): boolean {
	return hostname === "localhost" || hostname.endsWith(".localhost");
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

export function isPrivateOrLocalIp(input: string): boolean {
	const ip = stripIpv6Brackets(input).toLowerCase();
	if (!ip) return false;

	if (ip.startsWith("::ffff:")) {
		return isPrivateOrLocalIp(ip.slice(7));
	}

	const version = isIP(ip);
	if (version === 4) {
		const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
		const [a, b] = octets;
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 192 && b === 168) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		return false;
	}
	if (version === 6) {
		if (ip === "::1" || ip === "::") return true;
		if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
		if (/^fe[89ab]/.test(ip)) return true;
		return false;
	}
	return false;
}
