/**
 * The Herdr operations exposed to codemode, one tool per SDK operation.
 *
 * Tool names mirror the SDK path: `herdr.panes.sendText` → `herdr_panes_sendText`. Every operation
 * is deferred: none is listed in the codemode description, and scripts find them through
 * `herdr_search`. Not exposed: `events.subscribe`, `clientShell.*`, and `server.sshAgent.*`, which
 * hold a connection open for a caller-owned scope.
 */
import { Effect, Schema } from "effect";
import type { ToolAnnotations } from "@earendil-works/pi-coding-agent";
import {
	Agent,
	AgentManifest,
	AgentManifestStatus,
	AgentName,
	AgentPromptInput,
	AgentStartInput,
	AgentStartResult,
	AgentViewClearInput,
	AgentViewSetInput,
	AgentViewState,
	AgentWaitInput,
	ClientWindowTitleResult,
	CommandPaneInput,
	CommandTabInput,
	ConfigReloadResult,
	EventMatch,
	EventWaitInput,
	HerdrCommandId,
	HerdrEvent,
	HerdrJsonValue,
	HerdrKeySequence,
	InstalledPlugin,
	IntegrationChangeResult,
	IntegrationInfo,
	IntegrationTarget,
	LayoutApplyInput,
	LayoutDescription,
	LayoutSetSplitRatioInput,
	LayoutTarget,
	NotificationShowInput,
	NotificationShowResult,
	Pane,
	PaneAgentReportInput,
	PaneAgentSessionReportInput,
	PaneClearAgentAuthorityInput,
	PaneCopyMotionInput,
	PaneCopyMotionResult,
	PaneCopySearchInput,
	PaneCopySearchResult,
	PaneCurrentInput,
	PaneDirection,
	PaneEdgesResult,
	PaneFocusDirectionInput,
	PaneFocusDirectionResult,
	PaneId,
	PaneInput,
	PaneInputRoutingInput,
	PaneLayoutSnapshot,
	PaneLinkActivateInput,
	PaneLinkActivatedResult,
	PaneLinkResolveInput,
	PaneLinkResolvedResult,
	PaneListInput,
	PaneMetadataReportInput,
	PaneMoveInput,
	PaneMoveResult,
	PaneNeighborResult,
	PaneOutputMatchResult,
	PaneProcessInfo,
	PaneReadInput,
	PaneReadResult,
	PaneReleaseAgentInput,
	PaneResizeInput,
	PaneResizeResult,
	PaneScrollInput,
	PaneSelectionReadInput,
	PaneSelectionResult,
	PaneSplitInput,
	PaneSwapInput,
	PaneSwapResult,
	PaneWaitForOutputInput,
	PaneZoomInput,
	PaneZoomResult,
	PingResult,
	PluginAction,
	PluginActionId,
	PluginActionInvocation,
	PluginActionInvokeInput,
	PluginCommandLog,
	PluginFilterInput,
	PluginId,
	PluginLinkInput,
	PluginLogListInput,
	PluginPane,
	PluginPaneCloseResult,
	PluginPaneOpenInput,
	PluginUnlinkResult,
	ProductAnnouncementDismissInput,
	ReleaseNotesDismissInput,
	ServerLiveHandoffInput,
	SessionSnapshot,
	Tab,
	TabCreateInput,
	TabCreateResult,
	TabId,
	TabListInput,
	TabMoveInput,
	Workspace,
	WorkspaceCreateOptions,
	WorkspaceCreateResult,
	WorkspaceId,
	WorkspaceMetadataReportInput,
	WorkspaceMoveBlockInput,
	WorkspaceMoveInput,
	WorktreeCreateInput,
	WorktreeCreateResult,
	WorktreeListInput,
	WorktreeListResult,
	WorktreeOpenInput,
	WorktreeOpenResult,
	WorktreeRemoveInput,
	WorktreeRemoveResult,
	type HerdrTransportRequestOptionsEncoded,
	type IHerdrSdk,
} from "./vendor/herdr-sdk/index.mjs";

/** One SDK operation exposed as the codemode tool `herdr_<name>`. */
export interface HerdrToolOperation {
	/** SDK path with `_` separators, such as `panes_sendText`. */
	readonly name: string;
	/** Model-facing description: what it does and returns, then the branch or next step. */
	readonly description: string;
	readonly annotations: ToolAnnotations;
	/** Named fields for SDK positional arguments; decoded before `run`. */
	readonly fields: Schema.Struct.Fields;
	/** SDK object input whose fields are top-level tool fields; the SDK decodes it. */
	readonly spread: Schema.Top | undefined;
	/** The SDK accepts the spread input as absent; an empty one is passed as `undefined`. */
	readonly spreadOptional: boolean;
	/** Spread fields the tool requires although the SDK input leaves them optional. */
	readonly requiredSpreadFields: readonly string[];
	/** Result schema, or `"void"` for operations that resolve to nothing. */
	readonly output: Schema.Top | "void";
	readonly run: (
		herdr: IHerdrSdk,
		fields: any,
		input: any,
		options: HerdrTransportRequestOptionsEncoded,
	) => Effect.Effect<unknown, unknown>;
}

