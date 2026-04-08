import { formatAuthSourceError, toAuthSourceError } from "./auth-errors.ts";
import type { ActiveWebIdentity, AuthCookie, AuthSourceName, ResolvedAuthContext, WebProfile } from "./types.ts";
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

export interface ResolveRequestAuthOptions {
	preferredSources?: AuthSourceName[];
}

const DEFAULT_AUTH_SOURCE_ORDER: AuthSourceName[] = ["disk-cookies", "cdp"];

export async function resolveRequestAuth(
	identity: ActiveWebIdentity,
	url: URL,
	profile: WebProfile | undefined,
	deps: ResolveRequestAuthDependencies = {},
	signal?: AbortSignal,
	options: ResolveRequestAuthOptions = {},
): Promise<ResolvedRequestAuth> {
	if (identity.kind === "public" || !profile) {
		return {
			context: { identity: identity.kind === "public" ? "public" : "helium", strategy: "none", cookieCount: 0 },
		};
	}

	const now = deps.now?.() ?? Date.now();
	const preferredSources = options.preferredSources?.length ? options.preferredSources : DEFAULT_AUTH_SOURCE_ORDER;
	const errors = [];

	for (const source of preferredSources) {
		try {
			const cookies = await loadAuthCookiesForSource(profile, url, source, deps, signal);
			const selected = selectCookiesForUrl(cookies, url, now);
			return {
				cookieHeader: buildCookieHeader(selected),
				context: { identity: "helium", strategy: source, cookieCount: selected.length },
			};
		} catch (error) {
			errors.push(toAuthSourceError(source, error, getAuthSourceFailureMessage(source)));
		}
	}

	throw new Error(`Authenticated Helium cookies unavailable (${errors.map(formatAuthSourceError).join("; ")})`);
}

export async function loadAuthCookiesForSource(
	profile: WebProfile,
	url: URL,
	source: AuthSourceName,
	deps: ResolveRequestAuthDependencies = {},
	signal?: AbortSignal,
): Promise<AuthCookie[]> {
	switch (source) {
		case "cdp":
			return (deps.getCdpCookies ?? getCookiesFromCdp)(profile, url, undefined, signal);
		case "disk-cookies":
			return (deps.getDiskCookies ?? getCookiesFromProfileDb)(profile, undefined, signal);
	}
}

function getAuthSourceFailureMessage(source: AuthSourceName): string {
	return source === "cdp" ? "Unable to read Helium cookies via CDP" : "Unable to read Helium cookies from the profile DB";
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
