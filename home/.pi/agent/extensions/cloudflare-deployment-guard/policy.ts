/**
 * The global Cloudflare deployment policy (`agent/cloudflare-deployment-allowlist.json`): parsing,
 * authorization of resolved targets, repository identity for worktrees, and detection of agent writes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	type CloudflareDeploymentBlocked,
	type CloudflareDeploymentDecision,
	type Result,
	blocked,
	denialDecision,
	errorMessage,
	isStringRecord,
} from "./decision.ts";
import {
	type ShellWord,
	createShellState,
	executableName,
	nestedShellScript,
	parseShellScript,
	walkShellProgram,
} from "./shell-ast.ts";

export const POLICY_FILE_NAME = "cloudflare-deployment-allowlist.json";
/** `agent/cloudflare-deployment-allowlist.json`, next to `agent/extensions/`. */
export const POLICY_FILE_PATH = fileURLToPath(new URL(`../../${POLICY_FILE_NAME}`, import.meta.url));

/** One canonical Alchemy stack entrypoint and its explicitly allowed logical stages. */
export type AlchemyDeploymentPolicyEntry = {
	readonly project: string;
	readonly stages: ReadonlySet<string>;
	readonly stack?: string;
};

/** Versioned Cloudflare deployment policy; version 1 remains valid for Wrangler/cf only. */
export type CloudflareDeploymentPolicy =
	| {
			readonly version: 1;
			readonly workers: Readonly<Record<string, ReadonlySet<string>>>;
			readonly ignoredEntries?: readonly string[];
	  }
	| {
			readonly version: 2;
			readonly workers: Readonly<Record<string, ReadonlySet<string>>>;
			readonly alchemy: readonly AlchemyDeploymentPolicyEntry[];
			/** Entries skipped because their project no longer exists; each skip denies only that project. */
			readonly ignoredEntries?: readonly string[];
	  };

/** A policy that authorizes nothing, used to decide cheaply whether the real policy is needed. */
export const DENY_ALL_DEPLOYMENT_POLICY: CloudflareDeploymentPolicy = {
	version: 2,
	workers: {},
	alchemy: [],
};

export type WorkerDeploymentTarget = {
	readonly worker: string;
	readonly environment: string;
};

export type AlchemyDeploymentTarget = {
	readonly project: string;
	readonly stage: string;
	readonly stack: string | undefined;
};

function parseExactNames(
	input: unknown,
	label: string,
): Result<ReadonlySet<string>, CloudflareDeploymentBlocked> {
	if (
		!Array.isArray(input) ||
		input.length === 0 ||
		input.some((value) => typeof value !== "string" || value.length === 0 || value.trim() !== value)
	)
		return blocked(`invalid ${POLICY_FILE_NAME} ${label}; use a non-empty array of exact names.`);
	return { _tag: "ok", value: new Set(input) };
}

function parseWorkerPolicy(
	input: unknown,
): Result<Readonly<Record<string, ReadonlySet<string>>>, CloudflareDeploymentBlocked> {
	if (!isStringRecord(input)) return blocked(`invalid ${POLICY_FILE_NAME} workers object.`);
	const workers: Record<string, ReadonlySet<string>> = {};
	for (const [worker, environments] of Object.entries(input)) {
		if (worker.length === 0 || worker.trim() !== worker)
			return blocked(`invalid ${POLICY_FILE_NAME} Worker name ${JSON.stringify(worker)}.`);
		const parsed = parseExactNames(environments, `entry for ${JSON.stringify(worker)}`);
		if (parsed._tag === "err") return parsed;
		workers[worker] = parsed.value;
	}
	return { _tag: "ok", value: workers };
}

/**
 * Parses the versioned global policy. Malformed shapes are errors; an Alchemy entry whose project path no
 * longer exists is skipped and reported in `ignoredEntries`, so one stale entry cannot block every deploy.
 */
