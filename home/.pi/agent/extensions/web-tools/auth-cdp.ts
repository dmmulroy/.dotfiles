import { readFile } from "node:fs/promises";
import path from "node:path";
import { AuthSourceError, toAuthSourceError } from "./auth-errors.ts";
import type { AuthCookie, WebProfile } from "./types.ts";

interface CdpCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	secure: boolean;
	httpOnly: boolean;
	session?: boolean;
	expires?: number;
	partitionKey?: string | { topLevelSite?: string } | null;
}

interface HeliumLocalState {
	profile?: {
		info_cache?: Record<string, unknown>;
	};
}

export interface GetCookiesFromCdpDependencies {
	getBrowserCookies?: (profile: WebProfile, url: URL, signal?: AbortSignal) => Promise<CdpCookie[]>;
	readLocalState?: (userDataDir: string) => Promise<HeliumLocalState | null>;
	getDevToolsWebSocketUrl?: (userDataDir: string) => Promise<string>;
	callCdp?: typeof callBrowserCdp;
}

export async function getCookiesFromCdp(
	profile: WebProfile,
	url: URL,
	deps: GetCookiesFromCdpDependencies = {},
	signal?: AbortSignal,
): Promise<AuthCookie[]> {
	const browserCookies = deps.getBrowserCookies ?? ((selectedProfile, selectedUrl, selectedSignal) => fetchBrowserCookiesFromCdp(selectedProfile, selectedUrl, deps, selectedSignal));
	const cookies = await browserCookies(profile, url, signal);
	return cookies.filter((cookie) => !isPartitionedCdpCookie(cookie)).map(mapCdpCookieToAuthCookie);
}

export async function fetchBrowserCookiesFromCdp(
	profile: WebProfile,
	_url: URL,
	deps: Omit<GetCookiesFromCdpDependencies, "getBrowserCookies"> = {},
	signal?: AbortSignal,
): Promise<CdpCookie[]> {
	const params = await getCdpCookieRequestParams(profile, { readLocalState: deps.readLocalState });
	const wsUrl = await (deps.getDevToolsWebSocketUrl ?? getDevToolsWebSocketUrl)(profile.userDataDir);
	const result = await (deps.callCdp ?? callBrowserCdp)(wsUrl, "Storage.getCookies", params, signal);
	const cookies = result.cookies;
	if (!Array.isArray(cookies)) return [];
	return cookies as CdpCookie[];
}

export async function getCdpCookieRequestParams(
	profile: WebProfile,
	deps: { readLocalState?: (userDataDir: string) => Promise<HeliumLocalState | null> } = {},
): Promise<Record<string, never>> {
	const localState = await (deps.readLocalState ?? readHeliumLocalState)(profile.userDataDir);
	const profileIds = Object.keys(localState?.profile?.info_cache ?? {});
	if (profileIds.length === 1 && profileIds[0] === profile.profileId) {
		return {};
	}

	throw new AuthSourceError(
		"cdp",
		"unavailable",
		`Helium CDP cookies are unavailable because ${profile.displayName} cannot be scoped safely to the selected profile`,
	);
}

function mapCdpCookieToAuthCookie(cookie: CdpCookie): AuthCookie {
	const expiresAt = cookie.session ? undefined : normalizeCdpExpires(cookie.expires);
	return {
		name: cookie.name,
		value: cookie.value,
		domain: cookie.domain,
		path: cookie.path || "/",
		secure: Boolean(cookie.secure),
		httpOnly: Boolean(cookie.httpOnly),
		hostOnly: !cookie.domain.startsWith("."),
		...(expiresAt !== undefined ? { expiresAt } : {}),
	};
}

function normalizeCdpExpires(expires: number | undefined): number | undefined {
	if (expires === undefined || !Number.isFinite(expires) || expires <= 0) return undefined;
	return Math.round(expires * 1000);
}

function isPartitionedCdpCookie(cookie: CdpCookie): boolean {
	if (cookie.partitionKey === null || cookie.partitionKey === undefined) return false;
	if (typeof cookie.partitionKey === "string") {
		return cookie.partitionKey.trim().length > 0;
	}
	return typeof cookie.partitionKey.topLevelSite === "string" && cookie.partitionKey.topLevelSite.trim().length > 0;
}

async function readHeliumLocalState(userDataDir: string): Promise<HeliumLocalState | null> {
	try {
		const raw = await readFile(path.join(userDataDir, "Local State"), "utf8");
		return JSON.parse(raw) as HeliumLocalState;
	} catch {
		return null;
	}
}

async function getDevToolsWebSocketUrl(userDataDir: string): Promise<string> {
	const raw = await readFile(path.join(userDataDir, "DevToolsActivePort"), "utf8");
	const [portLine, wsPathLine] = raw.trim().split(/\r?\n/);
	const port = portLine?.trim();
	const wsPath = wsPathLine?.trim();
	if (!port || !wsPath) {
		throw new AuthSourceError("cdp", "failed", "Helium DevToolsActivePort is invalid");
	}
	return `ws://127.0.0.1:${port}${wsPath}`;
}

const CDP_REQUEST_TIMEOUT_MS = 10_000;

export async function callBrowserCdp(
	wsUrl: string,
	method: string,
	params: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<any> {
	const ws = new WebSocket(wsUrl);
	const requestId = 1;

	return await new Promise((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			finishReject(new AuthSourceError("cdp", "failed", `Helium CDP request timed out for ${method}`));
		}, CDP_REQUEST_TIMEOUT_MS);

		const cleanup = () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
			ws.onopen = null;
			ws.onmessage = null;
			ws.onerror = null;
			ws.onclose = null;
		};

		const safeClose = () => {
			try {
				if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
					ws.close();
				}
			} catch {
				// Ignore close failures.
			}
		};

		const finishResolve = (value: unknown) => {
			if (settled) return;
			settled = true;
			cleanup();
			safeClose();
			resolve(value);
		};

		const finishReject = (error: unknown) => {
			if (settled) return;
			settled = true;
			cleanup();
			safeClose();
			reject(error instanceof Error ? error : new Error(String(error)));
		};

		const onAbort = () => {
			finishReject(new AuthSourceError("cdp", "cancelled", `Helium CDP request cancelled for ${method}`));
		};

		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });

		ws.onopen = () => {
			try {
				ws.send(JSON.stringify({ id: requestId, method, params }));
			} catch (error) {
				finishReject(toAuthSourceError("cdp", error, `Unable to send Helium CDP request for ${method}`));
			}
		};

		ws.onmessage = (event) => {
			void (async () => {
				const message = JSON.parse(await getWebSocketMessageText(event.data));
				if (message.id !== requestId) return;
				if (message.error) {
					throw new AuthSourceError("cdp", "failed", message.error.message || `Helium CDP error for ${method}`);
				}
				finishResolve(message.result ?? {});
			})().catch((error) => {
				finishReject(toAuthSourceError("cdp", error, `Invalid Helium CDP response for ${method}`));
			});
		};

		ws.onerror = () => {
			finishReject(new AuthSourceError("cdp", "failed", `Unable to connect to Helium CDP at ${wsUrl}`));
		};

		ws.onclose = () => {
			finishReject(new AuthSourceError("cdp", "failed", `Helium CDP connection closed before reply for ${method}`));
		};
	});
}

async function getWebSocketMessageText(data: unknown): Promise<string> {
	if (typeof data === "string") return data;
	if (data instanceof Blob) return data.text();
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
	if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
	return String(data);
}
