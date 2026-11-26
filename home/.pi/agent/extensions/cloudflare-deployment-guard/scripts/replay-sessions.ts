/**
 * Replays every bash/write/edit call the Cloudflare deployment guard blocked in local Pi sessions through
 * the current guard, to measure which blocks still happen.
 *
 *   npm run replay-sessions -- [--sessions <dir>] [--out <file.json>] [--show-blocks] [--strict]
 *
 * Calls run headless (no UI), in the session's cwd when it still exists, against the live policy.
 * `--strict` evaluates bash commands without the allowlisted-repository exemption, which measures the
 * parser on every recorded command. Output stays local: session commands can hold private content, so
 * never commit the report.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { evaluateCloudflareDeploymentCommand } from "../evaluate.ts";
import cloudflareDeploymentGuardExtension from "../index.ts";
import { findsCloudflarePolicyMutation, loadCloudflarePolicy } from "../policy.ts";

const BLOCK_MARKER = "BLOCKED: Cloudflare deployment guard";

type RecordedBlock = {
	readonly file: string;
	readonly cwd: string;
	readonly timestamp: string;
	readonly toolName: string;
	readonly input: Record<string, unknown>;
	readonly reason: string;
};

type ToolCallHandler = (
	event: { readonly type: "tool_call"; readonly toolName: string; readonly input: Record<string, unknown> },
	ctx: { readonly cwd: string; readonly hasUI: false },
) => Promise<{ readonly block: boolean; readonly reason: string } | undefined>;

function argument(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function sessionFilesWithBlocks(directory: string): readonly string[] {
	const ripgrep = spawnSync("rg", ["-l", "--fixed-strings", BLOCK_MARKER, directory], { encoding: "utf8" });
	if (ripgrep.status === 0 || ripgrep.status === 1) return ripgrep.stdout.split("\n").filter(Boolean);
	const files: string[] = [];
	const visit = (path: string) => {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const child = join(path, entry.name);
			if (entry.isDirectory()) visit(child);
			else if (entry.name.endsWith(".jsonl") && readFileSync(child, "utf8").includes(BLOCK_MARKER)) files.push(child);
		}
	};
	visit(directory);
	return files;
}

type SessionEntry = {
	readonly type?: string;
	readonly cwd?: string;
	readonly timestamp?: string;
	readonly message?: {
		readonly role?: string;
		readonly toolCallId?: string;
		readonly toolName?: string;
		readonly content?: unknown;
	};
};

function recordedBlocks(file: string): readonly RecordedBlock[] {
	const calls = new Map<string, { readonly name: string; readonly input: Record<string, unknown> }>();
	const blocks: RecordedBlock[] = [];
	let cwd = homedir();
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (!line.includes('"session"') && !line.includes('"toolCall"') && !line.includes(BLOCK_MARKER)) continue;
		let entry: SessionEntry;
		try {
			entry = JSON.parse(line) as SessionEntry;
		} catch {
			continue;
		}
		if (entry.type === "session" && typeof entry.cwd === "string") cwd = entry.cwd;
		const message = entry.message;
		if (entry.type !== "message" || message === undefined || !Array.isArray(message.content)) continue;
		if (message.role === "assistant") {
			for (const part of message.content as Array<Record<string, unknown>>) {
				if (part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string")
					calls.set(part.id, { name: part.name, input: (part.arguments ?? {}) as Record<string, unknown> });
			}
			continue;
		}
		if (message.role !== "toolResult") continue;
		const text = (message.content as Array<Record<string, unknown>>)
			.map((part) => (typeof part.text === "string" ? part.text : ""))
			.join("");
		if (!text.startsWith(BLOCK_MARKER)) continue;
		const call = calls.get(message.toolCallId ?? "");
		if (call === undefined) continue;
		blocks.push({
			file,
			cwd,
			timestamp: entry.timestamp ?? "",
			toolName: call.name,
			input: call.input,
			reason: text.replace(`${BLOCK_MARKER}: `, ""),
		});
	}
	return blocks;
}

async function main(): Promise<void> {
	const sessions = argument("--sessions") ?? join(homedir(), ".pi", "agent", "sessions");
	const out = argument("--out");
	let handler: ToolCallHandler | undefined;
	cloudflareDeploymentGuardExtension({
		on(name: string, callback: ToolCallHandler) {
			if (name === "tool_call") handler = callback;
		},
	} as never);
	if (handler === undefined) throw new Error("the guard did not register a tool_call handler");

	const strict = process.argv.includes("--strict");
	const loaded = loadCloudflarePolicy(undefined);
	if (strict && loaded.result._tag === "err") throw loaded.result.error;
	const blocks = sessionFilesWithBlocks(sessions).flatMap(recordedBlocks);
	const results = [];
	for (const [index, block] of blocks.entries()) {
		const cwdExists = existsSync(block.cwd);
		const cwd = cwdExists ? block.cwd : homedir();
		let decision: { readonly block: boolean; readonly reason: string } | undefined;
		if (strict && block.toolName === "bash" && typeof block.input.command === "string" && loaded.result._tag === "ok") {
			const command = block.input.command;
			const evaluated = evaluateCloudflareDeploymentCommand(command, {
				cwd,
				policy: loaded.result.value,
				repositoryExemption: false,
			});
			if (findsCloudflarePolicyMutation(command, cwd)) decision = { block: true, reason: "policy mutation" };
			else if (evaluated._tag === "block") decision = { block: true, reason: evaluated.reason };
		} else decision = await handler({ type: "tool_call", toolName: block.toolName, input: block.input }, { cwd, hasUI: false });
		results.push({
			index,
			...block,
			cwdExists,
			now: decision?.block === true ? decision.reason.replace(`${BLOCK_MARKER}: `, "") : "pass",
		});
	}

	const stillBlocked = results.filter((result) => result.now !== "pass");
	console.log(`recorded blocks: ${results.length} in ${new Set(blocks.map((block) => block.file)).size} sessions`);
	console.log(`pass now:        ${results.length - stillBlocked.length}`);
	console.log(`still blocked:   ${stillBlocked.length} (${stillBlocked.filter((result) => !result.cwdExists).length} with a deleted session cwd)`);
	if (process.argv.includes("--show-blocks"))
		for (const result of stillBlocked) {
			const command = typeof result.input.command === "string" ? result.input.command : String(result.input.path);
			console.log(
				`\n#${result.index} ${result.cwdExists ? "" : "(deleted cwd) "}${result.cwd}\n  now: ${result.now.slice(0, 200)}\n  $ ${command.slice(0, 240).replace(/\n/g, "\n    ")}`,
			);
		}
	if (out !== undefined) writeFileSync(out, JSON.stringify(results, null, 1));
}

await main();