export function parseCloudflareDeploymentPolicy(
	input: unknown,
): Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked> {
	if (!isStringRecord(input) || (input.version !== 1 && input.version !== 2))
		return blocked(
			`invalid ${POLICY_FILE_NAME}; expected version 1 workers or version 2 workers plus Alchemy projects.`,
		);
	const workers = parseWorkerPolicy(input.workers);
	if (workers._tag === "err") return workers;
	if (input.version === 1) return { _tag: "ok", value: { version: 1, workers: workers.value } };
	if (!Array.isArray(input.alchemy))
		return blocked(`invalid ${POLICY_FILE_NAME}; version 2 requires an "alchemy" array.`);

	const alchemy: AlchemyDeploymentPolicyEntry[] = [];
	const ignoredEntries: string[] = [];
	const projects = new Set<string>();
	for (const [index, entry] of input.alchemy.entries()) {
		if (
			!isStringRecord(entry) ||
			typeof entry.project !== "string" ||
			!isAbsolute(entry.project) ||
			(entry.stack !== undefined &&
				(typeof entry.stack !== "string" || entry.stack.length === 0 || entry.stack.trim() !== entry.stack))
		)
			return blocked(
				`invalid ${POLICY_FILE_NAME} Alchemy entry at index ${index}; project must be an absolute existing entrypoint path.`,
			);
		const stages = parseExactNames(entry.stages, `Alchemy stages at index ${index}`);
		if (stages._tag === "err") return stages;
		let project: string;
		try {
			project = realpathSync(entry.project);
		} catch (cause) {
			ignoredEntries.push(`Alchemy entry ${index} (${entry.project}): ${errorMessage(cause)}`);
			continue;
		}
		if (projects.has(project))
			return blocked(
				`conflicting ${POLICY_FILE_NAME} Alchemy entries for canonical project ${JSON.stringify(project)}.`,
			);
		projects.add(project);
		alchemy.push({
			project,
			stages: stages.value,
			...(typeof entry.stack === "string" ? { stack: entry.stack } : {}),
		});
	}
	return { _tag: "ok", value: { version: 2, workers: workers.value, alchemy, ignoredEntries } };
}

/** Where a path lives in git: the shared repository directory (the same for every worktree) and the root. */
export type RepositoryIdentity = {
	readonly commonDirectory: string;
	readonly root: string;
};

/** Caches repository lookups for one evaluation or one extension instance. */
export type RepositoryIdentityCache = Map<string, RepositoryIdentity | undefined>;

function readGitDirectory(root: string): string | undefined {
	const dotGit = join(root, ".git");
	try {
		if (statSync(dotGit).isDirectory()) return realpathSync(dotGit);
		const pointer = readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)\s*$/m)?.[1];
		if (pointer === undefined) return undefined;
		const gitDirectory = resolve(root, pointer);
		const commonPointerPath = join(gitDirectory, "commondir");
		const common = existsSync(commonPointerPath)
			? resolve(gitDirectory, readFileSync(commonPointerPath, "utf8").trim())
			: gitDirectory;
		return realpathSync(common);
	} catch {
		return undefined;
	}
}

/** Finds the git repository a path belongs to, treating every worktree of one repository as the same. */
export function findRepositoryIdentity(
	path: string,
	cache?: RepositoryIdentityCache,
): RepositoryIdentity | undefined {
	if (cache?.has(path)) return cache.get(path);
	let identity: RepositoryIdentity | undefined;
	try {
		const canonical = realpathSync(path);
		let current = statSync(canonical).isDirectory() ? canonical : dirname(canonical);
		while (true) {
			if (existsSync(join(current, ".git"))) {
				const commonDirectory = readGitDirectory(current);
				identity = { commonDirectory: commonDirectory ?? join(current, ".git"), root: current };
				break;
			}
			const parent = dirname(current);
			if (parent === current) break;
			current = parent;
		}
	} catch {
		identity = undefined;
	}
	cache?.set(path, identity);
	return identity;
}

/**
 * True when `cwd` is inside a repository (or any worktree of one) that holds an allowlisted Alchemy
 * project. Such repositories are exempt from the guard.
 */
export function isAllowlistedRepositoryWorkingDirectory(
	cwd: string,
	policy: CloudflareDeploymentPolicy,
	cache?: RepositoryIdentityCache,
): boolean {
	if (policy.version !== 2 || policy.alchemy.length === 0) return false;
	const commandRepository = findRepositoryIdentity(cwd, cache);
	if (commandRepository === undefined) return false;
	return policy.alchemy.some(
		(entry) => findRepositoryIdentity(entry.project, cache)?.commonDirectory === commandRepository.commonDirectory,
	);
}

