/**
 * Package-manager task invocations (`npm run`, `pnpm <script>`, `yarn workspace`, `vp run`, `vpr`, `bun run`):
 * telling them apart from each runner's built-in commands and resolving the static script or Vite+ task
 * command they run.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { CloudflareDeploymentBlocked, type Result, blocked, errorMessage, isStringRecord } from "./decision.ts";
import { findFileUpward } from "./deploy-commands.ts";
import { type ShellWord, executableName, quoteShellArgument } from "./shell-ast.ts";

const MAX_WORKSPACE_PACKAGES = 1_000;

export type PackageTaskRunner = "npm" | "pnpm" | "bun" | "yarn" | "vp" | "vpr";

/** One package task invocation with its package selection. */
export type PackageTask = {
	readonly runner: PackageTaskRunner;
	readonly taskName: string;
	/** An exact workspace package name or directory. */
	readonly filter: string | undefined;
	/** Every workspace package (`-r`, `--workspaces`, `workspaces foreach`). */
	readonly recursive: boolean;
	/** The workspace root package (`-w`). */
	readonly workspaceRoot: boolean;
	readonly packageCwd: string;
	/** Arguments the runner appends to the script command. */
	readonly appendedArguments: readonly string[];
};

export type PackageTaskParse =
	| { readonly _tag: "none" }
	| { readonly _tag: "task"; readonly task: PackageTask }
	| { readonly _tag: "unresolvable"; readonly taskName: string | undefined; readonly error: CloudflareDeploymentBlocked };

const PNPM_BUILTINS = new Set([
	"add", "audit", "approve-builds", "bin", "c", "cache", "cat-file", "cat-index", "catalog", "config", "create",
	"dedupe", "deploy", "dist-tag", "dlx", "doctor", "env", "exec", "fetch", "find-hash", "get", "help", "i",
	"ignored-builds", "import", "info", "init", "install", "install-test", "it", "la", "licenses", "link", "list", "ll",
	"ln", "login", "logout", "ls", "outdated", "owner", "pack", "patch", "patch-commit", "patch-remove", "prune",
	"publish", "rb", "rebuild", "remove", "rm", "root", "sbom", "search", "self-update", "server", "set", "setup",
	"show", "store", "un", "uninstall", "unlink", "up", "update", "upgrade", "version", "view", "whoami", "why", "x",
]);
const YARN_BUILTINS = new Set([
	"add", "audit", "autoclean", "bin", "cache", "check", "config", "constraints", "create", "dedupe", "dlx", "exec",
	"explain", "generate-lock-entry", "global", "help", "import", "info", "init", "install", "licenses", "link", "list",
	"login", "logout", "node", "npm", "outdated", "owner", "pack", "patch", "patch-commit", "plugin", "policies",
	"publish", "rebuild", "remove", "search", "set", "stage", "tag", "team", "unlink", "unplug", "up", "upgrade",
	"upgrade-interactive", "version", "why",
]);
const NPM_TASK_COMMANDS: Readonly<Record<string, string | undefined>> = {
	run: undefined,
	"run-script": undefined,
	rum: undefined,
	urn: undefined,
	test: "test",
	t: "test",
	tst: "test",
	start: "start",
	stop: "stop",
	restart: "restart",
};

type Options = {
	filters: string[];
	cwds: string[];
	recursive: boolean;
	workspaceRoot: boolean;
};

function unresolvable(taskName: string | undefined, detail: string): PackageTaskParse {
	return { _tag: "unresolvable", taskName, error: new CloudflareDeploymentBlocked(detail) };
}

