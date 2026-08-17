import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

const HANDOFF_AGENT_START_TIMEOUT_MS = 30_000;
function buildContinueFromHandoffPrompt(
	sessionFile: string | undefined,
	sourceLeafEntryId: string,
): string {
	const sourceBranchInstructions =
		sessionFile === undefined
			? `The source branch ends at session tree entry ${JSON.stringify(sourceLeafEntryId)}. If the handoff leaves a blocking ambiguity, use available session or tree inspection capabilities to recover the needed context from that branch, then resume.`
			: `The source branch ends at session tree entry ${JSON.stringify(sourceLeafEntryId)} in ${JSON.stringify(sessionFile)}. If the handoff leaves a blocking ambiguity, inspect that JSONL with read or bash. Reconstruct the source branch by following parentId links from the entry ID; append order may include other branches. Recover the needed context, then resume.`;

	return `Open the handoff document identified in the branch summary. Resume the work by performing its next unfinished step.\n\n${sourceBranchInstructions}`;
}

function findFirstUserMessageEntryId(entries: readonly SessionEntry[]): string | undefined {
	for (const entry of entries) {
		if (entry.type === "message" && entry.message.role === "user") {
			return entry.id;
		}
	}
	return undefined;
}

function buildHandoffSkillCommand(focus: string): string {
	return focus.length === 0 ? "/skill:handoff" : `/skill:handoff ${focus}`;
}

function buildBranchSummaryInstructions(focus: string): string {
	const focusInstruction =
		focus.length === 0
			? ""
			: ` The next turn's focus is: ${focus}`;

	return `The source branch produced a handoff document. Include its exact absolute path so the next turn can open it. Keep the document as the source of truth; use the branch summary to orient the next turn toward continuing the work.${focusInstruction}`;
}

/** Registers `/handoff`, which writes a handoff document and continues from it on a summarized root branch. */
export default function registerHandoffExtension(pi: ExtensionAPI): void {
	const agentStartWaiters = new Set<() => void>();
	let handoffInProgress = false;

	pi.on("agent_start", () => {
		for (const resolveAgentStart of agentStartWaiters) {
			resolveAgentStart();
		}
		agentStartWaiters.clear();
	});

	const waitForNextAgentStart = (): Promise<void> =>
		new Promise((resolve, reject) => {
			const resolveAgentStart = (): void => {
				clearTimeout(timeout);
				resolve();
			};
			const timeout = setTimeout(() => {
				agentStartWaiters.delete(resolveAgentStart);
				reject(new Error("Handoff agent turn did not start within 30 seconds"));
			}, HANDOFF_AGENT_START_TIMEOUT_MS);

			agentStartWaiters.add(resolveAgentStart);
		});

	pi.registerCommand("handoff", {
		description: "Write a handoff document, summarize back to the first message, and continue",
		handler: async (args, ctx) => {
			if (handoffInProgress) {
				ctx.ui.notify("A handoff is already in progress", "warning");
				return;
			}
			handoffInProgress = true;

			try {
				await ctx.waitForIdle();

				if (!ctx.model) {
					ctx.ui.notify("Handoff requires a selected model", "error");
					return;
				}

				const providerAuth = await ctx.modelRegistry.getProviderAuth(ctx.model.provider);
				if (!providerAuth) {
					ctx.ui.notify("Handoff requires authentication for the selected model", "error");
					return;
				}

				const firstUserMessageEntryId = findFirstUserMessageEntryId(
					ctx.sessionManager.getBranch(),
				);
				if (!firstUserMessageEntryId) {
					ctx.ui.notify("There is no conversation to hand off", "warning");
					return;
				}

				const focus = args.trim();
				const agentStarted = waitForNextAgentStart();

				pi.sendUserMessage(buildHandoffSkillCommand(focus), {
					expandPromptTemplates: true,
				});

				await agentStarted;
				await ctx.waitForIdle();

				const sourceLeafEntryId = ctx.sessionManager.getLeafId();
				if (!sourceLeafEntryId) {
					ctx.ui.notify("Handoff source branch has no leaf entry", "error");
					return;
				}
				const sessionFile = ctx.sessionManager.getSessionFile();

				const navigation = await ctx.navigateTree(firstUserMessageEntryId, {
					summarize: true,
					customInstructions: buildBranchSummaryInstructions(focus),
				});
				if (navigation.cancelled) {
					ctx.ui.notify("Handoff tree navigation was cancelled", "warning");
					return;
				}

				ctx.ui.setEditorText("");
				pi.sendUserMessage(
					buildContinueFromHandoffPrompt(sessionFile, sourceLeafEntryId),
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Handoff failed: ${message}`, "error");
			} finally {
				handoffInProgress = false;
			}
		},
	});
}