/** Authorizes a resolved Wrangler or cf Worker target. */
export function workerPolicyDecision(
	target: WorkerDeploymentTarget,
	policy: CloudflareDeploymentPolicy,
): CloudflareDeploymentDecision {
	const environments = policy.workers[target.worker];
	if (environments === undefined)
		return denialDecision(
			`unknown Worker application ${JSON.stringify(target.worker)}; add it to ${POLICY_FILE_NAME} outside the agent session.`,
		);
	if (!environments.has(target.environment))
		return denialDecision(
			`environment ${JSON.stringify(target.environment)} is not allowed for Worker ${JSON.stringify(target.worker)}; use "default" explicitly for Wrangler's top-level environment.`,
		);
	return { _tag: "allow", reason: `Cloudflare deployment allowed for ${target.worker}/${target.environment}.` };
}

function sameProjectInAnotherWorktree(
	entryProject: string,
	targetProject: string,
	cache: RepositoryIdentityCache | undefined,
): boolean {
	const entryRepository = findRepositoryIdentity(entryProject, cache);
	const targetRepository = findRepositoryIdentity(targetProject, cache);
	return (
		entryRepository !== undefined &&
		targetRepository !== undefined &&
		entryRepository.commonDirectory === targetRepository.commonDirectory &&
		relative(entryRepository.root, entryProject) === relative(targetRepository.root, targetProject)
	);
}

/**
 * Authorizes a resolved Alchemy target. A project matches its policy entry by canonical path, or by the
 * same repository-relative path in another worktree of the same repository.
 */
export function alchemyPolicyDecision(
	target: AlchemyDeploymentTarget,
	policy: CloudflareDeploymentPolicy,
	cache?: RepositoryIdentityCache,
): CloudflareDeploymentDecision {
	if (policy.version === 1)
		return denialDecision(`policy authorization for Alchemy requires version 2 of ${POLICY_FILE_NAME}.`);
	const entry =
		policy.alchemy.find((candidate) => candidate.project === target.project) ??
		policy.alchemy.find((candidate) => sameProjectInAnotherWorktree(candidate.project, target.project, cache));
	if (entry === undefined)
		return denialDecision(
			`policy authorization denied unknown Alchemy project ${JSON.stringify(target.project)}; add its canonical entrypoint outside the agent session.`,
		);
	if (!entry.stages.has(target.stage))
		return denialDecision(
			`policy authorization denied Alchemy stage ${JSON.stringify(target.stage)} for project ${JSON.stringify(target.project)}.`,
		);
	if (entry.stack !== undefined && target.stack !== entry.stack)
		return denialDecision(
			`policy authorization expected Alchemy stack ${JSON.stringify(entry.stack)}, but project resolution found ${JSON.stringify(target.stack)}.`,
		);
	return {
		_tag: "allow",
		reason: `Cloudflare Alchemy deployment allowed for ${target.project} at stage ${target.stage}.`,
	};
}

/** The loaded global policy plus a content hash that detects mid-session changes. */
export type LoadedCloudflarePolicy = {
	readonly fingerprint: string;
	readonly contentHash: string;
	readonly result: Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked>;
};

function fileFingerprint(path: string): string {
	const stats = statSync(path, { bigint: true });
	return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;
}

/** Hash of the policy file's contents, or "missing". */
export function policyContentHash(path = POLICY_FILE_PATH): string {
	try {
		return createHash("sha256").update(readFileSync(path)).digest("hex");
	} catch {
		return "missing";
	}
}

