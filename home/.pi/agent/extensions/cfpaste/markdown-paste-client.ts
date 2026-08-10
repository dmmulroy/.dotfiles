import type {
	CloudflareAccessToken,
	CloudflareAccessTokenProvider,
} from "./cloudflared-access-token.ts";
import { Redacted } from "./redacted.ts";
import { failure, type Result, success } from "./result.ts";

const MARKDOWN_LANGUAGE = "markdown";
const THREE_MONTH_EXPIRY_SECONDS = "8035200";

/** Markdown content and title sent to Cloudflare Paste. */
export interface CreateMarkdownPasteInput {
	/** Optional display title; the paste body is always Markdown. */
	readonly title?: string;
	/** Markdown source to paste without rewriting. */
	readonly markdown: string;
}

/** Safe failure returned by the Cloudflare Paste HTTP adapter. */
export class MarkdownPasteError extends Error {
	readonly _tag = "MarkdownPasteError" as const;

	/** Create a classified paste request failure without retaining content or credentials. */
	constructor(
		readonly reason: "authentication" | "network" | "rejected" | "invalid-response",
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
		this.name = "MarkdownPasteError";
	}
}

/** Cloudflare Paste capability that creates Markdown-only pastes. */
export interface MarkdownPasteClient {
	/** Create a three-month Markdown paste and return its rendered Markdown URL. */
	createMarkdownPaste(
		input: CreateMarkdownPasteInput,
	): Promise<Result<string, MarkdownPasteError>>;
}

function isAccessRejection(response: Response): boolean {
	if (response.status === 401 || response.status === 403) return true;
	if (response.status < 300 || response.status >= 400) return false;
	const location = response.headers.get("location");
	return location?.includes("/cdn-cgi/access/") ?? false;
}

function parseMarkdownPasteUrl(response: Response, origin: URL): Result<string, MarkdownPasteError> {
	if (response.status !== 303) {
		return failure(
			new MarkdownPasteError(
				"rejected",
				`Cloudflare Paste rejected the create request with HTTP status ${response.status}`,
			),
		);
	}

	const location = response.headers.get("location");
	if (!location) {
		return failure(
			new MarkdownPasteError(
				"invalid-response",
				"Cloudflare Paste create response did not include a result URL",
			),
		);
	}

	let pasteUrl: URL;
	try {
		pasteUrl = new URL(location, origin);
	} catch (cause) {
		return failure(
			new MarkdownPasteError(
				"invalid-response",
				"Cloudflare Paste create response included an invalid result URL",
				cause,
			),
		);
	}

	if (pasteUrl.origin !== origin.origin || !/^\/[A-Za-z0-9_-]+\/?$/.test(pasteUrl.pathname)) {
		return failure(
			new MarkdownPasteError(
				"invalid-response",
				"Cloudflare Paste create response included an unexpected result URL",
			),
		);
	}

	pasteUrl.search = "";
	pasteUrl.hash = "";
	pasteUrl.pathname = `${pasteUrl.pathname.replace(/\/$/, "")}/markdown`;
	return success(pasteUrl.toString());
}

async function postMarkdownPaste(
	origin: URL,
	accessToken: CloudflareAccessToken,
	input: CreateMarkdownPasteInput,
): Promise<Result<Response, MarkdownPasteError>> {
	const body = new URLSearchParams({
		expiry: THREE_MONTH_EXPIRY_SECONDS,
		language: MARKDOWN_LANGUAGE,
		content: input.markdown,
	});
	if (input.title) body.set("title", input.title);

	try {
		return success(
			await fetch(origin, {
				method: "POST",
				headers: {
					"cf-access-token": Redacted.value(accessToken),
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
				redirect: "manual",
			}),
		);
	} catch (cause) {
		return failure(
			new MarkdownPasteError(
				"network",
				"Cloudflare Paste create request failed before receiving a response",
				cause,
			),
		);
	}
}

/** Create the Cloudflare Paste HTTP client with explicit Access authentication. */
export function createMarkdownPasteClient(
	origin: URL,
	tokenProvider: CloudflareAccessTokenProvider,
): MarkdownPasteClient {
	return {
		async createMarkdownPaste(input) {
			const resolvedToken = await tokenProvider.resolveToken();
			if (!resolvedToken.ok) {
				return failure(
					new MarkdownPasteError("authentication", resolvedToken.error.message),
				);
			}

			let response = await postMarkdownPaste(origin, resolvedToken.value, input);
			if (!response.ok) return response;
			if (!isAccessRejection(response.value)) {
				return parseMarkdownPasteUrl(response.value, origin);
			}

			const refreshedToken = await tokenProvider.refreshToken();
			if (!refreshedToken.ok) {
				return failure(
					new MarkdownPasteError("authentication", refreshedToken.error.message),
				);
			}

			response = await postMarkdownPaste(origin, refreshedToken.value, input);
			if (!response.ok) return response;
			if (isAccessRejection(response.value)) {
				return failure(
					new MarkdownPasteError(
						"authentication",
						"Cloudflare Paste rejected the refreshed Access token",
					),
				);
			}
			return parseMarkdownPasteUrl(response.value, origin);
		},
	};
}
