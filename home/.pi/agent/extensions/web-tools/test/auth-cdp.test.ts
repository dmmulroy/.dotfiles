import test from "node:test";
import assert from "node:assert/strict";
import {
	callBrowserCdp,
	fetchBrowserCookiesFromCdp,
	getCdpCookieRequestParams,
	getCookiesFromCdp,
} from "../auth-cdp.ts";
import type { WebProfile } from "../types.ts";

const profile: WebProfile = {
	browser: "helium",
	profileId: "Default",
	displayName: "dillon",
	userDataDir: "/tmp/helium",
	profileDir: "/tmp/helium/Default",
	cookieDbPath: "/tmp/helium/Default/Cookies",
};

test("getCookiesFromCdp maps browser cookies into auth cookies and excludes partitioned cookies", async () => {
	const cookies = await getCookiesFromCdp(profile, new URL("https://app.example.com/account"), {
		getBrowserCookies: async () => [
			{
				name: "session",
				value: "abc",
				domain: ".example.com",
				path: "/",
				secure: true,
				httpOnly: true,
				session: false,
				expires: 1893456000,
			},
			{
				name: "partitioned",
				value: "skip",
				domain: ".example.com",
				path: "/",
				secure: true,
				httpOnly: true,
				partitionKey: { topLevelSite: "https://example.com" },
			},
			{
				name: "host-only",
				value: "123",
				domain: "app.example.com",
				path: "/",
				secure: false,
				httpOnly: false,
				session: true,
				expires: -1,
			},
		],
	});

	assert.deepEqual(cookies, [
		{
			name: "session",
			value: "abc",
			domain: ".example.com",
			path: "/",
			secure: true,
			httpOnly: true,
			expiresAt: 1893456000000,
			hostOnly: false,
		},
		{
			name: "host-only",
			value: "123",
			domain: "app.example.com",
			path: "/",
			secure: false,
			httpOnly: false,
			hostOnly: true,
		},
	]);
});

test("callBrowserCdp rejects when the socket closes before a reply arrives", async () => {
	const originalWebSocket = globalThis.WebSocket;
	globalThis.WebSocket = createMockWebSocketClass(({ socket }) => {
		queueMicrotask(() => {
			socket.readyState = socket.constructor.OPEN;
			socket.onopen?.(new Event("open"));
			queueMicrotask(() => {
				socket.readyState = socket.constructor.CLOSED;
				socket.onclose?.(new Event("close"));
			});
		});
	}) as unknown as typeof WebSocket;

	try {
		await assert.rejects(
			callBrowserCdp("ws://127.0.0.1:9222/devtools/browser/mock", "Storage.getCookies", {}),
			/Helium CDP connection closed before reply for Storage.getCookies/,
		);
	} finally {
		globalThis.WebSocket = originalWebSocket;
	}
});

test("callBrowserCdp aborts promptly when the auth signal is cancelled", async () => {
	const originalWebSocket = globalThis.WebSocket;
	globalThis.WebSocket = createMockWebSocketClass(() => {
		// Intentionally never open or close; the abort signal should settle the promise.
	}) as unknown as typeof WebSocket;

	try {
		const controller = new AbortController();
		const pending = callBrowserCdp(
			"ws://127.0.0.1:9222/devtools/browser/mock",
			"Storage.getCookies",
			{},
			controller.signal,
		);
		controller.abort();
		await assert.rejects(pending, /Helium CDP request cancelled for Storage.getCookies/);
	} finally {
		globalThis.WebSocket = originalWebSocket;
	}
});

test("fetchBrowserCookiesFromCdp allows the single selected Helium profile and uses Storage.getCookies", async () => {
	let capturedMethod = "";
	let capturedParams: Record<string, unknown> | undefined;
	const cookies = await fetchBrowserCookiesFromCdp(profile, new URL("https://example.com"), {
		readLocalState: async () => ({
			profile: {
				info_cache: {
					Default: { name: "dillon" },
				},
			},
		}),
		getDevToolsWebSocketUrl: async () => "ws://127.0.0.1:9222/devtools/browser/mock",
		callCdp: async (_wsUrl, method, params) => {
			capturedMethod = method;
			capturedParams = params;
			return { cookies: [{ name: "session", value: "abc", domain: ".example.com", path: "/", secure: true, httpOnly: true }] };
		},
	});

	assert.equal(capturedMethod, "Storage.getCookies");
	assert.deepEqual(capturedParams, {});
	assert.equal(cookies.length, 1);
});

test("getCdpCookieRequestParams rejects ambiguous multi-profile state instead of using unscoped cookies", async () => {
	await assert.rejects(
		getCdpCookieRequestParams(profile, {
			readLocalState: async () => ({
				profile: {
					info_cache: {
						Default: { name: "dillon" },
						"Profile 1": { name: "work" },
					},
				},
			}),
		}),
		/dillon cannot be scoped safely to the selected profile/,
	);
});

type MockSocket = {
	readyState: number;
	onopen: ((event: Event) => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: Event) => void) | null;
	onclose: ((event: Event) => void) | null;
	send: (data: string) => void;
	close: () => void;
	constructor: {
		CONNECTING: number;
		OPEN: number;
		CLOSED: number;
	};
};

function createMockWebSocketClass(
	onConstruct: (context: { socket: MockSocket; url: string }) => void,
): new (url: string | URL) => WebSocket {
	class MockWebSocket {
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSING = 2;
		static CLOSED = 3;
		readyState = MockWebSocket.CONNECTING;
		onopen: ((event: Event) => void) | null = null;
		onmessage: ((event: { data: unknown }) => void) | null = null;
		onerror: ((event: Event) => void) | null = null;
		onclose: ((event: Event) => void) | null = null;

		constructor(url: string | URL) {
			onConstruct({
				socket: this as unknown as MockSocket,
				url: String(url),
			});
		}

		send(_data: string): void {
			this.readyState = MockWebSocket.OPEN;
		}

		close(): void {
			this.readyState = MockWebSocket.CLOSED;
		}
	}

	return MockWebSocket as unknown as new (url: string | URL) => WebSocket;
}
