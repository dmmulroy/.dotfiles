import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { validateToolArguments } from "@earendil-works/pi-ai/utils/validation";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { HerdrAbsolutePath, herdrSdkLayerFromOptions } from "../vendor/herdr-sdk/index.mjs";
import { herdrToolNamespace, registerHerdrCodemodeTools, shouldRegisterHerdrTools } from "../index.ts";
import { herdrToolOperations } from "../herdr-tool-operations.ts";
import { HerdrToolError, type HerdrToolRuntime } from "../herdr-tool-runtime.ts";
import { HERDR_SEARCH_DEFAULT_LIMIT, HERDR_SEARCH_TOOL_NAME } from "../herdr-tool-search.ts";
import {
	allHerdrWireMethods,
	startHerdrFixtureServer,
	type HerdrFixtureReply,
	type HerdrFixtureRequest,
	type HerdrFixtureServer,
} from "./herdr-fixture-server.ts";

const workspaceId = "workspace-1";
const tabId = "tab-1";
const paneId = "pane-1";
const pluginId = "plugin-1";
const name = "agent-1";
const commandId = "cmd_fixture";
const fixturePath = "/tmp/herdr-codemode-fixture";
const cell = { row: 0, col: 0 };

/** One valid call per tool, mirroring the SDK's full-parity test. */
const exampleArguments: Record<string, Record<string, unknown>> = {
	herdr_search: { query: "pane" },
	herdr_session_snapshot: {},
	herdr_workspaces_createInDirectory: { cwd: fixturePath, label: "fixture" },
	herdr_tabs_create: { workspaceId },
	herdr_panes_split: { paneId, direction: "right" },
	herdr_panes_sendText: { paneId, text: "echo hi\n" },
	herdr_panes_sendKeys: { paneId, keys: ["Enter"] },
	herdr_panes_waitForOutput: { paneId, source: "recent", match: { type: "substring", value: "hi" }, timeoutMs: 1000 },
	herdr_panes_read: { paneId, source: "visible" },
	herdr_panes_close: { paneId },
	herdr_agents_start: { name, kind: "codex", paneId },
	herdr_agents_prompt: { name, text: "hello", wait: { until: ["done"], timeoutMs: 1000 } },
	herdr_agents_wait: { name, until: ["done"], timeoutMs: 1000 },
	herdr_agents_read: { name, source: "recent" },
	herdr_server_ping: {},
	herdr_server_stop: {},
	herdr_server_liveHandoff: { importExe: fixturePath },
	herdr_server_reloadConfig: {},
	herdr_server_getAgentManifests: {},
	herdr_server_reloadAgentManifests: {},
	herdr_notifications_show: { title: "fixture" },
	herdr_client_windowTitle_set: { title: "fixture" },
	herdr_client_windowTitle_clear: {},
	herdr_popups_close: {},
	herdr_productAnnouncements_dismiss: { version: "0.9.0", id: "announcement" },
	herdr_releaseNotes_dismiss: { version: "0.9.0" },
	herdr_commands_invoke: { commandId },
	herdr_commands_invokeInWorkspace: { commandId, workspaceId },
	herdr_commands_invokeInTab: { commandId, tabId },
	herdr_commands_invokeInPane: { commandId, paneId },
	herdr_workspaces_create: {},
	herdr_workspaces_createFromWorkspace: { sourceWorkspaceId: workspaceId },
	herdr_workspaces_list: {},
	herdr_workspaces_get: { workspaceId },
	herdr_workspaces_focus: { workspaceId },
	herdr_workspaces_rename: { workspaceId, label: "fixture" },
	herdr_workspaces_move: { workspaceId, insertIndex: 0 },
	herdr_workspaces_moveBlock: { workspaceIds: [workspaceId] },
	herdr_workspaces_reportMetadata: { workspaceId, source: "fixture", tokens: { state: "ready" } },
	herdr_workspaces_close: { workspaceId },
	herdr_workspaces_closeGroup: { workspaceId },
	herdr_worktrees_list: { cwd: fixturePath, trustRepository: true },
	herdr_worktrees_create: { cwd: fixturePath, branch: "fixture", trustRepository: true },
	herdr_worktrees_open: { cwd: fixturePath, branch: "fixture", trustRepository: true },
	herdr_worktrees_remove: { workspaceId, trustRepository: true },
	herdr_tabs_list: { workspaceId },
	herdr_tabs_get: { tabId },
	herdr_tabs_focus: { tabId },
	herdr_tabs_rename: { tabId, label: "fixture" },
	herdr_tabs_move: { tabId, insertIndex: 0 },
	herdr_tabs_close: { tabId },
	herdr_panes_list: { workspaceId },
	herdr_panes_get: { paneId },
	herdr_panes_current: { callerPaneId: paneId },
	herdr_panes_focus: { paneId },
	herdr_panes_focusDirection: { direction: "right", paneId },
	herdr_panes_rename: { paneId, label: "fixture" },
	herdr_panes_sendInput: { paneId, text: "fixture", keys: ["Enter"] },
	herdr_panes_clear: { paneId },
	herdr_panes_scroll: { paneId, offsetFromBottom: 0 },
	herdr_panes_editScrollback: { paneId },
	herdr_panes_swap: { paneId, direction: "right" },
	herdr_panes_move: { paneId, destination: { type: "new_tab", workspaceId } },
	herdr_panes_zoom: { paneId, mode: "toggle" },
	herdr_panes_resize: { direction: "right", paneId, amount: 1 },
	herdr_panes_layout: { paneId },
	herdr_panes_neighbor: { paneId, direction: "right" },
	herdr_panes_edges: { paneId },
	herdr_panes_processInfo: { paneId },
	herdr_panes_setInputRouting: { paneId, rightClick: "herdr" },
	herdr_panes_selection_read: { paneId, anchor: cell, cursor: { row: 1, col: 1 } },
	herdr_panes_copyMotion: { paneId, cursor: cell, motion: "nextWordStart" },
	herdr_panes_copySearch: { paneId, query: "error", direction: "forward", cursor: cell, contentRevision: 0 },
	herdr_panes_link_resolve: { paneId, viewportRow: 0, col: 0 },
	herdr_panes_link_activate: { paneId, viewportRow: 0, col: 0 },
	herdr_panes_reportAgent: { paneId, source: "fixture", agent: "codex", state: "working", resumeArgv: ["codex", "resume"] },
	herdr_panes_reportAgentSession: { paneId, source: "fixture", agent: "codex", sessionId: "session-1" },
	herdr_panes_reportMetadata: { paneId, source: "fixture", tokens: { state: "ready" } },
	herdr_panes_clearAgentAuthority: { paneId },
	herdr_panes_releaseAgent: { paneId, source: "fixture", agent: "codex" },
	herdr_layouts_export: { tabId },
	herdr_layouts_apply: { workspaceId, root: { type: "pane", paneId } },
	herdr_layouts_setSplitRatio: { tabId, path: [], ratio: 0.5 },
	herdr_agents_list: {},
	herdr_agents_get: { name },
	herdr_agents_explain: { paneId },
	herdr_agents_sendKeys: { name, keys: ["Enter"] },
	herdr_agents_rename: { name, newName: "agent-2" },
	herdr_agents_focus: { name },
	herdr_agents_view_set: { source: "fixture" },
	herdr_agents_view_clear: {},
	herdr_events_wait: { match: { type: "workspace.created" }, timeoutMs: 1000 },
	herdr_integrations_list: {},
	herdr_integrations_install: { integration: "codex" },
	herdr_integrations_uninstall: { integration: "codex" },
	herdr_plugins_list: { pluginId },
	herdr_plugins_link: { path: fixturePath },
	herdr_plugins_unlink: { pluginId },
	herdr_plugins_enable: { pluginId },
	herdr_plugins_disable: { pluginId },
	herdr_plugins_actions_list: { pluginId },
	herdr_plugins_actions_invoke: {
		actionId: "plugin-1.action-1",
		pluginId,
		context: { workspaceId, focusedPaneId: paneId },
	},
	herdr_plugins_logs_list: { pluginId, limit: 1 },
	herdr_plugins_panes_open: { pluginId, entrypoint: "fixture", placement: "popup" },
	herdr_plugins_panes_focus: { paneId },
	herdr_plugins_panes_close: { paneId },
};