/** Loads the global policy, reusing `cached` while the file is unchanged. */
export function loadCloudflarePolicy(
	cached: LoadedCloudflarePolicy | undefined,
	path = POLICY_FILE_PATH,
): LoadedCloudflarePolicy {
	let fingerprint: string;
	try {
		fingerprint = fileFingerprint(path);
	} catch (cause) {
		return {
			fingerprint: "missing",
			contentHash: "missing",
			result: blocked(`cannot read global policy ${path}: ${errorMessage(cause)}.`),
		};
	}
	if (cached?.fingerprint === fingerprint) return cached;
	let result: LoadedCloudflarePolicy["result"];
	try {
		result = parseCloudflareDeploymentPolicy(JSON.parse(readFileSync(path, "utf8")));
	} catch (cause) {
		result = blocked(`cannot parse global policy ${path}: ${errorMessage(cause)}.`);
	}
	return { fingerprint, contentHash: policyContentHash(path), result };
}

/** Resolves `~`, `$HOME`, and symlinks so that every spelling of the policy path compares equal. */
export function normalizedToolPath(path: string, cwd: string): string {
	const home = homedir();
	const expanded = path
		.replace(/^@/, "")
		.replace(/^~(?=\/|$)/, home)
		.replace(/^\$HOME(?=\/|$)/, home)
		.replace(/^\$\{HOME}(?=\/|$)/, home);
	const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
	try {
		return realpathSync(absolute);
	} catch {
		try {
			return join(realpathSync(dirname(absolute)), absolute.slice(dirname(absolute).length + 1));
		} catch {
			return absolute;
		}
	}
}

