/**
 * `herdr_search`: the one Herdr tool listed in the codemode description, after Cloudflare's Code
 * Mode MCP server (`search` + `execute`). Every operation tool is deferred, so the listing costs one
 * small declaration; scripts search here, read a signature with `describeTool(name)`, then call it.
 */
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import type { HerdrToolOperation } from "./herdr-tool-operations.ts";

export const HERDR_SEARCH_TOOL_NAME = "herdr_search";

/** Usage conventions shared by every Herdr tool; returned by an empty search and describeNamespace. */
export const herdrToolInstructions = `Find tools: herdr_search({ query, namespace?, limit? }) → describeTool(name) for the signature → tools.<name>(args). Names mirror @herdr/sdk: herdr_<sdkNamespace>_<method>, such as herdr_panes_sendText.
Keep discovery out of your context: search, describe, and call in one script, and return only the result you need.
Loop: herdr_session_snapshot → pick IDs → send → wait → read.
IDs: pane, tab, and workspace IDs come from herdr_session_snapshot or a create result. Agents are selected by paneId or name.
Run a command: herdr_panes_split for a fresh pane (or reuse one), herdr_panes_sendText({ paneId, text: "make test\\n" }), then herdr_panes_waitForOutput({ paneId, source: "recent", match: { type: "regex", value: "PASS|FAIL" }, timeoutMs: 60000 }), then herdr_panes_read for more context.
Drive an agent: herdr_agents_start({ name, kind, paneId }), herdr_agents_prompt({ name, text }), herdr_agents_wait({ name, until: ["done", "idle", "blocked"], timeoutMs }), then herdr_agents_read({ name, source: "recent" }).
New places: herdr_workspaces_createInDirectory({ cwd }) and herdr_tabs_create({ workspaceId }) return the new root pane.
Parameters: one flat object. SDK positional arguments become fields (paneId, workspaceId, …) and the SDK input object's fields sit beside them.
Waits (herdr_panes_waitForOutput, herdr_agents_wait, herdr_events_wait) require timeoutMs and resolve to { timedOut: true } when it expires, or { timedOut: false, match | agent | event } on success. Check timedOut before reading the value.
Deadlines: timeoutMs bounds a server-side wait; requestTimeoutMs bounds the call (default 5000 ms, or timeoutMs + 5000 when the call waits).
Results: the SDK's domain value as plain JSON; absent values are null; operations without a result resolve to null.
Failures reject. The message starts with the SDK error tag: HerdrServerError (the server rejected the request; the message includes its code, such as timeout or agent_prompt_stalled from herdr_agents_prompt with wait, neither of which proves the prompt was not delivered), HerdrInvalidInput, HerdrRequestTimeout (the outcome is uncertain: inspect state before retrying), HerdrTransportError, HerdrUnsupportedProtocol, HerdrConfigurationError, SchemaError (a malformed ID).
Destructive tools are marked destructive in search results: closes, panes_clear, layouts_apply, server_stop, server_liveHandoff, worktrees_remove, integrations_uninstall, plugins_unlink.
Not available as tools: event subscriptions (use herdr_events_wait), client shells, and SSH agent registration.`;

/** One search hit; `destructive` appears only on tools that close, remove, or replace things. */
export interface HerdrSearchHit {
	readonly name: string;
	readonly description: string;
	readonly destructive?: true;
}

/** One SDK namespace in the table of contents. */
export interface HerdrSearchNamespace {
	readonly name: string;
	readonly tools: number;
}

/**
 * What `herdr_search` resolves to. With neither query nor namespace: the usage instructions and a
 * table of contents. Otherwise: up to `limit` hits and `total`, the number that matched.
 */
export type HerdrSearchResult =
	| { readonly instructions: string; readonly namespaces: readonly HerdrSearchNamespace[] }
	| { readonly tools: readonly HerdrSearchHit[]; readonly total: number };

export interface HerdrSearchInput {
	readonly query?: string;
	/** SDK namespace such as "panes"; also matches nested ones such as "plugins" → plugins_panes_*. */
	readonly namespace?: string;
	readonly limit?: number;
}

export const HERDR_SEARCH_DEFAULT_LIMIT = 8;

/** SDK namespace of an operation: the first segment of its name, such as `panes`. */
function namespaceOf(operation: HerdrToolOperation): string {
	return operation.name.split("_")[0]!;
}