const waitToolNames = ["herdr_panes_waitForOutput", "herdr_agents_wait", "herdr_events_wait"];

/** Wire methods a request/response tool cannot own: they hold a connection for a caller scope. */
const scopedWireMethods = ["client_shell.surface.set", "events.subscribe", "server.ssh_agent.register"];

interface RegisteredHerdrTools {
	readonly tools: Map<string, ToolDefinition<any, any>>;
	readonly handlers: Map<string, (...args: unknown[]) => unknown>;
	readonly runtime: HerdrToolRuntime;
}

function registerAgainst(server: HerdrFixtureServer): RegisteredHerdrTools {
	const tools = new Map<string, ToolDefinition<any, any>>();
	const handlers = new Map<string, (...args: unknown[]) => unknown>();
	const pi = {
		registerTool: (tool: ToolDefinition<any, any>) => tools.set(tool.name, tool),
		on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
	} as unknown as ExtensionAPI;
	const runtime = registerHerdrCodemodeTools(pi, () =>
		herdrSdkLayerFromOptions({ socketPath: HerdrAbsolutePath.make(server.socketPath) }),
	);
	return { tools, handlers, runtime };
}

/** Validates like pi does for a model or script call, then executes. */
async function callTool(
	tools: Map<string, ToolDefinition<any, any>>,
	toolName: string,
	args: Record<string, unknown>,
	signal?: AbortSignal,
) {
	const tool = tools.get(toolName);
	assert.ok(tool, `tool ${toolName} is registered`);
	const validated = validateToolArguments(tool as never, {
		type: "toolCall",
		id: "call-1",
		name: toolName,
		arguments: args,
	} as never);
	return tool.execute("call-1", validated, signal, undefined, {} as never);
}