/** Option names that take a value, and what they mean, per runner. */
function optionMeaning(
	runner: PackageTaskRunner,
	option: string,
): "filter" | "cwd" | "recursive" | "root" | "value" | "flag" | "help" | "unknown" {
	if (option === "--help" || option === "-h") return "help";
	const common: Record<string, ReturnType<typeof optionMeaning>> = {
		"--filter": "filter",
		"--cwd": "cwd",
		"--dir": "cwd",
		"--silent": "flag",
		"-s": "flag",
		"--if-present": "flag",
		"--loglevel": "value",
		"--reporter": "value",
	};
	const specific: Record<PackageTaskRunner, Record<string, ReturnType<typeof optionMeaning>>> = {
		npm: {
			"--workspace": "filter",
			"-w": "filter",
			"--prefix": "cwd",
			"-C": "cwd",
			"--workspaces": "recursive",
			"-ws": "recursive",
			"--include-workspace-root": "flag",
			"--foreground-scripts": "flag",
			"--ignore-scripts": "flag",
			"-q": "flag",
			"--quiet": "flag",
		},
		pnpm: {
			"-F": "filter",
			"--filter-prod": "filter",
			"-C": "cwd",
			"-r": "recursive",
			"--recursive": "recursive",
			"-w": "root",
			"--workspace-root": "root",
			"--parallel": "flag",
			"--sequential": "flag",
			"--stream": "flag",
			"--aggregate-output": "flag",
			"--no-bail": "flag",
			"--bail": "flag",
			"--report-summary": "flag",
			"--fail-if-no-match": "flag",
			"--resume-from": "value",
			"--workspace-concurrency": "value",
			"--changed-files-ignore-pattern": "value",
			"--test-pattern": "value",
			"--shell-mode": "flag",
		},
		yarn: { "--cwd": "cwd", "--top-level": "root", "-T": "root" },
		bun: { "-F": "filter", "--elide-lines": "value", "--bun": "flag", "--watch": "flag", "--hot": "flag" },
		vp: {},
		vpr: {},
	};
	const vpRun: Record<string, ReturnType<typeof optionMeaning>> = {
		"-r": "recursive",
		"--recursive": "recursive",
		"-t": "recursive",
		"--transitive": "recursive",
		"-w": "root",
		"--workspace-root": "root",
		"-F": "filter",
		"--filter": "filter",
		"--fail-if-no-match": "flag",
		"--ignore-depends-on": "flag",
		"-v": "flag",
		"-vv": "flag",
		"--verbose": "flag",
		"--cache": "flag",
		"--no-cache": "flag",
		"--parallel": "flag",
		"--log": "value",
		"--concurrency-limit": "value",
		"--prefix": "value",
		"--dry-run": "help",
		"--last-details": "help",
		"--json": "flag",
	};
	if (runner === "vp" || runner === "vpr") return vpRun[option] ?? "unknown";
	return specific[runner][option] ?? common[option] ?? "unknown";
}

/**
 * Reads runner options from `args` until the first positional word. Returns the index of that word,
 * `"help"` for help/dry-run/listing flags, or an unresolvable result.
 */
function readOptions(
	runner: PackageTaskRunner,
	args: readonly (string | undefined)[],
	from: number,
	options: Options,
	taskName: string | undefined,
): number | "help" | PackageTaskParse {
	let index = from;
	for (; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === undefined) return unresolvable(taskName, "script resolution found a dynamic package-runner argument.");
		if (argument === "--" || !argument.startsWith("-")) break;
		const equals = argument.match(/^(--?[A-Za-z][\w-]*)=(.*)$/);
		const name = equals?.[1] ?? argument;
		const meaning = optionMeaning(runner, name);
		if (meaning === "help") return "help";
		if (meaning === "unknown")
			return unresolvable(taskName, `script resolution does not support package-runner option ${JSON.stringify(argument)}.`);
		if (meaning === "flag") continue;
		if (meaning === "recursive") {
			options.recursive = true;
			continue;
		}
		if (meaning === "root") {
			options.workspaceRoot = true;
			continue;
		}
		const value = equals?.[2] ?? args[index + 1];
		if (equals === null) index += 1;
		if (value === undefined || (equals === null && value.startsWith("-")))
			return unresolvable(
				taskName,
				meaning === "filter"
					? `script resolution option ${name} requires one exact workspace value.`
					: meaning === "cwd"
						? `script resolution option ${name} requires a directory.`
						: `script resolution option ${name} requires a value.`,
			);
		if (meaning === "filter") options.filters.push(value);
		else if (meaning === "cwd") options.cwds.push(value);
	}
	return index;
}