interface HerdrToolOperationSpec<Fields extends Schema.Struct.Fields, Spread extends Schema.Top> {
	readonly name: string;
	readonly description: string;
	readonly readOnly?: boolean;
	readonly destructive?: boolean;
	readonly fields?: Fields;
	readonly spread?: Spread;
	readonly spreadOptional?: boolean;
	readonly requiredSpreadFields?: readonly string[];
	readonly output: Schema.Top | "void";
	readonly run: (
		herdr: IHerdrSdk,
		fields: Schema.Struct<Fields>["Type"],
		input: Spread["Encoded"],
		options: HerdrTransportRequestOptionsEncoded,
	) => Effect.Effect<unknown, unknown>;
}

const NoSpread = Schema.Struct({});

function operation<const Fields extends Schema.Struct.Fields = {}, Spread extends Schema.Top = typeof NoSpread>(
	spec: HerdrToolOperationSpec<Fields, Spread>,
): HerdrToolOperation {
	return {
		name: spec.name,
		description: spec.description,
		annotations: {
			readOnlyHint: spec.readOnly ?? false,
			...(spec.readOnly ? {} : { destructiveHint: spec.destructive ?? false }),
			openWorldHint: false,
		},
		fields: spec.fields ?? {},
		spread: spec.spread,
		spreadOptional: spec.spreadOptional ?? false,
		requiredSpreadFields: spec.requiredSpreadFields ?? [],
		output: spec.output,
		run: spec.run,
	};
}

/**
 * Herdr's error code when a server-side wait reaches its `timeoutMs` without a match: pane output
 * (`pane.wait_for_output`), agent status (`agent.wait`), and events (`events.wait`). Herdr reports
 * its own internal deadlines as `server_unavailable`, so on these methods `timeout` only ever means
 * the wait expired.
 */
const HERDR_WAIT_TIMEOUT_CODE = "timeout";

function isHerdrWaitTimeout(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { _tag?: unknown })._tag === "HerdrServerError" &&
		(error as { serverCode?: unknown }).serverCode === HERDR_WAIT_TIMEOUT_CODE
	);
}

/**
 * Waits resolve to an outcome instead of rejecting on expiry: `{ timedOut: true }`, or
 * `{ timedOut: false, [key]: value }`. Other failures still reject.
 */
function resolveHerdrWaitOutcome<Key extends string, A, E>(key: Key, wait: Effect.Effect<A, E>) {
	return wait.pipe(
		Effect.map((value) => ({ timedOut: false as const, [key]: value })),
		Effect.catchIf(
			(error: E): error is E => isHerdrWaitTimeout(error),
			() => Effect.succeed({ timedOut: true as const }),
		),
	);
}

function herdrWaitOutcomeSchema(key: string, value: Schema.Top) {
	return Schema.Union([
		Schema.Struct({ timedOut: Schema.Literal(false), [key]: value }),
		Schema.Struct({ timedOut: Schema.Literal(true) }),
	]);
}

const optionalPaneId = Schema.optionalKey(PaneId);

/** Agent selector fields: exactly one of `paneId` or `name`; the SDK rejects anything else. */
const agentTargetFields = { paneId: optionalPaneId, name: Schema.optionalKey(AgentName) };

function agentTargetOf(fields: { readonly paneId?: PaneId; readonly name?: AgentName }) {
	return fields as Parameters<IHerdrSdk["agents"]["get"]>[0];
}

/** Layout selector fields: at most one of `tabId` or `paneId`; neither means the focused tab. */
const layoutTargetFields = { tabId: Schema.optionalKey(TabId), paneId: optionalPaneId };

function layoutTargetOf(fields: { readonly tabId?: TabId; readonly paneId?: PaneId }) {
	return fields.tabId === undefined && fields.paneId === undefined
		? undefined
		: (fields as Parameters<IHerdrSdk["layouts"]["export"]>[0]);
}