describe("herdr codemode tools", () => {
	let reply: (request: HerdrFixtureRequest) => HerdrFixtureReply | undefined = () => undefined;
	let server: HerdrFixtureServer;
	let registered: RegisteredHerdrTools;

	before(async () => {
		server = await startHerdrFixtureServer((request) => reply(request));
		registered = registerAgainst(server);
	});
	after(async () => {
		await registered.handlers.get("session_shutdown")?.();
		await server.close();
	});

	test("lists only herdr_search; every operation tool is deferred in the herdr namespace", () => {
		const { tools } = registered;
		assert.equal(tools.size, herdrToolOperations.length + 1);
		assert.deepEqual(Object.keys(exampleArguments).sort(), [...tools.keys()].sort());
		const listed = [...tools.values()].filter((tool) => tool.exposure === "codemode").map((tool) => tool.name);
		assert.deepEqual(listed, [HERDR_SEARCH_TOOL_NAME]);
		for (const tool of tools.values()) {
			assert.equal(tool.namespace, herdrToolNamespace);
			if (tool.name === HERDR_SEARCH_TOOL_NAME) continue;
			assert.equal(tool.exposure, "deferred");
			assert.match(tool.name, /^herdr_[a-z][A-Za-z]*(_[a-z][A-Za-z]*)+$/);
		}
	});

	test("herdr_search: table of contents, capped ranked hits, namespace filter, no socket traffic", async () => {
		const firstRequest = server.requests.length;
		const search = async (args: Record<string, unknown>) =>
			(await callTool(registered.tools, HERDR_SEARCH_TOOL_NAME, args)).structuredContent as any;

		const contents = await search({});
		assert.equal(contents.instructions, herdrToolNamespace.instructions);
		assert.equal(contents.tools, undefined, "no tool dump without a query");
		const counted = contents.namespaces.reduce((sum: number, namespace: { tools: number }) => sum + namespace.tools, 0);
		assert.equal(counted, herdrToolOperations.length);
		assert.ok(contents.namespaces.some((namespace: { name: string }) => namespace.name === "panes"));
		assert.ok(JSON.stringify(contents).length / 4 < 1_200, "table of contents stays small");

		const waits = await search({ query: "wait for pane output" });
		assert.equal(waits.tools[0].name, "herdr_panes_waitForOutput");
		assert.equal(waits.tools.length, HERDR_SEARCH_DEFAULT_LIMIT);
		assert.ok(waits.total > waits.tools.length);

		const closes = await search({ query: "close", limit: 50 });
		assert.equal(closes.tools.length, closes.total);
		assert.ok(closes.tools.some((hit: any) => hit.name === "herdr_tabs_close" && hit.destructive === true));
		assert.ok(closes.tools.every((hit: any) => /close/i.test(`${hit.name} ${hit.description}`)));
		const read = (await search({ query: "read pane output" })).tools.find((hit: any) => hit.name === "herdr_panes_read");
		assert.deepEqual(Object.keys(read).sort(), ["description", "name"], "non-destructive hits carry no flags");

		const agents = await search({ namespace: "agents", limit: 50 });
		assert.ok(agents.tools.length > 0 && agents.tools.every((hit: any) => hit.name.startsWith("herdr_agents_")));
		const agentWaits = await search({ namespace: "agents", query: "wait" });
		assert.equal(agentWaits.tools[0].name, "herdr_agents_wait");
		assert.ok(agentWaits.tools.every((hit: any) => hit.name.startsWith("herdr_agents_")));

		assert.deepEqual(await search({ query: "zzzz" }), { tools: [], total: 0 });
		assert.equal(server.requests.length, firstRequest, "search never touches the socket");
	});

	test("every tool crosses the socket and resolves to JSON matching its output schema", async () => {
		const ajv = new Ajv2020({ strict: false, allErrors: true });
		const firstRequest = server.requests.length;
		for (const [toolName, args] of Object.entries(exampleArguments)) {
			const result = await callTool(registered.tools, toolName, args);
			const tool = registered.tools.get(toolName)!;
			assert.ok(result.structuredContent !== undefined, `${toolName} sets structuredContent`);
			assert.deepEqual(JSON.parse(JSON.stringify(result.structuredContent)), result.structuredContent);
			const validate = ajv.compile(tool.outputSchema as object);
			assert.ok(validate(result.structuredContent), `${toolName} output: ${ajv.errorsText(validate.errors)}`);
		}
		const observed = new Set(server.requests.slice(firstRequest).map((request) => request.method));
		assert.deepEqual(
			[...observed].sort(),
			allHerdrWireMethods.filter((method) => !scopedWireMethods.includes(method)).sort(),
		);
	});

	test("flat parameters reach the wire as the SDK's positional arguments and input", async () => {
		const firstRequest = server.requests.length;
		await callTool(registered.tools, "herdr_panes_read", { paneId, source: "recent", lines: 20 });
		await callTool(registered.tools, "herdr_layouts_setSplitRatio", { paneId, path: [true], ratio: 0.25 });
		await callTool(registered.tools, "herdr_agents_rename", { paneId, newName: null });
		const requests = server.requests.slice(firstRequest).filter((request) => request.method !== "ping");
		assert.deepEqual(
			requests.map((request) => request.method),
			["pane.read", "layout.set_split_ratio", "agent.rename"],
		);
		const [read, splitRatio, rename] = requests;
		assert.equal(read?.params.pane_id, paneId);
		assert.equal(read?.params.source, "recent");
		assert.equal(read?.params.lines, 20);
		assert.match(JSON.stringify(splitRatio?.params), new RegExp(`"${paneId}"`));
		assert.deepEqual(splitRatio?.params.path, [true]);
		assert.equal(splitRatio?.params.ratio, 0.25);
		assert.match(JSON.stringify(rename?.params), new RegExp(`"${paneId}"`));
		assert.equal(rename?.params.name, null);
	});

	test("rejects before any request when parameters do not match the schema", async () => {
		const firstRequest = server.requests.length;
		await assert.rejects(callTool(registered.tools, "herdr_panes_sendText", { paneId }), /Validation failed/);
		await assert.rejects(callTool(registered.tools, "herdr_panes_read", { paneId, source: "visible", extra: 1 }), /Validation failed/);
		assert.equal(server.requests.length, firstRequest);
	});

	test("waits require timeoutMs", async () => {
		const firstRequest = server.requests.length;
		for (const toolName of waitToolNames) {
			const { timeoutMs: _timeoutMs, ...withoutTimeout } = exampleArguments[toolName]!;
			await assert.rejects(callTool(registered.tools, toolName, withoutTimeout), /Validation failed[\s\S]*timeoutMs/);
		}
		assert.equal(server.requests.length, firstRequest);
	});

	test("waits resolve to { timedOut: false, <value> } on success", async () => {
		const output = await callTool(registered.tools, "herdr_panes_waitForOutput", exampleArguments.herdr_panes_waitForOutput!);
		const agent = await callTool(registered.tools, "herdr_agents_wait", exampleArguments.herdr_agents_wait!);
		const event = await callTool(registered.tools, "herdr_events_wait", exampleArguments.herdr_events_wait!);
		assert.equal((output.structuredContent as any).timedOut, false);
		assert.equal(typeof (output.structuredContent as any).match.paneId, "string");
		assert.equal((agent.structuredContent as any).timedOut, false);
		assert.equal(typeof (agent.structuredContent as any).agent.paneId, "string");
		assert.equal((event.structuredContent as any).timedOut, false);
		assert.equal(typeof (event.structuredContent as any).event, "object");
	});

	test("Herdr's wait timeout code resolves to { timedOut: true } instead of rejecting", async () => {
		const waitMethods = new Set(["pane.wait_for_output", "agent.wait", "events.wait"]);
		reply = (request) =>
			waitMethods.has(request.method)
				? { kind: "json", body: { id: request.id, error: { code: "timeout", message: "timed out waiting" } } }
				: undefined;
		try {
			for (const toolName of waitToolNames) {
				const result = await callTool(registered.tools, toolName, exampleArguments[toolName]!);
				assert.deepEqual(result.structuredContent, { timedOut: true }, toolName);
			}
		} finally {
			reply = () => undefined;
		}
	});

	test("other wait failures, and agents_prompt timeouts, still reject", async () => {
		reply = (request) => {
			if (request.method === "agent.wait") {
				return { kind: "json", body: { id: request.id, error: { code: "agent_not_running", message: "gone" } } };
			}
			if (request.method === "agent.prompt") {
				return { kind: "json", body: { id: request.id, error: { code: "timeout", message: "timed out waiting for agent status" } } };
			}
			return undefined;
		};
		try {
			await assert.rejects(callTool(registered.tools, "herdr_agents_wait", exampleArguments.herdr_agents_wait!), (error: Error) => /^HerdrServerError: .*agent_not_running/.test(error.message));
			await assert.rejects(callTool(registered.tools, "herdr_agents_prompt", exampleArguments.herdr_agents_prompt!), (error: Error) => /^HerdrServerError: .*timeout/.test(error.message));
		} finally {
			reply = () => undefined;
		}
	});

	test("a server rejection rejects with the SDK error tag first", async () => {
		reply = (request) =>
			request.method === "pane.get"
				? { kind: "json", body: { id: request.id, error: { code: "pane_not_found", message: "no pane-9" } } }
				: undefined;
		try {
			await assert.rejects(callTool(registered.tools, "herdr_panes_get", { paneId: "pane-9" }), (error: unknown) => {
				assert.ok(error instanceof HerdrToolError);
				assert.equal(error.tag, "HerdrServerError");
				assert.match(error.message, /^HerdrServerError: .*pane_not_found/);
				return true;
			});
		} finally {
			reply = () => undefined;
		}
	});

	test("SDK input validation failures carry their tag", async () => {
		await assert.rejects(callTool(registered.tools, "herdr_agents_get", { paneId, name }), (error: unknown) => {
			assert.ok(error instanceof HerdrToolError);
			assert.equal(error.tag, "HerdrInvalidInput");
			return true;
		});
	});

	test("requestTimeoutMs bounds a stalled call with HerdrRequestTimeout", async () => {
		reply = (request) => (request.method === "pane.read" ? { kind: "stall" } : undefined);
		try {
			const started = Date.now();
			await assert.rejects(
				callTool(registered.tools, "herdr_panes_read", { paneId, source: "visible", requestTimeoutMs: 100 }),
				(error: unknown) => error instanceof HerdrToolError && error.tag === "HerdrRequestTimeout",
			);
			assert.ok(Date.now() - started < 3_000);
		} finally {
			reply = () => undefined;
		}
	});

	test("a server wait's timeoutMs extends the default request deadline past the SDK default", async () => {
		reply = (request) => (request.method === "pane.wait_for_output" ? { kind: "stall" } : undefined);
		try {
			const started = Date.now();
			// The call deadline is timeoutMs + 5000 ms, so it outlives the 5000 ms SDK default.
			const call = callTool(registered.tools, "herdr_panes_waitForOutput", {
				paneId,
				source: "recent",
				match: { type: "substring", value: "never" },
				timeoutMs: 1_000,
			});
			await assert.rejects(call, (error: unknown) => error instanceof HerdrToolError && error.tag === "HerdrRequestTimeout");
			const elapsed = Date.now() - started;
			assert.ok(elapsed >= 5_900, `deadline was ${elapsed} ms; expected timeoutMs + 5000`);
		} finally {
			reply = () => undefined;
		}
	});

	test("aborting the tool call interrupts the request", async () => {
		reply = (request) => (request.method === "pane.read" ? { kind: "stall" } : undefined);
		try {
			const controller = new AbortController();
			const call = callTool(registered.tools, "herdr_panes_read", { paneId, source: "visible" }, controller.signal);
			setTimeout(() => controller.abort(), 50);
			const started = Date.now();
			await assert.rejects(call, (error: unknown) => error instanceof HerdrToolError && error.tag === "Interrupted");
			assert.ok(Date.now() - started < 2_000);
		} finally {
			reply = () => undefined;
		}
	});
});