const DELETE_OR_EDIT_COMMANDS = new Set([
	"rm",
	"unlink",
	"tee",
	"touch",
	"truncate",
	"chmod",
	"chown",
	"chgrp",
	"chflags",
	"xattr",
	"shred",
	"sponge",
	"mv",
	"vi",
	"vim",
	"nvim",
	"nano",
	"emacs",
	"ed",
	"ex",
]);
const COPY_COMMANDS = new Set(["cp", "install", "rsync", "ln", "ditto"]);
const INLINE_INTERPRETERS = new Set([
	"python",
	"python3",
	"node",
	"bun",
	"deno",
	"ruby",
	"perl",
	"php",
	"lua",
	"osascript",
	"tsx",
]);
const INLINE_CODE_OPTIONS = new Set(["-c", "-e", "--eval", "-p", "--print", "-E", "-x"]);
const COMMAND_WRAPPERS = new Set(["sudo", "env", "command", "nohup", "exec", "time", "doas"]);
const INTERPRETER_WRITE_PATTERN =
	/\bwrite(?:File|FileSync|_text|_bytes|lines)?\s*\(|\bopen\s*\([^)]*,\s*(?:mode\s*=\s*)?["'`][^"'`]*[wax+]|\b(?:rename|renameSync|unlink|unlinkSync|rmSync|truncate|truncateSync|copyFile|copyFileSync|cpSync|chmod|chmodSync|appendFile|appendFileSync|symlink|symlinkSync|createWriteStream|copyfile|copy2|copytree)\s*\(|\bos\.(?:remove|replace)\s*\(|\bshutil\.(?:move|copy)\w*\s*\(|\.write\s*\(|\bBun\.write\b|\bDeno\.write\w*\b|\bFile\.write\b|\bIO\.write\b/;

function globMatches(pattern: string, path: string): boolean {
	let expression = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const character = pattern[index] ?? "";
		if (character === "*") expression += "[^/]*";
		else if (character === "?") expression += "[^/]";
		else if (character === "[") {
			const close = pattern.indexOf("]", index + 1);
			if (close === -1) expression += "\\[";
			else {
				expression += `[${pattern.slice(index + 1, close).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
				index = close;
			}
		} else expression += character.replace(/[.+^${}()|\\]/g, "\\$&");
	}
	return new RegExp(`^${expression}$`).test(path);
}

/**
 * Detects shell commands that write the global policy file: redirections into it, editing or deleting
 * commands, copies onto it, in-place `sed`/`perl`, `dd of=`, nested shells, and inline interpreter code
 * that both names it and calls a write API. Reading it (`cat`, `jq`, `find -name`, `git log --`, a script
 * that opens it for reading) is not a mutation.
 */
export function findsCloudflarePolicyMutation(
	command: string,
	cwd: string,
	policyPath = POLICY_FILE_PATH,
	depth = 0,
): boolean {
	if (depth > 8) return command.includes(POLICY_FILE_NAME);
	const policyName = policyPath.slice(policyPath.lastIndexOf("/") + 1);
	const parsed = parseShellScript(command);
	if (parsed._tag === "err")
		return (
			command.includes(policyName) &&
			/(?:^|[\s;&|(])(?:rm|tee|touch|truncate|cp|install|mv|rsync|sed|perl|dd|python3?|node|ruby)\b|>/.test(command)
		);
	const canonicalPolicy = normalizedToolPath(policyPath, cwd);
	const policySpellings = [canonicalPolicy, resolve(policyPath), join(homedir(), ".pi", "agent", policyName)];
	const namesPolicy = (word: ShellWord | undefined, wordCwd: string): boolean => {
		if (word === undefined) return false;
		if (word.value === undefined) return word.source.includes(policyName);
		const value = word.value.replace(/^of=/, "");
		if (word.glob) {
			const absolutePattern = isAbsolute(value) ? value : resolve(wordCwd, value);
			return policySpellings.some((spelling) => globMatches(absolutePattern, spelling));
		}
		return value.includes(policyName) && normalizedToolPath(value, wordCwd) === canonicalPolicy;
	};

	const mutation = walkShellProgram(parsed, createShellState(cwd), (simple, state) => {
		if (simple.redirects.some((redirect) => redirect.kind === "write" && namesPolicy(redirect.target, state.cwd)))
			return true;
		let words = simple.words;
		while (words.length > 0) {
			const name = words[0]?.value === undefined ? undefined : executableName(words[0].value);
			if (name === undefined || !COMMAND_WRAPPERS.has(name)) break;
			let next = 1;
			while (next < words.length) {
				const value = words[next]?.value;
				if (value === undefined || !(value.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(value))) break;
				next += 1;
			}
			words = words.slice(next);
		}
		const nameWord = words[0];
		if (nameWord === undefined) return undefined;
		if (nameWord.value === undefined) return nameWord.source.includes(policyName) ? true : undefined;
		const name = executableName(nameWord.value);
		const operands = words.slice(1);
		const nested = nestedShellScript(words, simple.standardInput, simple.source);
		if (nested?.kind === "source")
			return findsCloudflarePolicyMutation(nested.source, state.cwd, policyPath, depth + 1) ? true : undefined;
		if (nested?.kind === "opaque") return nested.evidence.includes(policyName) ? true : undefined;
		if (nested !== undefined) return undefined;
		if (DELETE_OR_EDIT_COMMANDS.has(name))
			return operands.some((word) => namesPolicy(word, state.cwd)) ? true : undefined;
		if (COPY_COMMANDS.has(name)) {
			const paths = operands.filter((word) => !(word.value ?? "").startsWith("-"));
			return namesPolicy(paths.at(-1), state.cwd) ? true : undefined;
		}
		if (name === "sed" || name === "perl") {
			const inPlace = operands.some(
				(word) =>
					word.value !== undefined &&
					(word.value.startsWith("--in-place") || (/^-[A-Za-z]*i/.test(word.value) && !word.value.startsWith("--"))),
			);
			if (inPlace && operands.some((word) => namesPolicy(word, state.cwd))) return true;
		}
		if (name === "dd")
			return operands.some((word) => (word.value ?? word.source).startsWith("of=") && namesPolicy(word, state.cwd))
				? true
				: undefined;
		if (INLINE_INTERPRETERS.has(name.replace(/\d+(?:\.\d+)*$/, "")) || INLINE_INTERPRETERS.has(name)) {
			const code: string[] = [];
			for (const [index, word] of operands.entries()) {
				if (INLINE_CODE_OPTIONS.has(word.value ?? "")) code.push(operands[index + 1]?.source ?? "");
			}
			if (simple.standardInput.kind === "heredoc") code.push(simple.standardInput.source);
			const inlineCode = code.join("\n");
			if (!INTERPRETER_WRITE_PATTERN.test(inlineCode)) return undefined;
			if (inlineCode.includes(policyName) || operands.some((word) => namesPolicy(word, state.cwd))) return true;
		}
		return undefined;
	});
	return mutation === true;
}
