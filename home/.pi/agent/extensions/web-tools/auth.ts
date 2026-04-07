import { formatAuthSourceError, toAuthSourceError } from "./auth-errors.ts";
import type { ActiveWebIdentity, AuthCookie, ResolvedAuthContext, WebProfile } from "./types.ts";
import { getCookiesFromCdp } from "./auth-cdp.ts";
import { getCookiesFromProfileDb } from "./auth-cookies.ts";

export interface ResolvedRequestAuth {
	cookieHeader?: string;
	context: ResolvedAuthContext;
}

export interface ResolveRequestAuthDependencies {
	getCdpCookies?: typeof getCookiesFromCdp;
	getDiskCookies?: typeof getCookiesFromProfileDb;
	now?: () => number;
}

export async function resolveRequestAuth(
	identity: ActiveWebIdentity,
	url: URL,
	profile: WebProfile | undefined,
	deps: ResolveRequestAuthDependencies = {},
	signal?: AbortSignal,
): Promise<ResolvedRequestAuth> {
	if (identity.kind === "public" || !profile) {
		return {
			context: { identity: identity.kind === "public" ? "public" : "helium", strategy: "none", cookieCount: 0 },
		};
	}

	const now = deps.now?.() ?? Date.now();
	const getCdpCookies = deps.getCdpCookies ?? getCookiesFromCdp;
	const getDiskCookies = deps.getDiskCookies ?? getCookiesFromProfileDb;

	try {
		const cdpCookies = await getCdpCookies(profile, url, undefined, signal);
		const selected = selectCookiesForUrl(cdpCookies, url, now);
		return {
			cookieHeader: buildCookieHeader(selected),
			context: { identity: "helium", strategy: "cdp", cookieCount: selected.length },
		};
	} catch (error) {
		const cdpError = toAuthSourceError("cdp", error, "Unable to read Helium cookies via CDP");
		try {
			const diskCookies = await getDiskCookies(profile, undefined, signal);
			const selected = selectCookiesForUrl(diskCookies, url, now);
			return {
				cookieHeader: buildCookieHeader(selected),
				context: { identity: "helium", strategy: "disk-cookies", cookieCount: selected.length },
			};
		} catch (diskError) {
			const resolvedDiskError = toAuthSourceError(
				"disk-cookies",
				diskError,
				"Unable to read Helium cookies from the profile DB",
			);
			throw new Error(
				`Authenticated Helium cookies unavailable (${formatAuthSourceError(cdpError)}; ${formatAuthSourceError(resolvedDiskError)})`,
			);
		}
	}
}

export function selectCookiesForUrl(cookies: AuthCookie[], url: URL, now = Date.now()): AuthCookie[] {
	return [...cookies]
		.filter((cookie) => matchesCookieUrl(cookie, url, now))
		.sort((a, b) => b.path.length - a.path.length || a.name.localeCompare(b.name));
}

export function buildCookieHeader(cookies: AuthCookie[]): string | undefined {
	if (cookies.length === 0) return undefined;
	return [...cookies]
		.sort((a, b) => b.path.length - a.path.length || a.name.localeCompare(b.name))
		.map((cookie) => `${cookie.name}=${cookie.value}`)
		.join("; ");
}

export function mergeCookieHeader(existing: string | undefined, injected: string | undefined): string | undefined {
	if (!existing) return injected;
	if (!injected) return existing;
	return `${existing}; ${injected}`;
}

function matchesCookieUrl(cookie: AuthCookie, url: URL, now: number): boolean {
	if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) return false;
	if (cookie.secure && url.protocol !== "https:") return false;
	if (!domainMatches(cookie, url.hostname)) return false;
	if (!pathMatches(cookie.path, url.pathname || "/")) return false;
	return true;
}

function domainMatches(cookie: AuthCookie, hostname: string): boolean {
	const cookieDomain = normalizeCookieDomain(cookie.domain);
	const normalizedHost = hostname.toLowerCase();
	if (cookie.hostOnly) {
		return normalizedHost === cookieDomain;
	}
	return normalizedHost === cookieDomain || normalizedHost.endsWith(`.${cookieDomain}`);
}

function normalizeCookieDomain(domain: string): string {
	return domain.trim().replace(/^\./, "").toLowerCase();
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
	const normalizedCookiePath = cookiePath || "/";
	const normalizedRequestPath = requestPath || "/";
	if (normalizedCookiePath === "/") return true;
	if (!normalizedRequestPath.startsWith(normalizedCookiePath)) return false;
	if (normalizedRequestPath.length === normalizedCookiePath.length) return true;
	return normalizedCookiePath.endsWith("/") || normalizedRequestPath[normalizedCookiePath.length] === "/";
}
