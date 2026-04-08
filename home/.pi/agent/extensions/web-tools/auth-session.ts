import { formatAuthSourceError, toAuthSourceError } from "./auth-errors.ts";
import {
	buildCookieHeader,
	loadAuthCookiesForSource,
	selectCookiesForUrl,
	type ResolveRequestAuthDependencies,
	type ResolveRequestAuthOptions,
	type ResolvedRequestAuth,
} from "./auth.ts";
import type { ActiveWebIdentity, AuthCookie, AuthSourceName, WebProfile } from "./types.ts";

interface SessionAuthState {
	identity: ActiveWebIdentity;
	profile: WebProfile | undefined;
}

interface CachedAuthEntry {
	source: AuthSourceName;
	cookies: AuthCookie[];
	expiresAt: number;
}

export interface CreateSessionAuthResolverDependencies extends ResolveRequestAuthDependencies {
	loadSourceCookies?: (
		identity: ActiveWebIdentity,
		url: URL,
		profile: WebProfile,
		source: AuthSourceName,
		signal?: AbortSignal,
	) => Promise<AuthCookie[]>;
	now?: () => number;
	diskCacheTtlMs?: number;
	cdpCacheTtlMs?: number;
}

export interface SessionAuthResolver {
	resolve: (url: URL, options?: ResolveRequestAuthOptions, signal?: AbortSignal) => Promise<ResolvedRequestAuth>;
	clear: () => void;
}

const DEFAULT_DISK_CACHE_TTL_MS = 30_000;
const DEFAULT_CDP_CACHE_TTL_MS = 120_000;

export function createSessionAuthResolver(
	getState: () => SessionAuthState,
	deps: CreateSessionAuthResolverDependencies = {},
): SessionAuthResolver {
	const cache = new Map<string, Map<AuthSourceName, CachedAuthEntry>>();
	const loadSourceCookies = deps.loadSourceCookies ?? ((identity, url, profile, source, signal) => loadAuthCookiesForSource(profile, url, source, deps, signal));
	const now = deps.now ?? Date.now;
	const diskCacheTtlMs = deps.diskCacheTtlMs ?? DEFAULT_DISK_CACHE_TTL_MS;
	const cdpCacheTtlMs = deps.cdpCacheTtlMs ?? DEFAULT_CDP_CACHE_TTL_MS;

	return {
		resolve: async (url, options = {}, signal) => {
			const { identity, profile } = getState();
			if (identity.kind === "public" || !profile) {
				return {
					context: { identity: identity.kind === "public" ? "public" : "helium", strategy: "none", cookieCount: 0 },
				};
			}

			const timestamp = now();
			const preferredSources = options.preferredSources?.length
				? options.preferredSources
				: getDefaultSourceOrder(cache, getProfileCacheKey(profile), timestamp);
			const errors = [];

			for (const source of preferredSources) {
				const cached = getFreshCachedEntry(cache, getProfileCacheKey(profile), source, timestamp);
				if (cached) {
					return buildResolvedRequestAuth(cached.source, cached.cookies, url, timestamp);
				}

				try {
					const cookies = await loadSourceCookies(identity, url, profile, source, signal);
					cacheAuthCookies(cache, getProfileCacheKey(profile), source, cookies, timestamp + getTtlMs(source, diskCacheTtlMs, cdpCacheTtlMs));
					return buildResolvedRequestAuth(source, cookies, url, timestamp);
				} catch (error) {
					deleteCachedEntry(cache, getProfileCacheKey(profile), source);
					errors.push(toAuthSourceError(source, error, getAuthSourceFailureMessage(source)));
				}
			}

			throw new Error(`Authenticated Helium cookies unavailable (${errors.map(formatAuthSourceError).join("; ")})`);
		},
		clear: () => {
			cache.clear();
		},
	};
}

function buildResolvedRequestAuth(source: AuthSourceName, cookies: AuthCookie[], url: URL, now: number): ResolvedRequestAuth {
	const selected = selectCookiesForUrl(cookies, url, now);
	return {
		cookieHeader: buildCookieHeader(selected),
		context: { identity: "helium", strategy: source, cookieCount: selected.length },
	};
}

function getDefaultSourceOrder(
	cache: Map<string, Map<AuthSourceName, CachedAuthEntry>>,
	profileKey: string,
	now: number,
): AuthSourceName[] {
	return getFreshCachedEntry(cache, profileKey, "cdp", now) ? ["cdp", "disk-cookies"] : ["disk-cookies", "cdp"];
}

function getFreshCachedEntry(
	cache: Map<string, Map<AuthSourceName, CachedAuthEntry>>,
	profileKey: string,
	source: AuthSourceName,
	now: number,
): CachedAuthEntry | undefined {
	const profileCache = cache.get(profileKey);
	const entry = profileCache?.get(source);
	if (!entry) return undefined;
	if (entry.expiresAt <= now) {
		profileCache?.delete(source);
		if (profileCache?.size === 0) cache.delete(profileKey);
		return undefined;
	}
	return entry;
}

function cacheAuthCookies(
	cache: Map<string, Map<AuthSourceName, CachedAuthEntry>>,
	profileKey: string,
	source: AuthSourceName,
	cookies: AuthCookie[],
	expiresAt: number,
): void {
	let profileCache = cache.get(profileKey);
	if (!profileCache) {
		profileCache = new Map();
		cache.set(profileKey, profileCache);
	}
	profileCache.set(source, { source, cookies, expiresAt });
}

function deleteCachedEntry(
	cache: Map<string, Map<AuthSourceName, CachedAuthEntry>>,
	profileKey: string,
	source: AuthSourceName,
): void {
	const profileCache = cache.get(profileKey);
	if (!profileCache) return;
	profileCache.delete(source);
	if (profileCache.size === 0) {
		cache.delete(profileKey);
	}
}

function getProfileCacheKey(profile: WebProfile): string {
	return `${profile.userDataDir}::${profile.profileId}`;
}

function getTtlMs(source: AuthSourceName, diskCacheTtlMs: number, cdpCacheTtlMs: number): number {
	return source === "cdp" ? cdpCacheTtlMs : diskCacheTtlMs;
}

function getAuthSourceFailureMessage(source: AuthSourceName): string {
	return source === "cdp" ? "Unable to read Helium cookies via CDP" : "Unable to read Helium cookies from the profile DB";
}