test("a missing socket rejects with HerdrTransportError", async () => {
	const missing = await startHerdrFixtureServer();
	const socketPath = missing.socketPath;
	await missing.close();
	const tools = new Map<string, ToolDefinition<any, any>>();
	const pi = {
		registerTool: (tool: ToolDefinition<any, any>) => tools.set(tool.name, tool),
		on: () => undefined,
	} as unknown as ExtensionAPI;
	const runtime = registerHerdrCodemodeTools(pi, () =>
		herdrSdkLayerFromOptions({ socketPath: HerdrAbsolutePath.make(socketPath) }),
	);
	try {
		await assert.rejects(callTool(tools, "herdr_server_ping", {}), (error: unknown) => {
			assert.ok(error instanceof HerdrToolError);
			assert.equal(error.tag, "HerdrTransportError");
			return true;
		});
	} finally {
		await runtime.dispose();
	}
});

test("tools register only inside Herdr unless forced", () => {
	assert.equal(shouldRegisterHerdrTools({}), false);
	assert.equal(shouldRegisterHerdrTools({ HERDR_ENV: "1" }), true);
	assert.equal(shouldRegisterHerdrTools({ HERDR_SOCKET_PATH: "/tmp/herdr.sock" }), true);
	assert.equal(shouldRegisterHerdrTools({ PI_HERDR_CODEMODE: "1" }), true);
	assert.equal(shouldRegisterHerdrTools({ HERDR_ENV: "1", PI_HERDR_CODEMODE: "0" }), false);
});