function finishTask(
	runner: PackageTaskRunner,
	taskSpecifier: string,
	rest: readonly (string | undefined)[],
	options: Options,
	cwd: string,
): PackageTaskParse {
	const appended: string[] = [];
	let afterSeparator = false;
	for (let index = 0; index < rest.length; index += 1) {
		const argument = rest[index];
		if (argument === undefined)
			return unresolvable(taskSpecifier, "script resolution found dynamic arguments appended to the task.");
		if (!afterSeparator && argument === "--") {
			afterSeparator = true;
			continue;
		}
		if (!afterSeparator && (argument === "--help" || argument === "-h")) return { _tag: "none" };
		// npm reads options anywhere before `--` as its own configuration, not as script arguments.
		if (runner === "npm" && !afterSeparator && argument.startsWith("-")) {
			const position = readOptions(runner, rest, index, options, taskSpecifier);
			if (position === "help") return { _tag: "none" };
			if (typeof position !== "number") return position;
			index = position - 1;
			continue;
		}
		appended.push(argument);
	}
	let taskName = taskSpecifier;
	if ((runner === "vp" || runner === "vpr") && taskSpecifier.includes("#")) {
		const selector = taskSpecifier.split("#");
		if (selector.length !== 2 || selector[0]?.length === 0 || selector[1]?.length === 0)
			return unresolvable(taskSpecifier, "Vite task resolution requires one exact package#task selector.");
		options.filters.push(selector[0] ?? "");
		taskName = selector[1] ?? "";
	}
	if (new Set(options.cwds).size > 1)
		return unresolvable(taskName, "script resolution found conflicting package working directories.");
	if (new Set(options.filters).size > 1)
		return unresolvable(taskName, "script resolution found conflicting workspace filters.");
	const filter = options.filters[0];
	if (filter !== undefined && !/^[A-Za-z0-9@._/-]+$/.test(filter))
		return unresolvable(
			taskName,
			`script resolution requires an exact, non-dynamic workspace filter; received ${JSON.stringify(filter)}.`,
		);
	const directory = options.cwds[0];
	return {
		_tag: "task",
		task: {
			runner,
			taskName,
			filter,
			recursive: options.recursive && filter === undefined,
			workspaceRoot: options.workspaceRoot,
			packageCwd: directory === undefined ? cwd : isAbsolute(directory) ? directory : resolve(cwd, directory),
			appendedArguments: appended,
		},
	};
}

/**
 * Parses a package-runner command line. Built-in runner commands (`pnpm install`, `vp test`, `pnpm deploy`)
 * and help invocations are `none`: only commands that run a package script or Vite+ task are tasks.
 */
