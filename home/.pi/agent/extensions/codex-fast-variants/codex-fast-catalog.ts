import { Buffer } from "node:buffer";

import {
	type CodexAccessToken,
	revealCodexAccessToken,
} from "./codex-access-token.ts";
import { isJsonRecord } from "./json-record.ts";

const CODEX_ACCOUNT_CLAIM = "https://api.openai.com/auth";
const CODEX_MODELS_PATH = "/codex/models";
const OPENAI_CODEX_LATEST_PACKAGE_URL = "https://registry.npmjs.org/@openai/codex/latest";

/** Minimal fetch capability used to read the authenticated Codex model catalog. */
export type CodexFastCatalogFetch = (
	input: string | URL,
	init: RequestInit,
) => Promise<Response>;

/** Inputs required for one authenticated Codex Fast Mode capability refresh. */
export interface CodexFastCatalogRequest {
	readonly baseUrl: string;
	readonly clientVersion: string;
	readonly accessToken: CodexAccessToken;
	readonly fetch: CodexFastCatalogFetch;
	readonly signal: AbortSignal;
}

/** Parsed Fast Mode capability data from the Codex model catalog. */
export interface CodexFastCatalog {
	readonly fastCapableModelIds: ReadonlySet<string>;
}

/** Successful or failed lookup of the latest official Codex client version. */
export type CodexClientVersionResult =
	| { readonly ok: true; readonly value: string }
	| { readonly ok: false; readonly error: CodexFastCatalogError };

/** Safe failure returned when the authenticated Codex model catalog cannot be read. */
export class CodexFastCatalogError extends Error {
	/** Stable catalog failure tag for programmatic classification. */
	readonly _tag = "CodexFastCatalogError" as const;
	/** Safe failure category that never contains credential data. */
	readonly reason:
		| "authentication"
		| "client-version"
		| "network"
		| "http"
		| "invalid-response";
	/** HTTP response status when a remote endpoint rejected the request. */
	readonly status: number | undefined;
	/** Underlying failure from operations that never receive authentication data. */
	override readonly cause: unknown;

	/** Create a catalog failure without retaining access tokens or response bodies. */
	constructor(
		reason: CodexFastCatalogError["reason"],
		status?: number,
		cause?: unknown,
	) {
		super(
			reason === "authentication"
				? "Codex Fast catalog authentication metadata is invalid"
				: reason === "client-version"
					? "Codex Fast official client version lookup failed"
					: reason === "network"
						? "Codex Fast catalog request failed"
						: reason === "http"
							? `Codex Fast catalog returned HTTP ${status ?? "unknown"}`
							: "Codex Fast catalog response is invalid",
		);
		this.name = "CodexFastCatalogError";
		this.reason = reason;
		this.status = status;
		this.cause = cause;
	}
}

/** Successful or failed Codex Fast Mode catalog parsing. */
export type CodexFastCatalogResult =
	| { readonly ok: true; readonly value: CodexFastCatalog }
	| { readonly ok: false; readonly error: CodexFastCatalogError };

function success(value: CodexFastCatalog): CodexFastCatalogResult {
	return { ok: true, value };
}

function failure(error: CodexFastCatalogError): CodexFastCatalogResult {
	return { ok: false, error };
}

function isCodexClientVersion(input: unknown): input is string {
	return typeof input === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input);
}

function parseStringArray(input: unknown): readonly string[] | undefined {
	return Array.isArray(input) && input.every((value) => typeof value === "string")
		? input
		: undefined;
}

function parseServiceTierIds(input: unknown): readonly string[] | undefined {
	if (!Array.isArray(input)) return undefined;
	const ids: string[] = [];
	for (const tier of input) {
		if (!isJsonRecord(tier) || typeof tier.id !== "string") return undefined;
		ids.push(tier.id);
	}
	return ids;
}

function parseCodexAccountId(accessToken: CodexAccessToken): string | undefined {
	try {
		const parts = revealCodexAccessToken(accessToken).split(".");
		if (parts.length !== 3 || !parts[1]) return undefined;
		const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
		if (!isJsonRecord(payload)) return undefined;
		const authClaim = payload[CODEX_ACCOUNT_CLAIM];
		if (!isJsonRecord(authClaim)) return undefined;
		const accountId = authClaim.chatgpt_account_id;
		return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
	} catch {
		return undefined;
	}
}

/** Parse the untrusted Codex `/models` response and retain only Fast Mode capability metadata. */
export function parseCodexFastModelCatalog(input: unknown): CodexFastCatalogResult {
	if (!isJsonRecord(input) || !Array.isArray(input.models)) {
		return failure(new CodexFastCatalogError("invalid-response"));
	}

	const fastCapableModelIds = new Set<string>();
	for (const model of input.models) {
		if (!isJsonRecord(model) || typeof model.slug !== "string" || model.slug.length === 0) {
			return failure(new CodexFastCatalogError("invalid-response"));
		}

		const speedTiers = model.additional_speed_tiers === undefined
			? []
			: parseStringArray(model.additional_speed_tiers);
		const serviceTierIds = model.service_tiers === undefined
			? []
			: parseServiceTierIds(model.service_tiers);
		if (!speedTiers || !serviceTierIds) {
			return failure(new CodexFastCatalogError("invalid-response"));
		}

		if (speedTiers.includes("fast") || serviceTierIds.includes("priority")) {
			fastCapableModelIds.add(model.slug);
		}
	}

	return success({ fastCapableModelIds });
}

/** Fetch the latest official Codex package version used by the model catalog compatibility filter. */
export async function fetchLatestCodexClientVersion(
	fetchCatalog: CodexFastCatalogFetch,
	signal: AbortSignal,
): Promise<CodexClientVersionResult> {
	let response: Response;
	try {
		response = await fetchCatalog(OPENAI_CODEX_LATEST_PACKAGE_URL, {
			method: "GET",
			headers: { Accept: "application/json" },
			signal,
		});
	} catch (cause) {
		return { ok: false, error: new CodexFastCatalogError("client-version", undefined, cause) };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: new CodexFastCatalogError("client-version", response.status),
		};
	}

	try {
		const body: unknown = await response.json();
		if (!isJsonRecord(body) || !isCodexClientVersion(body.version)) {
			return { ok: false, error: new CodexFastCatalogError("client-version") };
		}
		return { ok: true, value: body.version };
	} catch (cause) {
		return { ok: false, error: new CodexFastCatalogError("client-version", undefined, cause) };
	}
}

/** Fetch and parse the account-specific Codex Fast Mode capability catalog. */
export async function fetchCodexFastModelCatalog(
	request: CodexFastCatalogRequest,
): Promise<CodexFastCatalogResult> {
	const accountId = parseCodexAccountId(request.accessToken);
	if (!accountId) return failure(new CodexFastCatalogError("authentication"));

	let response: Response;
	try {
		const url = new URL(`${request.baseUrl.replace(/\/$/, "")}${CODEX_MODELS_PATH}`);
		url.searchParams.set("client_version", request.clientVersion);
		response = await request.fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${revealCodexAccessToken(request.accessToken)}`,
				"chatgpt-account-id": accountId,
				originator: "pi",
			},
			signal: request.signal,
		});
	} catch {
		// The fetch implementation received an Authorization header, so do not retain
		// an arbitrary rejection value that could contain request initialization data.
		return failure(new CodexFastCatalogError("network"));
	}

	if (!response.ok) {
		return failure(new CodexFastCatalogError("http", response.status));
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch (cause) {
		return failure(new CodexFastCatalogError("invalid-response", undefined, cause));
	}
	return parseCodexFastModelCatalog(body);
}