/** Lowercase words of a tool name and description; camelCase and `_` split into words. */
function searchWordsOf(text: string): string[] {
	return text
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 0);
}

function toSearchHit(operation: HerdrToolOperation): HerdrSearchHit {
	return {
		name: `herdr_${operation.name}`,
		description: operation.description,
		...(operation.annotations.destructiveHint === true ? { destructive: true as const } : {}),
	};
}

/**
 * Searches Herdr tools. Query words that prefix a word of the tool's name score 2, words found only
 * in its description score 1, so a tool beats one whose description merely mentions it. Without a
 * query, a namespace lists its tools in table order; without either, returns the table of contents.
 */
export function searchHerdrTools(operations: readonly HerdrToolOperation[], input: HerdrSearchInput = {}): HerdrSearchResult {
	const queryWords = searchWordsOf(input.query ?? "");
	const namespace = input.namespace?.trim();
	if (queryWords.length === 0 && !namespace) {
		const counts = new Map<string, number>();
		for (const operation of operations) counts.set(namespaceOf(operation), (counts.get(namespaceOf(operation)) ?? 0) + 1);
		return {
			instructions: herdrToolInstructions,
			namespaces: [...counts].map(([name, tools]) => ({ name, tools })),
		};
	}

	const inNamespace = namespace
		? operations.filter((operation) => operation.name === namespace || operation.name.startsWith(`${namespace}_`))
		: operations;
	const ranked =
		queryWords.length === 0
			? inNamespace
			: inNamespace
					.map((operation, index) => {
						const nameWords = searchWordsOf(operation.name);
						const descriptionWords = searchWordsOf(operation.description);
						const matches = (words: string[], queryWord: string) => words.some((word) => word.startsWith(queryWord));
						const score = queryWords.reduce(
							(total, queryWord) =>
								total + (matches(nameWords, queryWord) ? 2 : matches(descriptionWords, queryWord) ? 1 : 0),
							0,
						);
						return { operation, index, score };
					})
					.filter(({ score }) => score > 0)
					.sort((left, right) => right.score - left.score || left.index - right.index)
					.map(({ operation }) => operation);
	const limit = input.limit ?? HERDR_SEARCH_DEFAULT_LIMIT;
	return { tools: ranked.slice(0, limit).map(toSearchHit), total: ranked.length };
}

const herdrSearchParameters = {
	type: "object",
	properties: {
		query: { type: "string", description: "Words to match against tool names and descriptions." },
		namespace: { type: "string", description: 'SDK namespace such as "panes" or "agents".' },
		limit: { type: "integer", minimum: 1, description: `Maximum hits; default ${HERDR_SEARCH_DEFAULT_LIMIT}.` },
	},
	additionalProperties: false,
};

const herdrSearchOutput = {
	anyOf: [
		{
			type: "object",
			properties: {
				instructions: { type: "string" },
				namespaces: {
					type: "array",
					items: { type: "object", properties: { name: { type: "string" }, tools: { type: "number" } }, required: ["name", "tools"] },
				},
			},
			required: ["instructions", "namespaces"],
		},
		{
			type: "object",
			properties: {
				tools: {
					type: "array",
					items: {
						type: "object",
						properties: { name: { type: "string" }, description: { type: "string" }, destructive: { const: true } },
						required: ["name", "description"],
					},
				},
				total: { type: "number" },
			},
			required: ["tools", "total"],
		},
	],
};

/** The listed entry point: searches the deferred Herdr tools without touching the Herdr socket. */
export function toHerdrSearchToolDefinition(
	operations: readonly HerdrToolOperation[],
): Omit<ToolDefinition<TSchema, undefined>, "namespace"> {
	return {
		name: HERDR_SEARCH_TOOL_NAME,
		label: "herdr search",
		description:
			"Find Herdr tools for panes, tabs, workspaces, and agents. Call with no arguments first for usage instructions and the namespaces.",
		parameters: herdrSearchParameters as unknown as TSchema,
		outputSchema: herdrSearchOutput as unknown as TSchema,
		exposure: "codemode",
		annotations: { readOnlyHint: true, openWorldHint: false },
		async execute(_toolCallId, params) {
			const result = searchHerdrTools(operations, params as HerdrSearchInput);
			return {
				content: [{ type: "text", text: JSON.stringify(result) }],
				structuredContent: result as never,
				details: undefined,
			};
		},
	};
}
