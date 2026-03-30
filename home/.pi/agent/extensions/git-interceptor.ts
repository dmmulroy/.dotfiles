/**
 * Git Interceptor
 *
 * Two guards for agent-driven git commands:
 *
 * 1. Editor hang prevention — Sets GIT_EDITOR, GIT_SEQUENCE_EDITOR to `true`
 *    (no-op) and GIT_MERGE_AUTOEDIT to `no` so git never spawns an interactive
 *    editor (nvim, vim, etc.) that would hang the bash process.
 *
 * 2. Hook bypass prevention — Blocks any command containing `--no-verify` so
 *    the agent cannot circumvent git hooks (pre-commit, commit-msg, etc.).
 *    The agent should fix hook failures or ask the human for help instead.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const GIT_ENV_PREFIX =
	"export GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true GIT_MERGE_AUTOEDIT=no\n";

const NO_VERIFY_RE = /--no-verify\b/;

const BLOCK_REASON =
	"BLOCKED: --no-verify is not allowed. Git hooks exist for a reason. " +
	"Do not attempt to bypass them. Instead: fix the underlying issue that " +
	"is causing the hook to fail, or ask the user for help.";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return;
		if (!event.input.command.includes("git")) return;

		if (NO_VERIFY_RE.test(event.input.command)) {
			return { block: true, reason: BLOCK_REASON };
		}

		event.input.command = GIT_ENV_PREFIX + event.input.command;
	});
}