export function parsePackageTask(words: readonly ShellWord[], cwd: string): PackageTaskParse {
	const first = words[0]?.value;
	if (first === undefined) return { _tag: "none" };
	const runner = executableName(first);
	if (!["npm", "pnpm", "bun", "yarn", "vp", "vpr"].includes(runner)) return { _tag: "none" };
	const typedRunner = runner as PackageTaskRunner;
	const args = words.slice(1).map((word) => word.value);
	const options: Options = { filters: [], cwds: [], recursive: false, workspaceRoot: false };

	if (typedRunner === "vp" || typedRunner === "vpr") {
		let index = 0;
		if (typedRunner === "vp") {
			while (args[index] === "-C") {
				const directory = args[index + 1];
				if (directory === undefined) return unresolvable(undefined, "vp -C requires a static directory.");
				options.cwds.push(directory);
				index += 2;
			}
			if (args[index] !== "run") return { _tag: "none" };
			index += 1;
		}
		const position = readOptions(typedRunner, args, index, options, undefined);
		if (position === "help") return { _tag: "none" };
		if (typeof position !== "number") return position;
		const specifier = args[position];
		if (specifier === undefined)
			return position < args.length
				? unresolvable(undefined, "script resolution found a dynamic task name.")
				: { _tag: "none" };
		return finishTask(typedRunner, specifier, args.slice(position + 1), options, cwd);
	}

	let index = readOptions(typedRunner, args, 0, options, undefined);
	if (index === "help") return { _tag: "none" };
	if (typeof index !== "number") return index;
	let command = args[index];
	if (command === undefined) return index < args.length ? unresolvable(undefined, "script resolution found a dynamic command.") : { _tag: "none" };

	if (typedRunner === "yarn" && command === "workspace") {
		const workspace = args[index + 1];
		if (workspace === undefined) return unresolvable(undefined, "yarn workspace requires a static workspace name.");
		options.filters.push(workspace);
		index += 2;
		command = args[index];
		if (command === undefined) return { _tag: "none" };
	}
	if (typedRunner === "yarn" && command === "workspaces") {
		if (args[index + 1] !== "foreach") return { _tag: "none" };
		options.recursive = true;
		const runIndex = args.indexOf("run", index + 2);
		if (runIndex === -1) return { _tag: "none" };
		index = runIndex;
		command = "run";
	}
	if (typedRunner === "pnpm" && ["recursive", "multi", "m"].includes(command)) {
		options.recursive = true;
		const next = readOptions(typedRunner, args, index + 1, options, undefined);
		if (next === "help") return { _tag: "none" };
		if (typeof next !== "number") return next;
		index = next;
		command = args[index];
		if (command === undefined) return { _tag: "none" };
	}

	let taskName: string | undefined;
	let restStart = index + 1;
	if (command === "run" || command === "run-script" || (typedRunner === "npm" && Object.hasOwn(NPM_TASK_COMMANDS, command))) {
		const alias = typedRunner === "npm" ? NPM_TASK_COMMANDS[command] : undefined;
		if (alias !== undefined) taskName = alias;
		else {
			const next = readOptions(typedRunner, args, index + 1, options, undefined);
			if (next === "help") return { _tag: "none" };
			if (typeof next !== "number") return next;
			taskName = args[next];
			if (taskName === undefined)
				return next < args.length ? unresolvable(undefined, "script resolution found a dynamic task name.") : { _tag: "none" };
			restStart = next + 1;
		}
	} else if (typedRunner === "npm" || typedRunner === "bun") {
		return { _tag: "none" };
	} else if (typedRunner === "pnpm") {
		if (PNPM_BUILTINS.has(command)) return { _tag: "none" };
		taskName = ["test", "t", "tst"].includes(command) ? "test" : command;
	} else if (typedRunner === "yarn") {
		if (YARN_BUILTINS.has(command) || command === "workspaces") return { _tag: "none" };
		taskName = command;
	}
	if (taskName === undefined) return { _tag: "none" };
	return finishTask(typedRunner, taskName, args.slice(restStart), options, cwd);
}

/** Cached package.json name and scripts, keyed by path and file fingerprint. */
export type CachedPackageScripts = {
	readonly fingerprint: string;
	readonly name: string | undefined;
	readonly scripts: Readonly<Record<string, unknown>> | undefined;
	readonly unreadable: boolean;
};

export type PackageScriptCache = Map<string, CachedPackageScripts>;

function fileFingerprint(path: string): string {
	const stats = statSync(path, { bigint: true });
	return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;
}

function loadCachedPackageScripts(packagePath: string, cache: PackageScriptCache | undefined): CachedPackageScripts {
	let fingerprint: string;
	try {
		fingerprint = fileFingerprint(packagePath);
	} catch {
		return { fingerprint: "missing", name: undefined, scripts: undefined, unreadable: true };
	}
	const cached = cache?.get(packagePath);
	if (cached?.fingerprint === fingerprint) return cached;
	let loaded: CachedPackageScripts;
	try {
		const manifest: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
		loaded = {
			fingerprint,
			name: isStringRecord(manifest) && typeof manifest.name === "string" ? manifest.name : undefined,
			scripts: isStringRecord(manifest) && isStringRecord(manifest.scripts) ? manifest.scripts : undefined,
			unreadable: false,
		};
	} catch {
		loaded = { fingerprint, name: undefined, scripts: undefined, unreadable: true };
	}
	cache?.set(packagePath, loaded);
	return loaded;
}

