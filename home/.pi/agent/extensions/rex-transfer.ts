/**
 * Rex transfer: the pi half of "Transfer pi Session to Host…".
 *
 * The Rex half lives in home/.config/rex/dmmulroy/transfer_pi_session/ (see its
 * README.md). Rex can't see inside pi, so this extension does three small things:
 *
 * 1. Writes a sidecar file per Rex pane saying which pi session runs there
 *    (~/.local/state/pi-rex/blocks/<block uuid>.json), and removes it on quit.
 *    Keep the path and fields in sync with transfer_pi_session/pi_sidecar.lua.
 * 2. Registers /transfer [host], which runs the Rex action for this pane.
 * 3. On the target, shows the resumed agent the note Rex passes in
 *    PI_REX_TRANSFER_NOTE (where the session came from, how paths changed).
 *
 * Outside Rex (no REX_BLOCK) it does nothing.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Set by transfer_pi_session/ports/pi_agent.lua when it starts pi on the target. */
export const TRANSFER_NOTE_ENV = "PI_REX_TRANSFER_NOTE";
const TRANSFER_NOTE_MESSAGE_TYPE = "rex-transfer";
const REX_ACTION_NAME = "transfer_pi_session";

export type PiRexSidecar = {
	agent: "pi";
	session_id: string;
	/** Absent for an ephemeral session, which can't be transferred. */
	session_file?: string;
	cwd: string;
	/** The pi process; Rex checks it is the pane's foreground process. */
	pid: number;
	rex_block: string;
	rex_session?: string;
	updated_at: string;
};

export function piRexSidecarDir(env: NodeJS.ProcessEnv = process.env): string {
	const stateHome = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
	return join(stateHome, "pi-rex", "blocks");
}

export function piRexSidecarPath(rexBlock: string, env: NodeJS.ProcessEnv = process.env): string {
	return join(piRexSidecarDir(env), `${rexBlock.replace(/^block:/, "")}.json`);
}

/** Written atomically, so Rex never reads half a file. */
export function writePiRexSidecar(sidecar: PiRexSidecar, env: NodeJS.ProcessEnv = process.env): string {
	const path = piRexSidecarPath(sidecar.rex_block, env);
	mkdirSync(piRexSidecarDir(env), { recursive: true });
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(sidecar, null, 2)}\n`);
	renameSync(tmp, path);
	return path;
}

/** Removes the pane's sidecar, but only if this process wrote it. */
export function removePiRexSidecar(rexBlock: string, pid: number, env: NodeJS.ProcessEnv = process.env): void {
	const path = piRexSidecarPath(rexBlock, env);
	try {
		const current = JSON.parse(readFileSync(path, "utf8")) as Partial<PiRexSidecar>;
		if (current.pid === pid) {
			rmSync(path, { force: true });
		}
	} catch {
		// Already gone or unreadable: nothing to remove.
	}
}

function rexCliPath(): string {
	const binDir = process.env.REX_BIN_DIR;
	return binDir ? join(binDir, "rex") : "rex";
}

export default function rexTransfer(pi: ExtensionAPI): void {
	const rexBlock = process.env.REX_BLOCK;
	if (!rexBlock) {
		return;
	}

	const recordSession = (ctx: ExtensionContext): void => {
		try {
			writePiRexSidecar({
				agent: "pi",
				session_id: ctx.sessionManager.getSessionId(),
				session_file: ctx.sessionManager.getSessionFile() ?? undefined,
				cwd: ctx.cwd,
				pid: process.pid,
				rex_block: rexBlock,
				rex_session: process.env.REX_SESSION,
				updated_at: new Date().toISOString(),
			});
		} catch (error) {
			ctx.ui.notify(`rex-transfer: can't write the sidecar: ${String(error)}`, "warning");
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		recordSession(ctx);

		// Only the first session of a pi that Rex started for a transfer gets the note.
		const note = process.env[TRANSFER_NOTE_ENV];
		if (note) {
			delete process.env[TRANSFER_NOTE_ENV];
			pi.sendMessage({ customType: TRANSFER_NOTE_MESSAGE_TYPE, content: note, display: true });
		}
	});

	pi.on("session_shutdown", async (event) => {
		// On new/resume/fork the next session_start rewrites the sidecar.
		if (event.reason === "quit") {
			removePiRexSidecar(rexBlock, process.pid);
		}
	});

	pi.registerCommand("transfer", {
		description: "Transfer this session to another Rex host: /transfer [host]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			recordSession(ctx);

			const host = args.trim();
			const actionArgs = [`block_id=${rexBlock}`];
			if (host) {
				actionArgs.push(`host=${host}`);
			}
			// Without a host, Rex asks in its command palette and `rex do` waits for the answer.
			const result = await pi.exec(rexCliPath(), ["do", REX_ACTION_NAME, ...actionArgs]);
			if (result.code !== 0) {
				const reason = (result.stderr || result.stdout).trim() || `rex exited with ${result.code}`;
				ctx.ui.notify(`Transfer didn't start: ${reason}`, "error");
			}
		},
	});
}