export const herdrToolOperations: readonly HerdrToolOperation[] = [
	// ── Core loop: snapshot → split → send → wait → read; then common entry points ───────
	operation({
		name: "session_snapshot",
		readOnly: true,
		description:
			"Snapshot every workspace, tab, pane, and agent with IDs, labels, cwd, and focus. Other herdr tools take IDs from here.",
		output: SessionSnapshot,
		run: (herdr, _fields, _input, options) => herdr.session.snapshot(options),
	}),
	operation({
		name: "workspaces_createInDirectory",
		description: "Create a workspace in an absolute directory; returns it with its first tab and root pane.",
		fields: { cwd: Schema.String },
		spread: WorkspaceCreateOptions,
		spreadOptional: true,
		output: WorkspaceCreateResult,
		run: (herdr, { cwd }, input, options) => herdr.workspaces.createInDirectory(cwd, input, options),
	}),
	operation({
		name: "tabs_create",
		description: "Create a tab in a workspace; returns it with its root pane.",
		spread: TabCreateInput,
		spreadOptional: true,
		output: TabCreateResult,
		run: (herdr, _fields, input, options) => herdr.tabs.create(input, options),
	}),
	operation({
		name: "panes_split",
		description: "Split a pane (default: the focused pane); returns the new pane.",
		fields: { paneId: optionalPaneId },
		spread: PaneSplitInput,
		output: Pane,
		run: (herdr, { paneId }, input, options) => herdr.panes.split(paneId, input, options),
	}),
	operation({
		name: "panes_sendText",
		description:
			"Send literal text to a pane. End with \\n to run a command, then wait with herdr_panes_waitForOutput.",
		fields: { paneId: PaneId, text: Schema.String },
		output: "void",
		run: (herdr, { paneId, text }, _input, options) => herdr.panes.sendText(paneId, text, options),
	}),
	operation({
		name: "panes_sendKeys",
		description: 'Send named keys such as "Enter", "C-c", or "Up" to a pane. For literal text use herdr_panes_sendText.',
		fields: { paneId: PaneId, keys: HerdrKeySequence },
		output: "void",
		run: (herdr, { paneId, keys }, _input, options) => herdr.panes.sendKeys(paneId, keys, options),
	}),
	operation({
		name: "panes_waitForOutput",
		readOnly: true,
		description:
			"Wait until pane output matches a substring or regex; `match` has the matched line and a read. Use after sending a command.",
		fields: { paneId: PaneId },
		spread: PaneWaitForOutputInput,
		requiredSpreadFields: ["timeoutMs"],
		output: herdrWaitOutcomeSchema("match", PaneOutputMatchResult),
		run: (herdr, { paneId }, input, options) =>
			resolveHerdrWaitOutcome("match", herdr.panes.waitForOutput(paneId, input, options)),
	}),
	operation({
		name: "panes_read",
		readOnly: true,
		description:
			"Read a pane's visible screen or recent scrollback. For output that has not appeared yet, use herdr_panes_waitForOutput.",
		fields: { paneId: PaneId },
		spread: PaneReadInput,
		output: PaneReadResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.read(paneId, input, options),
	}),
	operation({
		name: "panes_close",
		destructive: true,
		description: "Close a pane and end its process.",
		fields: { paneId: PaneId },
		output: "void",
		run: (herdr, { paneId }, _input, options) => herdr.panes.close(paneId, options),
	}),
	operation({
		name: "agents_start",
		description: "Launch a named agent of a kind (pi, claude, codex, …) in a pane; returns the agent.",
		spread: AgentStartInput,
		output: AgentStartResult,
		run: (herdr, _fields, input, options) => herdr.agents.start(input, options),
	}),
	operation({
		name: "agents_prompt",
		description:
			"Send a prompt to an agent selected by paneId or name; returns the agent. Then wait with herdr_agents_wait.",
		fields: agentTargetFields,
		spread: AgentPromptInput,
		output: Agent,
		run: (herdr, fields, input, options) => herdr.agents.prompt(agentTargetOf(fields), input, options),
	}),
	operation({
		name: "agents_wait",
		readOnly: true,
		description:
			"Wait for an agent (by paneId or name) to reach a status in `until`, such as done or blocked.",
		fields: agentTargetFields,
		spread: AgentWaitInput,
		requiredSpreadFields: ["timeoutMs"],
		output: herdrWaitOutcomeSchema("agent", Agent),
		run: (herdr, fields, input, options) =>
			resolveHerdrWaitOutcome("agent", herdr.agents.wait(agentTargetOf(fields), input, options)),
	}),
	operation({
		name: "agents_read",
		readOnly: true,
		description: "Read the terminal output of an agent selected by paneId or name.",
		fields: agentTargetFields,
		spread: PaneReadInput,
		output: PaneReadResult,
		run: (herdr, fields, input, options) => herdr.agents.read(agentTargetOf(fields), input, options),
	}),

	// ── Server, session, client ──────────────────────────────────────────────────────
	operation({
		name: "server_ping",
		readOnly: true,
		description: "Ping the Herdr server; returns its version and protocol.",
		output: PingResult,
		run: (herdr, _fields, _input, options) => herdr.server.ping(options),
	}),
	operation({
		name: "server_stop",
		destructive: true,
		description: "Stop the Herdr server gracefully, ending every workspace and pane.",
		output: "void",
		run: (herdr, _fields, _input, options) => herdr.server.stop(options),
	}),
	operation({
		name: "server_liveHandoff",
		destructive: true,
		description: "Hand the running Herdr server over to a compatible executable.",
		spread: ServerLiveHandoffInput,
		spreadOptional: true,
		output: "void",
		run: (herdr, _fields, input, options) => herdr.server.liveHandoff(input, options),
	}),
	operation({
		name: "server_reloadConfig",
		description: "Reload the Herdr server configuration.",
		output: ConfigReloadResult,
		run: (herdr, _fields, _input, options) => herdr.server.reloadConfig(options),
	}),
	operation({
		name: "server_getAgentManifests",
		readOnly: true,
		description: "Get the agent manifests Herdr uses to detect and launch agents.",
		output: AgentManifestStatus,
		run: (herdr, _fields, _input, options) => herdr.server.getAgentManifests(options),
	}),
	operation({
		name: "server_reloadAgentManifests",
		description: "Reload agent manifests from disk; returns all of them.",
		output: Schema.Array(AgentManifest),
		run: (herdr, _fields, _input, options) => herdr.server.reloadAgentManifests(options),
	}),
	operation({
		name: "notifications_show",
		description: "Show a notification in the foreground Herdr client.",
		spread: NotificationShowInput,
		output: NotificationShowResult,
		run: (herdr, _fields, input, options) => herdr.notifications.show(input, options),
	}),
	operation({
		name: "client_windowTitle_set",
		description: "Set the terminal window title of the foreground Herdr client.",
		fields: { title: Schema.String },
		output: ClientWindowTitleResult,
		run: (herdr, { title }, _input, options) => herdr.client.windowTitle.set(title, options),
	}),
	operation({
		name: "client_windowTitle_clear",
		description: "Clear the window title override of the foreground Herdr client.",
		output: ClientWindowTitleResult,
		run: (herdr, _fields, _input, options) => herdr.client.windowTitle.clear(options),
	}),
	operation({
		name: "popups_close",
		description: "Close the active popup in the foreground Herdr client.",
		output: "void",
		run: (herdr, _fields, _input, options) => herdr.popups.close(options),
	}),
	operation({
		name: "productAnnouncements_dismiss",
		description: "Dismiss a Herdr product announcement.",
		spread: ProductAnnouncementDismissInput,
		output: "void",
		run: (herdr, _fields, input, options) => herdr.productAnnouncements.dismiss(input, options),
	}),
	operation({
		name: "releaseNotes_dismiss",
		description: "Dismiss Herdr release notes for a version.",
		spread: ReleaseNotesDismissInput,
		output: "void",
		run: (herdr, _fields, input, options) => herdr.releaseNotes.dismiss(input, options),
	}),

	// ── Commands ────────────────────────────────────────────────────────────────────
	operation({
		name: "commands_invoke",
		description: "Run a Herdr command (keybinding action) by ID.",
		fields: { commandId: HerdrCommandId },
		output: "void",
		run: (herdr, { commandId }, _input, options) => herdr.commands.invoke(commandId, options),
	}),
	operation({
		name: "commands_invokeInWorkspace",
		description: "Run a Herdr command (keybinding action) in a workspace.",
		fields: { commandId: HerdrCommandId, workspaceId: WorkspaceId },
		output: "void",
		run: (herdr, { commandId, workspaceId }, _input, options) =>
			herdr.commands.invokeInWorkspace(commandId, workspaceId, options),
	}),
	operation({
		name: "commands_invokeInTab",
		description: "Run a Herdr command (keybinding action) in a tab.",
		fields: { commandId: HerdrCommandId, tabId: TabId },
		spread: CommandTabInput,
		spreadOptional: true,
		output: "void",
		run: (herdr, { commandId, tabId }, input, options) =>
			herdr.commands.invokeInTab(commandId, tabId, input, options),
	}),
	operation({
		name: "commands_invokeInPane",
		description: "Run a Herdr command (keybinding action) in a pane.",
		fields: { commandId: HerdrCommandId, paneId: PaneId },
		spread: CommandPaneInput,
		spreadOptional: true,
		output: "void",
		run: (herdr, { commandId, paneId }, input, options) =>
			herdr.commands.invokeInPane(commandId, paneId, input, options),
	}),

	// ── Workspaces ──────────────────────────────────────────────────────────────────
	operation({
		name: "workspaces_create",
		description:
			"Create a workspace in the server's default directory; returns it with its first tab and root pane. For a chosen directory use herdr_workspaces_createInDirectory.",
		spread: WorkspaceCreateOptions,
		spreadOptional: true,
		output: WorkspaceCreateResult,
		run: (herdr, _fields, input, options) => herdr.workspaces.create(input, options),
	}),
	operation({
		name: "workspaces_createFromWorkspace",
		description: "Create a workspace using another workspace's directory; does not copy its tabs or panes.",
		fields: { sourceWorkspaceId: WorkspaceId },
		spread: WorkspaceCreateOptions,
		spreadOptional: true,
		output: WorkspaceCreateResult,
		run: (herdr, { sourceWorkspaceId }, input, options) =>
			herdr.workspaces.createFromWorkspace(sourceWorkspaceId, input, options),
	}),
	operation({
		name: "workspaces_list",
		readOnly: true,
		description: "List workspaces in display order.",
		output: Schema.Array(Workspace),
		run: (herdr, _fields, _input, options) => herdr.workspaces.list(options),
	}),
	operation({
		name: "workspaces_get",
		readOnly: true,
		description: "Get one workspace.",
		fields: { workspaceId: WorkspaceId },
		output: Workspace,
		run: (herdr, { workspaceId }, _input, options) => herdr.workspaces.get(workspaceId, options),
	}),
	operation({
		name: "workspaces_focus",
		description: "Focus a workspace; returns it.",
		fields: { workspaceId: WorkspaceId },
		output: Workspace,
		run: (herdr, { workspaceId }, _input, options) => herdr.workspaces.focus(workspaceId, options),
	}),
	operation({
		name: "workspaces_rename",
		description: "Rename a workspace (replace its label).",
		fields: { workspaceId: WorkspaceId, label: Schema.String },
		output: Workspace,
		run: (herdr, { workspaceId, label }, _input, options) => herdr.workspaces.rename(workspaceId, label, options),
	}),
	operation({
		name: "workspaces_move",
		description: "Move a workspace to an index in the workspace list; returns the reordered list.",
		fields: { workspaceId: WorkspaceId },
		spread: WorkspaceMoveInput,
		output: Schema.Array(Workspace),
		run: (herdr, { workspaceId }, input, options) => herdr.workspaces.move(workspaceId, input, options),
	}),
	operation({
		name: "workspaces_moveBlock",
		description: "Move a contiguous block of workspaces before another workspace; returns the reordered list.",
		fields: { workspaceIds: Schema.Array(WorkspaceId) },
		spread: WorkspaceMoveBlockInput,
		spreadOptional: true,
		output: Schema.Array(Workspace),
		run: (herdr, { workspaceIds }, input, options) => herdr.workspaces.moveBlock([...workspaceIds], input, options),
	}),
	operation({
		name: "workspaces_reportMetadata",
		description: "Set or remove source-owned metadata tokens shown on a workspace.",
		fields: { workspaceId: WorkspaceId },
		spread: WorkspaceMetadataReportInput,
		output: "void",
		run: (herdr, { workspaceId }, input, options) => herdr.workspaces.reportMetadata(workspaceId, input, options),
	}),
	operation({
		name: "workspaces_close",
		destructive: true,
		description: "Close a workspace and every pane in it.",
		fields: { workspaceId: WorkspaceId },
		output: "void",
		run: (herdr, { workspaceId }, _input, options) => herdr.workspaces.close(workspaceId, options),
	}),
	operation({
		name: "workspaces_closeGroup",
		destructive: true,
		description: "Close the contiguous group of workspaces containing a workspace.",
		fields: { workspaceId: WorkspaceId },
		output: "void",
		run: (herdr, { workspaceId }, _input, options) => herdr.workspaces.closeGroup(workspaceId, options),
	}),

	// ── Worktrees ───────────────────────────────────────────────────────────────────
	operation({
		name: "worktrees_list",
		readOnly: true,
		description: "List the Git worktrees of a repository (by workspaceId or cwd).",
		spread: WorktreeListInput,
		spreadOptional: true,
		output: WorktreeListResult,
		run: (herdr, _fields, input, options) => herdr.worktrees.list(input, options),
	}),
	operation({
		name: "worktrees_create",
		description: "Create a Git worktree and a workspace for it; returns the worktree, workspace, tab, and root pane.",
		spread: WorktreeCreateInput,
		spreadOptional: true,
		output: WorktreeCreateResult,
		run: (herdr, _fields, input, options) => herdr.worktrees.create(input, options),
	}),
	operation({
		name: "worktrees_open",
		description: "Open an existing Git worktree (by path or branch) in a workspace.",
		spread: WorktreeOpenInput,
		output: WorktreeOpenResult,
		run: (herdr, _fields, input, options) => herdr.worktrees.open(input, options),
	}),
	operation({
		name: "worktrees_remove",
		destructive: true,
		description: "Remove the Git worktree of a workspace from disk.",
		fields: { workspaceId: WorkspaceId },
		spread: WorktreeRemoveInput,
		spreadOptional: true,
		output: WorktreeRemoveResult,
		run: (herdr, { workspaceId }, input, options) => herdr.worktrees.remove(workspaceId, input, options),
	}),

	// ── Tabs ────────────────────────────────────────────────────────────────────────
	operation({
		name: "tabs_list",
		readOnly: true,
		description: "List tabs, optionally in one workspace.",
		spread: TabListInput,
		spreadOptional: true,
		output: Schema.Array(Tab),
		run: (herdr, _fields, input, options) => herdr.tabs.list(input, options),
	}),
	operation({
		name: "tabs_get",
		readOnly: true,
		description: "Get one tab.",
		fields: { tabId: TabId },
		output: Tab,
		run: (herdr, { tabId }, _input, options) => herdr.tabs.get(tabId, options),
	}),
	operation({
		name: "tabs_focus",
		description: "Focus a tab; returns it.",
		fields: { tabId: TabId },
		output: Tab,
		run: (herdr, { tabId }, _input, options) => herdr.tabs.focus(tabId, options),
	}),
	operation({
		name: "tabs_rename",
		description: "Rename a tab (replace its label).",
		fields: { tabId: TabId, label: Schema.String },
		output: Tab,
		run: (herdr, { tabId, label }, _input, options) => herdr.tabs.rename(tabId, label, options),
	}),
	operation({
		name: "tabs_move",
		description: "Move a tab to an index within its workspace; returns the reordered tabs.",
		fields: { tabId: TabId },
		spread: TabMoveInput,
		output: Schema.Array(Tab),
		run: (herdr, { tabId }, input, options) => herdr.tabs.move(tabId, input, options),
	}),
	operation({
		name: "tabs_close",
		destructive: true,
		description: "Close a tab and every pane in it.",
		fields: { tabId: TabId },
		output: "void",
		run: (herdr, { tabId }, _input, options) => herdr.tabs.close(tabId, options),
	}),

	// ── Panes ───────────────────────────────────────────────────────────────────────
	operation({
		name: "panes_list",
		readOnly: true,
		description: "List panes, optionally in one workspace.",
		spread: PaneListInput,
		spreadOptional: true,
		output: Schema.Array(Pane),
		run: (herdr, _fields, input, options) => herdr.panes.list(input, options),
	}),
	operation({
		name: "panes_get",
		readOnly: true,
		description: "Get one pane.",
		fields: { paneId: PaneId },
		output: Pane,
		run: (herdr, { paneId }, _input, options) => herdr.panes.get(paneId, options),
	}),
	operation({
		name: "panes_current",
		readOnly: true,
		description: "Get the caller's pane (callerPaneId) or the focused pane.",
		spread: PaneCurrentInput,
		spreadOptional: true,
		output: Pane,
		run: (herdr, _fields, input, options) => herdr.panes.current(input, options),
	}),
	operation({
		name: "panes_focus",
		description: "Focus a pane; returns it.",
		fields: { paneId: PaneId },
		output: Pane,
		run: (herdr, { paneId }, _input, options) => herdr.panes.focus(paneId, options),
	}),
	operation({
		name: "panes_focusDirection",
		description: "Move focus to the neighboring pane in a direction.",
		fields: { direction: PaneDirection },
		spread: PaneFocusDirectionInput,
		spreadOptional: true,
		output: PaneFocusDirectionResult,
		run: (herdr, { direction }, input, options) => herdr.panes.focusDirection(direction, input, options),
	}),
	operation({
		name: "panes_rename",
		description: "Rename a pane (replace its label); null clears it.",
		fields: { paneId: PaneId, label: Schema.NullOr(Schema.String) },
		output: Pane,
		run: (herdr, { paneId, label }, _input, options) => herdr.panes.rename(paneId, label, options),
	}),
	operation({
		name: "panes_sendInput",
		description: "Send text and named keys to a pane as one input. For only text or only keys use herdr_panes_sendText or herdr_panes_sendKeys.",
		fields: { paneId: PaneId },
		spread: PaneInput,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.sendInput(paneId, input, options),
	}),
	operation({
		name: "panes_clear",
		destructive: true,
		description: "Clear a pane's screen and scrollback, keeping the prompt line; full-screen apps are left alone.",
		fields: { paneId: PaneId },
		output: "void",
		run: (herdr, { paneId }, _input, options) => herdr.panes.clear(paneId, options),
	}),
	operation({
		name: "panes_scroll",
		description: "Scroll a pane to an offset from the bottom of its scrollback; returns the pane.",
		fields: { paneId: PaneId },
		spread: PaneScrollInput,
		output: Pane,
		run: (herdr, { paneId }, input, options) => herdr.panes.scroll(paneId, input, options),
	}),
	operation({
		name: "panes_editScrollback",
		description: "Open a pane's scrollback in the configured editor.",
		fields: { paneId: PaneId },
		output: "void",
		run: (herdr, { paneId }, _input, options) => herdr.panes.editScrollback(paneId, options),
	}),
	operation({
		name: "panes_swap",
		description: "Swap two panes: a pane with its neighbor in a direction, or sourcePaneId with targetPaneId.",
		spread: PaneSwapInput,
		output: PaneSwapResult,
		run: (herdr, _fields, input, options) => herdr.panes.swap(input, options),
	}),
	operation({
		name: "panes_move",
		description: "Move a pane to another tab, a new tab, or a new workspace.",
		fields: { paneId: PaneId },
		spread: PaneMoveInput,
		output: PaneMoveResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.move(paneId, input, options),
	}),
	operation({
		name: "panes_zoom",
		description: "Toggle or set zoom (fullscreen within its tab) for a pane.",
		fields: { paneId: optionalPaneId },
		spread: PaneZoomInput,
		spreadOptional: true,
		output: PaneZoomResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.zoom(paneId, input, options),
	}),
	operation({
		name: "panes_resize",
		description: "Resize a pane by terminal cells in a direction.",
		fields: { direction: PaneDirection },
		spread: PaneResizeInput,
		spreadOptional: true,
		output: PaneResizeResult,
		run: (herdr, { direction }, input, options) => herdr.panes.resize(direction, input, options),
	}),
	operation({
		name: "panes_layout",
		readOnly: true,
		description: "Get the geometry of every pane in a pane's tab.",
		fields: { paneId: optionalPaneId },
		output: PaneLayoutSnapshot,
		run: (herdr, { paneId }, _input, options) => herdr.panes.layout(paneId, options),
	}),
	operation({
		name: "panes_neighbor",
		readOnly: true,
		description: "Find the neighboring pane in a direction.",
		fields: { paneId: optionalPaneId, direction: PaneDirection },
		output: PaneNeighborResult,
		run: (herdr, { paneId, direction }, _input, options) => herdr.panes.neighbor(paneId, direction, options),
	}),
	operation({
		name: "panes_edges",
		readOnly: true,
		description: "Report which tab edges a pane touches.",
		fields: { paneId: optionalPaneId },
		output: PaneEdgesResult,
		run: (herdr, { paneId }, _input, options) => herdr.panes.edges(paneId, options),
	}),
	operation({
		name: "panes_processInfo",
		readOnly: true,
		description: "Get a pane's foreground process and process tree.",
		fields: { paneId: optionalPaneId },
		output: PaneProcessInfo,
		run: (herdr, { paneId }, _input, options) => herdr.panes.processInfo(paneId, options),
	}),
	operation({
		name: "panes_setInputRouting",
		description: "Choose whether right-click in a pane goes to Herdr or the pane's application.",
		fields: { paneId: PaneId },
		spread: PaneInputRoutingInput,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.setInputRouting(paneId, input, options),
	}),
	operation({
		name: "panes_selection_read",
		readOnly: true,
		description: "Read the text between two absolute cell positions in a pane.",
		fields: { paneId: PaneId },
		spread: PaneSelectionReadInput,
		output: PaneSelectionResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.selection.read(paneId, input, options),
	}),
	operation({
		name: "panes_copyMotion",
		readOnly: true,
		description: "Compute where a copy-mode cursor motion lands in a pane, without typing input.",
		fields: { paneId: PaneId },
		spread: PaneCopyMotionInput,
		output: PaneCopyMotionResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.copyMotion(paneId, input, options),
	}),
	operation({
		name: "panes_copySearch",
		readOnly: true,
		description: "Search a pane's content for text from a cursor; returns match ranges.",
		fields: { paneId: PaneId },
		spread: PaneCopySearchInput,
		output: PaneCopySearchResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.copySearch(paneId, input, options),
	}),
	operation({
		name: "panes_link_resolve",
		readOnly: true,
		description: "Resolve the link (URL or path) under a cell in a pane, without opening it.",
		fields: { paneId: PaneId },
		spread: PaneLinkResolveInput,
		output: PaneLinkResolvedResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.link.resolve(paneId, input, options),
	}),
	operation({
		name: "panes_link_activate",
		description: "Activate the link under a cell in a pane through a matching plugin.",
		fields: { paneId: PaneId },
		spread: PaneLinkActivateInput,
		output: PaneLinkActivatedResult,
		run: (herdr, { paneId }, input, options) => herdr.panes.link.activate(paneId, input, options),
	}),
	operation({
		name: "panes_reportAgent",
		description: "Report the agent running in a pane and its state, as an agent integration does.",
		fields: { paneId: PaneId },
		spread: PaneAgentReportInput,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.reportAgent(paneId, input, options),
	}),
	operation({
		name: "panes_reportAgentSession",
		description: "Attach an agent session reference (and resume command) to a pane.",
		fields: { paneId: PaneId },
		spread: PaneAgentSessionReportInput,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.reportAgentSession(paneId, input, options),
	}),
	operation({
		name: "panes_reportMetadata",
		description: "Set or remove source-owned pane metadata: title, display agent, state labels, tokens.",
		fields: { paneId: PaneId },
		spread: PaneMetadataReportInput,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.reportMetadata(paneId, input, options),
	}),
	operation({
		name: "panes_clearAgentAuthority",
		description: "Clear which source may report agent state for a pane.",
		fields: { paneId: PaneId },
		spread: PaneClearAgentAuthorityInput,
		spreadOptional: true,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.clearAgentAuthority(paneId, input, options),
	}),
	operation({
		name: "panes_releaseAgent",
		description: "Release one source's agent report for a pane.",
		fields: { paneId: PaneId },
		spread: PaneReleaseAgentInput,
		output: "void",
		run: (herdr, { paneId }, input, options) => herdr.panes.releaseAgent(paneId, input, options),
	}),

	// ── Layouts ─────────────────────────────────────────────────────────────────────
	operation({
		name: "layouts_export",
		readOnly: true,
		description: "Export a tab's pane layout (by tabId or paneId; default focused tab) as a reusable layout tree.",
		spread: LayoutTarget,
		spreadOptional: true,
		output: LayoutDescription,
		run: (herdr, _fields, input, options) => herdr.layouts.export(input, options),
	}),
	operation({
		name: "layouts_apply",
		destructive: true,
		description: "Create a tab, or replace one (replaceTabId), from a layout tree.",
		spread: LayoutApplyInput,
		output: LayoutDescription,
		run: (herdr, _fields, input, options) => herdr.layouts.apply(input, options),
	}),
	operation({
		name: "layouts_setSplitRatio",
		description: "Set the ratio of one split, addressed by a path of booleans, in a tab's layout.",
		fields: layoutTargetFields,
		spread: LayoutSetSplitRatioInput,
		output: LayoutDescription,
		run: (herdr, fields, input, options) => herdr.layouts.setSplitRatio(layoutTargetOf(fields), input, options),
	}),

	// ── Agents ──────────────────────────────────────────────────────────────────────
	operation({
		name: "agents_list",
		readOnly: true,
		description: "List every agent Herdr detected or launched, with status.",
		output: Schema.Array(Agent),
		run: (herdr, _fields, _input, options) => herdr.agents.list(options),
	}),
	operation({
		name: "agents_get",
		readOnly: true,
		description: "Get an agent by paneId or name.",
		fields: agentTargetFields,
		output: Agent,
		run: (herdr, fields, _input, options) => herdr.agents.get(agentTargetOf(fields), options),
	}),
	operation({
		name: "agents_explain",
		readOnly: true,
		description: "Explain how Herdr detected an agent's status (diagnostics JSON).",
		fields: agentTargetFields,
		output: HerdrJsonValue,
		run: (herdr, fields, _input, options) => herdr.agents.explain(agentTargetOf(fields), options),
	}),
	operation({
		name: "agents_sendKeys",
		description: "Send named keys to an agent selected by paneId or name.",
		fields: { ...agentTargetFields, keys: HerdrKeySequence },
		output: "void",
		run: (herdr, { keys, ...target }, _input, options) => herdr.agents.sendKeys(agentTargetOf(target), keys, options),
	}),
	operation({
		name: "agents_rename",
		description: "Assign (newName) or clear (null) the stable name of an agent selected by paneId or name.",
		fields: { ...agentTargetFields, newName: Schema.NullOr(AgentName) },
		output: Agent,
		run: (herdr, { newName, ...target }, _input, options) =>
			herdr.agents.rename(agentTargetOf(target), newName, options),
	}),
	operation({
		name: "agents_focus",
		description: "Focus the pane of an agent selected by paneId or name.",
		fields: agentTargetFields,
		output: Agent,
		run: (herdr, fields, _input, options) => herdr.agents.focus(agentTargetOf(fields), options),
	}),
	operation({
		name: "agents_view_set",
		description: "Set the foreground client's agent view: filters and sort order for the agent list.",
		spread: AgentViewSetInput,
		output: AgentViewState,
		run: (herdr, _fields, input, options) => herdr.agents.view.set(input, options),
	}),
	operation({
		name: "agents_view_clear",
		description: "Clear the foreground client's agent view.",
		spread: AgentViewClearInput,
		spreadOptional: true,
		output: AgentViewState,
		run: (herdr, _fields, input, options) => herdr.agents.view.clear(input, options),
	}),

	// ── Events ──────────────────────────────────────────────────────────────────────
	operation({
		name: "events_wait",
		readOnly: true,
		description:
			"Wait for one Herdr event matching `match`, such as a pane exiting or an agent status change; `event` is the event.",
		// The SDK takes the encoded match; decoding would turn its optional fields into Options.
		fields: { match: Schema.toEncoded(EventMatch) },
		spread: EventWaitInput,
		requiredSpreadFields: ["timeoutMs"],
		output: herdrWaitOutcomeSchema("event", HerdrEvent),
		run: (herdr, { match }, input, options) =>
			resolveHerdrWaitOutcome("event", herdr.events.wait(match, input, options)),
	}),

	// ── Integrations ────────────────────────────────────────────────────────────────
	operation({
		name: "integrations_list",
		readOnly: true,
		description: "List agent integrations (hooks Herdr installs into agents) and whether each is installed and current.",
		output: Schema.Array(IntegrationInfo),
		run: (herdr, _fields, _input, options) => herdr.integrations.list(options),
	}),
	operation({
		name: "integrations_install",
		description: "Install or update a built-in agent integration.",
		fields: { integration: IntegrationTarget },
		output: IntegrationChangeResult,
		run: (herdr, { integration }, _input, options) => herdr.integrations.install(integration, options),
	}),
	operation({
		name: "integrations_uninstall",
		destructive: true,
		description: "Remove a built-in agent integration.",
		fields: { integration: IntegrationTarget },
		output: IntegrationChangeResult,
		run: (herdr, { integration }, _input, options) => herdr.integrations.uninstall(integration, options),
	}),

	// ── Plugins ─────────────────────────────────────────────────────────────────────
	operation({
		name: "plugins_list",
		readOnly: true,
		description: "List installed Herdr plugins, optionally one pluginId.",
		spread: PluginFilterInput,
		spreadOptional: true,
		output: Schema.Array(InstalledPlugin),
		run: (herdr, _fields, input, options) => herdr.plugins.list(input, options),
	}),
	operation({
		name: "plugins_link",
		description: "Install a Herdr plugin by linking its manifest directory (absolute path).",
		spread: PluginLinkInput,
		output: InstalledPlugin,
		run: (herdr, _fields, input, options) => herdr.plugins.link(input, options),
	}),
	operation({
		name: "plugins_unlink",
		destructive: true,
		description: "Uninstall (unlink) a Herdr plugin.",
		fields: { pluginId: PluginId },
		output: PluginUnlinkResult,
		run: (herdr, { pluginId }, _input, options) => herdr.plugins.unlink(pluginId, options),
	}),
	operation({
		name: "plugins_enable",
		description: "Enable a Herdr plugin.",
		fields: { pluginId: PluginId },
		output: InstalledPlugin,
		run: (herdr, { pluginId }, _input, options) => herdr.plugins.enable(pluginId, options),
	}),
	operation({
		name: "plugins_disable",
		description: "Disable a Herdr plugin.",
		fields: { pluginId: PluginId },
		output: InstalledPlugin,
		run: (herdr, { pluginId }, _input, options) => herdr.plugins.disable(pluginId, options),
	}),
	operation({
		name: "plugins_actions_list",
		readOnly: true,
		description: "List plugin actions, optionally for one pluginId.",
		spread: PluginFilterInput,
		spreadOptional: true,
		output: Schema.Array(PluginAction),
		run: (herdr, _fields, input, options) => herdr.plugins.actions.list(input, options),
	}),
	operation({
		name: "plugins_actions_invoke",
		description: "Invoke a plugin action by actionId; returns the invocation.",
		fields: { actionId: PluginActionId },
		spread: PluginActionInvokeInput,
		spreadOptional: true,
		output: PluginActionInvocation,
		run: (herdr, { actionId }, input, options) => herdr.plugins.actions.invoke(actionId, input, options),
	}),
	operation({
		name: "plugins_logs_list",
		readOnly: true,
		description: "List recent plugin command logs.",
		spread: PluginLogListInput,
		spreadOptional: true,
		output: Schema.Array(PluginCommandLog),
		run: (herdr, _fields, input, options) => herdr.plugins.logs.list(input, options),
	}),
	operation({
		name: "plugins_panes_open",
		description: "Open a plugin's UI as a popup, overlay, split, tab, or zoomed pane; returns the pane, or null for a popup.",
		fields: { pluginId: PluginId },
		spread: PluginPaneOpenInput,
		output: Schema.NullOr(PluginPane),
		run: (herdr, { pluginId }, input, options) => herdr.plugins.panes.open(pluginId, input, options),
	}),
	operation({
		name: "plugins_panes_focus",
		description: "Focus a plugin-owned pane.",
		fields: { paneId: PaneId },
		output: PluginPane,
		run: (herdr, { paneId }, _input, options) => herdr.plugins.panes.focus(paneId, options),
	}),
	operation({
		name: "plugins_panes_close",
		destructive: true,
		description: "Close a plugin-owned pane.",
		fields: { paneId: PaneId },
		output: PluginPaneCloseResult,
		run: (herdr, { paneId }, _input, options) => herdr.plugins.panes.close(paneId, options),
	}),
];