/**
 * Validates one workspace package pattern. Each `*` must be a whole path segment matching one directory level;
 * `**`, partial wildcards, negations, and paths outside the workspace are not interpreted.
 */
function staticWorkspacePattern(
	pattern: string | undefined,
	source: string,
	workspacePath: string,
): Result<string, CloudflareDeploymentBlocked> {
	if (
		pattern === undefined ||
		pattern.startsWith("!") ||
		isAbsolute(pattern) ||
		/[$?!{}[\]]/.test(pattern) ||
		pattern
			.replace(/\/$/, "")
			.replace(/^\.\//, "")
			.split("/")
			.some((segment) => segment === "" || segment === "." || segment === ".." || (segment.includes("*") && segment !== "*"))
	)
		return blocked(
			`script resolution cannot safely interpret workspace package pattern ${JSON.stringify(source)} in ${workspacePath}.`,
		);
	return { _tag: "ok", value: pattern.replace(/\/$/, "").replace(/^\.\//, "") };
}

/** Patterns from pnpm-workspace.yaml; a file without `packages:` is a single-package workspace. */
function readPnpmWorkspacePatterns(workspacePath: string): Result<readonly string[], CloudflareDeploymentBlocked> {
	let contents: string;
	try {
		contents = readFileSync(workspacePath, "utf8");
	} catch (cause) {
		return blocked(`script resolution cannot read workspace config ${workspacePath}: ${errorMessage(cause)}.`);
	}
	const patterns: string[] = [];
	let inPackages = false;
	for (const line of contents.split(/\r?\n/)) {
		if (/^packages:\s*$/.test(line)) {
			inPackages = true;
			continue;
		}
		if (inPackages && /^\S/.test(line)) break;
		if (!inPackages || /^\s*(?:#|$)/.test(line)) continue;
		const match = line.match(/^\s*-\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))\s*(?:#.*)?$/);
		const pattern = staticWorkspacePattern(match?.[1] ?? match?.[2] ?? match?.[3], line.trim(), workspacePath);
		if (pattern._tag === "err") return pattern;
		patterns.push(pattern.value);
	}
	return { _tag: "ok", value: patterns };
}

/**
 * The `workspaces` patterns of an npm/yarn/bun root package.json: an array of strings or `{ packages: [...] }`.
 * undefined when the manifest declares no workspaces, so the upward search keeps looking.
 */
function readPackageJsonWorkspacePatterns(
	packagePath: string,
): Result<readonly string[], CloudflareDeploymentBlocked> | undefined {
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(packagePath, "utf8"));
	} catch {
		return undefined;
	}
	if (!isStringRecord(manifest) || manifest.workspaces === undefined) return undefined;
	const declared = isStringRecord(manifest.workspaces) ? manifest.workspaces.packages : manifest.workspaces;
	if (!Array.isArray(declared) || declared.some((pattern) => typeof pattern !== "string"))
		return blocked(`script resolution cannot read the static workspaces list in ${packagePath}.`);
	const patterns: string[] = [];
	for (const raw of declared as readonly string[]) {
		const pattern = staticWorkspacePattern(raw, raw, packagePath);
		if (pattern._tag === "err") return pattern;
		patterns.push(pattern.value);
	}
	return { _tag: "ok", value: patterns };
}

type Workspace = { readonly root: string; readonly patterns: readonly string[] };

/**
 * The nearest workspace root above `cwd`: a pnpm-workspace.yaml, or a package.json with `workspaces`
 * (npm, yarn, bun). At one directory pnpm-workspace.yaml wins, as pnpm ignores package.json workspaces.
 */
function findWorkspaceRoot(cwd: string): Result<Workspace, CloudflareDeploymentBlocked> | undefined {
	let current = resolve(cwd);
	while (true) {
		const pnpmPath = join(current, "pnpm-workspace.yaml");
		if (existsSync(pnpmPath)) {
			const patterns = readPnpmWorkspacePatterns(pnpmPath);
			return patterns._tag === "err" ? patterns : { _tag: "ok", value: { root: current, patterns: patterns.value } };
		}
		const packagePath = join(current, "package.json");
		const patterns = existsSync(packagePath) ? readPackageJsonWorkspacePatterns(packagePath) : undefined;
		if (patterns !== undefined)
			return patterns._tag === "err" ? patterns : { _tag: "ok", value: { root: current, patterns: patterns.value } };
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

/** package.json paths of every workspace package, including the workspace root package. */
function workspacePackagePaths(workspace: Workspace): Result<readonly string[], CloudflareDeploymentBlocked> {
	const packagePaths: string[] = [join(workspace.root, "package.json")];
	for (const pattern of workspace.patterns) {
		let directories = [workspace.root];
		for (const segment of pattern.split("/")) {
			if (segment !== "*") {
				directories = directories.map((directory) => join(directory, segment));
				continue;
			}
			const expanded: string[] = [];
			for (const directory of directories) {
				let entries;
				try {
					entries = readdirSync(directory, { withFileTypes: true });
				} catch (cause) {
					const code = (cause as { readonly code?: unknown } | undefined)?.code;
					if (code === "ENOENT" || code === "ENOTDIR") continue;
					return blocked(`script resolution cannot inspect workspace directory ${directory}: ${errorMessage(cause)}.`);
				}
				for (const entry of entries) {
					if (entry.isDirectory()) expanded.push(join(directory, entry.name));
					if (expanded.length > MAX_WORKSPACE_PACKAGES)
						return blocked(`script resolution exceeded ${MAX_WORKSPACE_PACKAGES} workspace packages.`);
				}
			}
			directories = expanded;
		}
		for (const directory of directories) {
			const packagePath = join(directory, "package.json");
			if (!packagePaths.includes(packagePath)) packagePaths.push(packagePath);
		}
		if (packagePaths.length > MAX_WORKSPACE_PACKAGES)
			return blocked(`script resolution exceeded ${MAX_WORKSPACE_PACKAGES} workspace packages.`);
	}
	return { _tag: "ok", value: packagePaths };
}

function requireWorkspace(cwd: string, purpose: string): Result<Workspace, CloudflareDeploymentBlocked> {
	const workspace = findWorkspaceRoot(cwd);
	if (workspace === undefined)
		return blocked(`script resolution cannot apply ${purpose} without pnpm-workspace.yaml or package.json workspaces.`);
	return workspace;
}

function resolveWorkspacePackagePath(
	cwd: string,
	filter: string,
	cache: PackageScriptCache | undefined,
): Result<string, CloudflareDeploymentBlocked> {
	const workspace = requireWorkspace(cwd, `workspace filter ${JSON.stringify(filter)}`);
	if (workspace._tag === "err") return workspace;
	const candidates = workspacePackagePaths(workspace.value);
	if (candidates._tag === "err") return candidates;
	const matches: string[] = [];
	for (const candidate of candidates.value) {
		const manifest = loadCachedPackageScripts(candidate, cache);
		if (manifest.unreadable) continue;
		const relativeDirectory = relative(workspace.value.root, dirname(candidate));
		if (manifest.name === filter || relativeDirectory === filter || `./${relativeDirectory}` === filter)
			matches.push(candidate);
	}
	if (matches.length === 0)
		return blocked(`script resolution found no workspace package for exact filter ${JSON.stringify(filter)}.`);
	if (matches.length > 1)
		return blocked(`script resolution found multiple workspace packages for filter ${JSON.stringify(filter)}.`);
	return { _tag: "ok", value: matches[0] ?? "" };
}

function skipStaticTypeScriptTrivia(contents: string, from: number): number {
	let index = from;
	while (index < contents.length) {
		if (/\s/.test(contents[index] ?? "")) {
			index += 1;
			continue;
		}
		if (contents.startsWith("//", index)) {
			const lineEnd = contents.indexOf("\n", index + 2);
			return lineEnd === -1 ? contents.length : skipStaticTypeScriptTrivia(contents, lineEnd + 1);
		}
		if (contents.startsWith("/*", index)) {
			const commentEnd = contents.indexOf("*/", index + 2);
			return commentEnd === -1 ? contents.length : skipStaticTypeScriptTrivia(contents, commentEnd + 2);
		}
		break;
	}
	return index;
}

function readStaticTypeScriptString(
	contents: string,
	from: number,
): { readonly value: string; readonly end: number } | undefined {
	const quote = contents[from];
	if (quote !== '"' && quote !== "'") return undefined;
	let value = "";
	for (let index = from + 1; index < contents.length; index += 1) {
		const character = contents[index];
		if (character === quote) return { value, end: index + 1 };
		if (character === "\\" || character === "\n" || character === "\r") return undefined;
		value += character;
	}
	return undefined;
}

function skipStaticTypeScriptExpression(contents: string, from: number): number | undefined {
	const closingTokens: string[] = [];
	for (let index = from; index < contents.length; index += 1) {
		const character = contents[index];
		if (character === '"' || character === "'") {
			const literal = readStaticTypeScriptString(contents, index);
			if (literal === undefined) return undefined;
			index = literal.end - 1;
			continue;
		}
		if (character === "`") return undefined;
		if (contents.startsWith("//", index)) {
			const lineEnd = contents.indexOf("\n", index + 2);
			if (lineEnd === -1) return contents.length;
			index = lineEnd;
			continue;
		}
		if (contents.startsWith("/*", index)) {
			const commentEnd = contents.indexOf("*/", index + 2);
			if (commentEnd === -1) return undefined;
			index = commentEnd + 1;
			continue;
		}
		if (character === "(" || character === "[" || character === "{") {
			closingTokens.push(character === "(" ? ")" : character === "[" ? "]" : "}");
			continue;
		}
		if (character === ")" || character === "]" || character === "}") {
			if (closingTokens.length === 0) return index;
			if (closingTokens.pop() !== character) return undefined;
			continue;
		}
		if (character === "," && closingTokens.length === 0) return index;
	}
	return undefined;
}

function findStaticTypeScriptObjectProperty(contents: string, objectStart: number, propertyName: string): number | undefined {
	if (contents[objectStart] !== "{") return undefined;
	let index = objectStart + 1;
	while (index < contents.length) {
		index = skipStaticTypeScriptTrivia(contents, index);
		if (contents[index] === "}") return undefined;
		let key: string;
		const literalKey = readStaticTypeScriptString(contents, index);
		if (literalKey !== undefined) {
			key = literalKey.value;
			index = literalKey.end;
		} else {
			const identifier = contents.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0];
			if (identifier === undefined) return undefined;
			key = identifier;
			index += identifier.length;
		}
		index = skipStaticTypeScriptTrivia(contents, index);
		if (contents[index] !== ":") return undefined;
		const valueStart = skipStaticTypeScriptTrivia(contents, index + 1);
		if (key === propertyName) return valueStart;
		const valueEnd = skipStaticTypeScriptExpression(contents, valueStart);
		if (valueEnd === undefined || contents[valueEnd] === "}") return undefined;
		index = valueEnd + 1;
	}
	return undefined;
}

/** A script or Vite+ task command, with the file it came from. */
export type PackageScriptCommand = {
	readonly sourcePath: string;
	readonly taskName: string;
	readonly command: string;
};

function resolveStaticViteTaskCommand(
	packageDirectory: string,
	taskName: string,
): Result<PackageScriptCommand | undefined, CloudflareDeploymentBlocked> {
	const configPaths = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]
		.map((name) => join(packageDirectory, name))
		.filter((path) => existsSync(path));
	if (configPaths.length === 0) return { _tag: "ok", value: undefined };
	if (configPaths.length > 1) return blocked(`Vite task resolution found multiple config files in ${packageDirectory}.`);
	const configPath = configPaths[0];
	if (configPath === undefined) return { _tag: "ok", value: undefined };
	let contents: string;
	try {
		contents = readFileSync(configPath, "utf8");
	} catch (cause) {
		return blocked(`Vite task resolution cannot read ${configPath}: ${errorMessage(cause)}.`);
	}
	const defineConfigMatch = /\bdefineConfig\s*\(/g.exec(contents);
	if (defineConfigMatch === null) return { _tag: "ok", value: undefined };
	const rootStart = skipStaticTypeScriptTrivia(contents, defineConfigMatch.index + defineConfigMatch[0].length);
	const runStart = findStaticTypeScriptObjectProperty(contents, rootStart, "run");
	const tasksStart = runStart === undefined ? undefined : findStaticTypeScriptObjectProperty(contents, runStart, "tasks");
	const taskStart = tasksStart === undefined ? undefined : findStaticTypeScriptObjectProperty(contents, tasksStart, taskName);
	const commandStart = taskStart === undefined ? undefined : findStaticTypeScriptObjectProperty(contents, taskStart, "command");
	const command = commandStart === undefined ? undefined : readStaticTypeScriptString(contents, commandStart);
	if (command === undefined || command.value.trim().length === 0) return { _tag: "ok", value: undefined };
	return { _tag: "ok", value: { sourcePath: configPath, taskName, command: command.value } };
}

function withAppendedArguments(command: string, appended: readonly string[]): string {
	return appended.length === 0 ? command : `${command} ${appended.map(quoteShellArgument).join(" ")}`;
}

function resolveTaskInPackage(
	packagePath: string,
	task: PackageTask,
	cache: PackageScriptCache | undefined,
): Result<PackageScriptCommand | undefined, CloudflareDeploymentBlocked> {
	if (task.runner === "vp" || task.runner === "vpr") {
		const viteTask = resolveStaticViteTaskCommand(dirname(packagePath), task.taskName);
		if (viteTask._tag === "err") return viteTask;
		if (viteTask.value !== undefined)
			return {
				_tag: "ok",
				value: { ...viteTask.value, command: withAppendedArguments(viteTask.value.command, task.appendedArguments) },
			};
	}
	const manifest = loadCachedPackageScripts(packagePath, cache);
	if (manifest.unreadable) return blocked(`script resolution cannot read or parse ${packagePath}.`);
	const script = manifest.scripts?.[task.taskName];
	if (script === undefined) return { _tag: "ok", value: undefined };
	if (typeof script !== "string" || script.trim().length === 0)
		return blocked(
			`script resolution requires ${JSON.stringify(task.taskName)} in ${packagePath} to be one static non-empty string.`,
		);
	return {
		_tag: "ok",
		value: {
			sourcePath: packagePath,
			taskName: task.taskName,
			command: withAppendedArguments(script, task.appendedArguments),
		},
	};
}

/**
 * Resolves the commands a task runs: one for a single package, or one per workspace package that defines
 * the task for recursive runs. An empty list means no package defines it.
 */
export function resolvePackageTaskCommands(
	task: PackageTask,
	cache: PackageScriptCache | undefined,
): Result<readonly PackageScriptCommand[], CloudflareDeploymentBlocked> {
	let packagePaths: readonly string[];
	if (task.filter !== undefined) {
		const workspacePackage = resolveWorkspacePackagePath(task.packageCwd, task.filter, cache);
		if (workspacePackage._tag === "err") return workspacePackage;
		packagePaths = [workspacePackage.value];
	} else if (task.recursive || task.workspaceRoot) {
		const workspace = requireWorkspace(task.packageCwd, task.recursive ? "a recursive run" : "--workspace-root");
		if (workspace._tag === "err") return workspace;
		if (task.recursive) {
			const all = workspacePackagePaths(workspace.value);
			if (all._tag === "err") return all;
			packagePaths = all.value.filter((path) => existsSync(path));
		} else packagePaths = [join(workspace.value.root, "package.json")];
	} else {
		const packagePath = findFileUpward(task.packageCwd, ["package.json"]);
		if (packagePath === undefined) return blocked(`script resolution found no package.json from ${task.packageCwd}.`);
		packagePaths = [packagePath];
	}
	const commands: PackageScriptCommand[] = [];
	for (const packagePath of packagePaths) {
		const command = resolveTaskInPackage(packagePath, task, cache);
		if (command._tag === "err") return command;
		if (command.value !== undefined) commands.push(command.value);
	}
	return { _tag: "ok", value: commands };
}
