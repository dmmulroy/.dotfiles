import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const POLICY_FILE_NAME = "cloudflare-deployment-allowlist.json";
const POLICY_FILE_PATH = fileURLToPath(new URL(`../${POLICY_FILE_NAME}`, import.meta.url));
const DEFAULT_ENVIRONMENT = "default";
const SHELL_SEPARATORS = new Set(["&&", "||", ";", "|", "\n"]);
const SHELL_META_TOKENS = new Set(["<", ">", ">>", "<<", "&"]);
const WRANGLER_DEPLOY_COMMANDS = new Set(["deploy", "publish"]);
const WRANGLER_VALUE_FLAGS = new Set(["--cwd", "--config", "-c", "--env", "-e", "--name"]);
const CF_VALUE_FLAGS = new Set([
	"--mode",
	"-m",
	"--tag",
	"--message",
	"--profile",
	"--zone",
	"-z",
	"--local-endpoint",
]);
const ALCHEMY_VALUE_FLAGS = new Set([
	"--stage",
	"--profile",
	"--env-file",
	"--log-level",
	"--completions",
]);
const GUARDED_COMMAND_WORD_PATTERN =
	/\b(?:wrangler|cf|alchemy|npx|pnpx|bunx|vpx|npm|pnpm|yarn|bun|vp|vpr)\b/;
const NODE_SCRIPT_PATH_PATTERN = /[.](?:[cm]?[jt]s)(?=["'\s]|$|[;&|])/;
const MAX_PACKAGE_SCRIPT_DEPTH = 12;
const MAX_WORKSPACE_PACKAGES = 1_000;
const DIRECT_MUTATION_COMMANDS = new Set(["rm", "tee", "touch", "truncate"]);
const COPY_MUTATION_COMMANDS = new Set(["cp", "install", "mv", "rsync"]);
const DENY_ALL_DEPLOYMENT_POLICY: CloudflareDeploymentPolicy = {
	version: 2,
	workers: {},
	alchemy: [],
};

type Result<T, E> =
	| { readonly _tag: "ok"; readonly value: T }
	| { readonly _tag: "err"; readonly error: E };

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
		}
	| {
			readonly version: 2;
			readonly workers: Readonly<Record<string, ReadonlySet<string>>>;
			readonly alchemy: readonly AlchemyDeploymentPolicyEntry[];
		};

/** A fail-closed policy or deployment-target error suitable for a Pi BLOCKED reason. */
export class CloudflareDeploymentBlocked extends Error {
	/** Stable error discriminator for fail-closed Cloudflare deployment decisions. */
	readonly _tag = "CloudflareDeploymentBlocked" as const;

	/** Creates an actionable BLOCKED reason from a safe deployment-policy detail. */
	constructor(readonly detail: string) {
		super(`BLOCKED: Cloudflare deployment guard: ${detail}`);
	}
}

/** Observable decision for one agent bash command under the global deployment allowlist. */
export type CloudflareDeploymentDecision =
	| { readonly _tag: "allow"; readonly reason: string }
	| { readonly _tag: "block"; readonly reason: string }
	| { readonly _tag: "unrelated" };

type DeploymentInvocation = {
	readonly cli: "wrangler" | "cf" | "alchemy";
	readonly args: readonly string[];
	readonly environmentVariables: Readonly<Record<string, string>>;
	readonly cwd: string;
};

type DeploymentIntent = {
	readonly cli: "wrangler" | "cf" | "alchemy";
	readonly args: readonly string[];
	readonly environmentVariables: Readonly<Record<string, string>>;
	readonly cwd: string;
	readonly dryRun: boolean;
};

type WranglerConfiguration = {
	readonly topLevelName: string;
	readonly environmentNames: ReadonlySet<string>;
	readonly environmentWorkerNames: Readonly<Record<string, string>>;
};

type WorkerDeploymentTarget = {
	readonly worker: string;
	readonly environment: string;
};

type AlchemyDeploymentTarget = {
	readonly project: string;
	readonly stage: string;
	readonly stack: string | undefined;
};

type CachedPackageScripts = {
	readonly fingerprint: string;
	readonly name: string | undefined;
	readonly scripts: Readonly<Record<string, unknown>> | undefined;
	readonly unreadable: boolean;
};

type DeploymentEvaluationCache = {
	readonly packageScripts: Map<string, CachedPackageScripts>;
	readonly policyRepositoryRoots: WeakMap<CloudflareDeploymentPolicy, ReadonlySet<string>>;
};

type PackageTaskCommandResolution = {
	readonly sourcePath: string;
	readonly taskName: string;
	readonly command: string;
};

type PackageTask = {
	readonly runner: "npm" | "pnpm" | "bun" | "yarn" | "vp" | "vpr";
	readonly taskName: string;
	readonly filter: string | undefined;
	readonly packageCwd: string;
};

type ScriptResolutionContext = {
	readonly depth: number;
	readonly activeScripts: ReadonlySet<string>;
};

type CachedGlobalPolicy = {
	readonly fingerprint: string;
	readonly result: Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked>;
};

function blocked<T>(detail: string): Result<T, CloudflareDeploymentBlocked> {
	return { _tag: "err", error: new CloudflareDeploymentBlocked(detail) };
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
		if (worker.length === 0 || worker.trim() !== worker) {
			return blocked(`invalid ${POLICY_FILE_NAME} Worker name ${JSON.stringify(worker)}.`);
		}
		const parsed = parseExactNames(environments, `entry for ${JSON.stringify(worker)}`);
		if (parsed._tag === "err") return parsed;
		workers[worker] = parsed.value;
	}
	return { _tag: "ok", value: workers };
}

function canonicalExistingPath(path: string): Result<string, CloudflareDeploymentBlocked> {
	try {
		return { _tag: "ok", value: realpathSync(path) };
	} catch (cause) {
		return blocked(
			`project resolution cannot canonicalize ${JSON.stringify(path)}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
}

function findCanonicalRepositoryRoot(path: string): string | undefined {
	let current: string;
	try {
		const canonicalPath = realpathSync(path);
		current = statSync(canonicalPath).isDirectory() ? canonicalPath : dirname(canonicalPath);
	} catch {
		return undefined;
	}
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function isAllowlistedRepositoryWorkingDirectory(
	cwd: string,
	policy: CloudflareDeploymentPolicy,
	cache: DeploymentEvaluationCache | undefined,
): boolean {
	if (policy.version !== 2 || policy.alchemy.length === 0) return false;
	let allowlistedRepositoryRoots = cache?.policyRepositoryRoots.get(policy);
	if (allowlistedRepositoryRoots === undefined) {
		const roots = new Set<string>();
		for (const entry of policy.alchemy) {
			const repositoryRoot = findCanonicalRepositoryRoot(entry.project);
			if (repositoryRoot !== undefined) roots.add(repositoryRoot);
		}
		allowlistedRepositoryRoots = roots;
		cache?.policyRepositoryRoots.set(policy, roots);
	}
	const commandRepository = findCanonicalRepositoryRoot(cwd);
	return commandRepository !== undefined && allowlistedRepositoryRoots.has(commandRepository);
}

/** Parses the versioned global policy; malformed and unknown policy shapes are errors. */
export function parseCloudflareDeploymentPolicy(
	input: unknown,
): Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked> {
	if (!isStringRecord(input) || (input.version !== 1 && input.version !== 2)) {
		return blocked(
			`invalid ${POLICY_FILE_NAME}; expected version 1 workers or version 2 workers plus Alchemy projects.`,
		);
	}
	const workers = parseWorkerPolicy(input.workers);
	if (workers._tag === "err") return workers;
	if (input.version === 1) return { _tag: "ok", value: { version: 1, workers: workers.value } };
	if (!Array.isArray(input.alchemy)) {
		return blocked(`invalid ${POLICY_FILE_NAME}; version 2 requires an "alchemy" array.`);
	}

	const alchemy: AlchemyDeploymentPolicyEntry[] = [];
	const projects = new Set<string>();
	for (const [index, entry] of input.alchemy.entries()) {
		if (
			!isStringRecord(entry) ||
			typeof entry.project !== "string" ||
			!isAbsolute(entry.project) ||
			(entry.stack !== undefined &&
				(typeof entry.stack !== "string" ||
					entry.stack.length === 0 ||
					entry.stack.trim() !== entry.stack))
		)
			return blocked(
				`invalid ${POLICY_FILE_NAME} Alchemy entry at index ${index}; project must be an absolute existing entrypoint path.`,
			);
		const project = canonicalExistingPath(entry.project);
		if (project._tag === "err") return project;
		if (projects.has(project.value))
			return blocked(
				`conflicting ${POLICY_FILE_NAME} Alchemy entries for canonical project ${JSON.stringify(project.value)}.`,
			);
		const stages = parseExactNames(entry.stages, `Alchemy stages at index ${index}`);
		if (stages._tag === "err") return stages;
		projects.add(project.value);
		alchemy.push({
			project: project.value,
			stages: stages.value,
			...(typeof entry.stack === "string" ? { stack: entry.stack } : {}),
		});
	}
	return { _tag: "ok", value: { version: 2, workers: workers.value, alchemy } };
}

function tokenizeShell(command: string): Result<readonly string[], CloudflareDeploymentBlocked> {
	const tokens: string[] = [];
	let token = "";
	let quote: "'" | '"' | undefined;

	const pushToken = () => {
		if (token.length > 0) tokens.push(token);
		token = "";
	};

	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (character === undefined) continue;
		if (quote !== undefined) {
			if (character === quote) quote = undefined;
			else if (character === "$" && quote === '"') {
				return blocked(
					"unresolved shell variables around a recognized deployment make its intent dynamic.",
				);
			} else if (character === "\\" && quote === '"' && command[index + 1] !== undefined) {
				token += command[index + 1];
				index += 1;
			} else token += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "`" || (character === "$" && command[index + 1] === "(")) {
			return blocked(
				"ambiguous shell evaluation around a recognized deployment must be split into a direct command.",
			);
		}
		if (character === "$") {
			return blocked(
				"unresolved shell variables around a recognized deployment make its intent dynamic.",
			);
		}
		if (character === "\\" && command[index + 1] !== undefined) {
			token += command[index + 1];
			index += 1;
			continue;
		}
		if (/\s/.test(character)) {
			pushToken();
			if (character === "\n") tokens.push("\n");
			continue;
		}
		if (/[;&|<>]/.test(character)) {
			pushToken();
			const pair = character + (command[index + 1] ?? "");
			if (["&&", "||", ">>", "<<"].includes(pair)) {
				tokens.push(pair);
				index += 1;
			} else tokens.push(character);
			continue;
		}
		token += character;
	}
	if (quote !== undefined)
		return blocked("unterminated shell quote makes the deployment target ambiguous.");
	pushToken();
	return { _tag: "ok", value: tokens };
}

function splitShellSegments(tokens: readonly string[]): readonly (readonly string[])[] {
	return splitShellSegmentsWithSeparators(tokens).map((segment) => segment.tokens);
}

type ShellSegment = {
	readonly tokens: readonly string[];
	readonly precedingSeparator: string | undefined;
};

function splitShellSegmentsWithSeparators(tokens: readonly string[]): readonly ShellSegment[] {
	const segments: Array<{ tokens: string[]; precedingSeparator: string | undefined }> = [
		{ tokens: [], precedingSeparator: undefined },
	];
	for (const token of tokens) {
		if (SHELL_SEPARATORS.has(token)) segments.push({ tokens: [], precedingSeparator: token });
		else segments.at(-1)?.tokens.push(token);
	}
	return segments;
}

function parseEnvironmentAssignments(tokens: readonly string[]): {
	readonly rest: readonly string[];
	readonly values: Readonly<Record<string, string>>;
} {
	const values: Record<string, string> = {};
	let index = 0;
	if (tokens[0] === "env") index = 1;
	while (index < tokens.length) {
		const match = tokens[index]?.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (match === null || match === undefined) break;
		const name = match[1];
		const value = match[2];
		if (name !== undefined && value !== undefined) values[name] = value;
		index += 1;
	}
	return { rest: tokens.slice(index), values };
}

function executableName(token: string): string {
	const slashIndex = token.lastIndexOf("/");
	return slashIndex === -1 ? token : token.slice(slashIndex + 1);
}

function mentionsCloudflareDeployment(command: string): boolean {
	return (
		/\b(?:wrangler|cf)\b[\s\S]*(?:\b(?:deploy|publish)\b|\bworkers\s+deployments\s+create\b)/.test(
			command,
		) || /\balchemy\b[\s\S]*\b(?:deploy|destroy)\b/.test(command)
	);
}

function unwrapCloudflareCli(
	tokens: readonly string[],
): { cli: "wrangler" | "cf" | "alchemy"; args: readonly string[] } | undefined {
	if (tokens.length === 0) return undefined;
	const executable = executableName(tokens[0] ?? "");
	if (executable === "wrangler" || executable === "cf" || executable === "alchemy") {
		return { cli: executable, args: tokens.slice(1) };
	}

	let searchFrom: number | undefined;
	if (["npx", "pnpx", "bunx", "vpx"].includes(executable)) searchFrom = 1;
	else if (["pnpm", "npm"].includes(executable) && ["exec", "dlx"].includes(tokens[1] ?? ""))
		searchFrom = 2;
	else if (executable === "yarn") searchFrom = ["exec", "dlx"].includes(tokens[1] ?? "") ? 2 : 1;
	else if (executable === "bun" && tokens[1] === "x") searchFrom = 2;
	else if (executable === "vp" && ["exec", "dlx"].includes(tokens[1] ?? "")) searchFrom = 2;
	if (searchFrom === undefined) return undefined;

	for (let index = searchFrom; index < tokens.length; index += 1) {
		const packageName = tokens[index]?.replace(/@(?:latest|next|\d.*)$/, "");
		if (packageName === "wrangler" || packageName === "cf" || packageName === "alchemy") {
			return { cli: packageName, args: tokens.slice(index + 1) };
		}
	}
	return undefined;
}

function isPackageTaskRunner(value: string): value is PackageTask["runner"] {
	return (
		value === "npm" ||
		value === "pnpm" ||
		value === "bun" ||
		value === "yarn" ||
		value === "vp" ||
		value === "vpr"
	);
}

function parsePackageTask(
	tokens: readonly string[],
	cwd: string,
): Result<PackageTask | undefined, CloudflareDeploymentBlocked> {
	const assignment = parseEnvironmentAssignments(tokens);
	const executable = executableName(assignment.rest[0] ?? "");
	if (!isPackageTaskRunner(executable)) {
		return { _tag: "ok", value: undefined };
	}
	const args = assignment.rest.slice(1);
	if (["exec", "dlx", "x", "wrangler", "cf", "alchemy"].includes(args[0] ?? ""))
		return { _tag: "ok", value: undefined };
	const requiresRunWord = executable === "npm" || executable === "bun";
	const hasRunWord = args.includes("run") || args.includes("run-script");
	if (requiresRunWord && !hasRunWord) return { _tag: "ok", value: undefined };

	const filterValues: string[] = [];
	const cwdValues: string[] = [];
	let taskName: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === undefined || argument === "run" || argument === "run-script") continue;
		if (argument === "--") {
			if (args[index + 1] !== undefined)
				return blocked("script resolution rejects arguments appended dynamically after --.");
			continue;
		}
		const equalsOption = argument.match(/^(--filter|--workspace|--cwd|--dir)=(.*)$/);
		if (equalsOption?.[1] !== undefined && equalsOption[2] !== undefined) {
			if (["--filter", "--workspace"].includes(equalsOption[1])) filterValues.push(equalsOption[2]);
			else cwdValues.push(equalsOption[2]);
			continue;
		}
		if (["--filter", "-F", "--workspace"].includes(argument)) {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("-"))
				return blocked(`script resolution option ${argument} requires one exact workspace value.`);
			filterValues.push(value);
			index += 1;
			continue;
		}
		if (["--cwd", "--dir", "-C"].includes(argument)) {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("-"))
				return blocked(`script resolution option ${argument} requires a directory.`);
			cwdValues.push(value);
			index += 1;
			continue;
		}
		if (["--concurrency-limit", "--log", "--prefix"].includes(argument)) {
			if (args[index + 1] === undefined)
				return blocked(`script resolution option ${argument} requires a value.`);
			index += 1;
			continue;
		}
		if (["-w", "--workspace-root"].includes(argument)) continue;
		if (argument.startsWith("-"))
			return blocked(
				`script resolution does not support package-runner option ${JSON.stringify(argument)}.`,
			);
		if (taskName !== undefined)
			return blocked("script resolution found multiple task names or appended task arguments.");
		taskName = argument;
	}
	if (taskName === undefined) return { _tag: "ok", value: undefined };
	if (new Set(cwdValues).size > 1)
		return blocked("script resolution found conflicting package working directories.");
	const viteTaskSelector =
		["vp", "vpr"].includes(executable) && taskName.includes("#") ? taskName.split("#") : undefined;
	if (
		viteTaskSelector !== undefined &&
		(viteTaskSelector.length !== 2 ||
			viteTaskSelector[0]?.length === 0 ||
			viteTaskSelector[1]?.length === 0)
	)
		return blocked("Vite task resolution requires one exact package#task selector.");
	if (viteTaskSelector?.[0] !== undefined) filterValues.push(viteTaskSelector[0]);
	if (new Set(filterValues).size > 1)
		return blocked("script resolution found conflicting workspace filters.");
	const filter = filterValues[0];
	if (filter !== undefined && !/^[A-Za-z0-9@._/-]+$/.test(filter)) {
		return blocked(
			`script resolution requires an exact, non-dynamic workspace filter; received ${JSON.stringify(filter)}.`,
		);
	}
	return {
		_tag: "ok",
		value: {
			runner: executable,
			taskName: viteTaskSelector?.[1] ?? taskName,
			filter,
			packageCwd: resolve(cwd, cwdValues[0] ?? "."),
		},
	};
}

function fileFingerprint(path: string): string {
	const stats = statSync(path, { bigint: true });
	return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;
}

function loadCachedPackageScripts(
	packagePath: string,
	cache: DeploymentEvaluationCache | undefined,
): CachedPackageScripts {
	let fingerprint: string;
	try {
		fingerprint = fileFingerprint(packagePath);
	} catch {
		return { fingerprint: "missing", name: undefined, scripts: undefined, unreadable: true };
	}
	const cached = cache?.packageScripts.get(packagePath);
	if (cached?.fingerprint === fingerprint) return cached;

	let loaded: CachedPackageScripts;
	try {
		const manifest: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
		loaded = {
			fingerprint,
			name:
				isStringRecord(manifest) && typeof manifest.name === "string" ? manifest.name : undefined,
			scripts:
				isStringRecord(manifest) && isStringRecord(manifest.scripts) ? manifest.scripts : undefined,
			unreadable: false,
		};
	} catch {
		loaded = { fingerprint, name: undefined, scripts: undefined, unreadable: true };
	}
	cache?.packageScripts.set(packagePath, loaded);
	return loaded;
}

function readPnpmWorkspacePatterns(
	workspacePath: string,
): Result<readonly string[], CloudflareDeploymentBlocked> {
	let contents: string;
	try {
		contents = readFileSync(workspacePath, "utf8");
	} catch (cause) {
		return blocked(
			`script resolution cannot read workspace config ${workspacePath}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
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
		const pattern = match?.[1] ?? match?.[2] ?? match?.[3];
		if (
			pattern === undefined ||
			pattern.startsWith("!") ||
			/[$?!{}[\]]/.test(pattern) ||
			(pattern.match(/\*/g)?.length ?? 0) > 1
		) {
			return blocked(
				`script resolution cannot safely interpret workspace package pattern ${JSON.stringify(line.trim())}.`,
			);
		}
		patterns.push(pattern.replace(/\/$/, ""));
	}
	return patterns.length === 0
		? blocked(`script resolution found no static package patterns in ${workspacePath}.`)
		: { _tag: "ok", value: patterns };
}

function workspacePackagePaths(
	workspaceRoot: string,
	patterns: readonly string[],
): Result<readonly string[], CloudflareDeploymentBlocked> {
	const packagePaths: string[] = [];
	for (const pattern of patterns) {
		const star = pattern.indexOf("*");
		if (star === -1) {
			packagePaths.push(join(workspaceRoot, pattern, "package.json"));
			continue;
		}
		const prefix = pattern.slice(0, star).replace(/\/$/, "");
		const suffix = pattern.slice(star + 1).replace(/^\//, "");
		let entries;
		try {
			entries = readdirSync(join(workspaceRoot, prefix), { withFileTypes: true });
		} catch (cause) {
			return blocked(
				`script resolution cannot inspect workspace directory ${join(workspaceRoot, prefix)}: ${cause instanceof Error ? cause.message : String(cause)}.`,
			);
		}
		for (const entry of entries) {
			if (entry.isDirectory())
				packagePaths.push(join(workspaceRoot, prefix, entry.name, suffix, "package.json"));
			if (packagePaths.length > MAX_WORKSPACE_PACKAGES)
				return blocked(`script resolution exceeded ${MAX_WORKSPACE_PACKAGES} workspace packages.`);
		}
	}
	return { _tag: "ok", value: packagePaths };
}

function resolveWorkspacePackagePath(
	cwd: string,
	filter: string,
	cache: DeploymentEvaluationCache | undefined,
): Result<string, CloudflareDeploymentBlocked> {
	const workspacePath = findFileUpward(cwd, ["pnpm-workspace.yaml"]);
	if (workspacePath === undefined)
		return blocked(
			`script resolution cannot apply workspace filter ${JSON.stringify(filter)} without pnpm-workspace.yaml.`,
		);
	const patterns = readPnpmWorkspacePatterns(workspacePath);
	if (patterns._tag === "err") return patterns;
	const workspaceRoot = dirname(workspacePath);
	const candidates = workspacePackagePaths(workspaceRoot, patterns.value);
	if (candidates._tag === "err") return candidates;
	const matches: string[] = [];
	for (const candidate of candidates.value) {
		const manifest = loadCachedPackageScripts(candidate, cache);
		if (manifest.unreadable) continue;
		const relativeDirectory = relative(workspaceRoot, dirname(candidate));
		if (
			manifest.name === filter ||
			relativeDirectory === filter ||
			`./${relativeDirectory}` === filter
		)
			matches.push(candidate);
	}
	if (matches.length === 0)
		return blocked(
			`script resolution found no workspace package for exact filter ${JSON.stringify(filter)}.`,
		);
	if (matches.length > 1)
		return blocked(
			`script resolution found multiple workspace packages for filter ${JSON.stringify(filter)}.`,
		);
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
			return commentEnd === -1
				? contents.length
				: skipStaticTypeScriptTrivia(contents, commentEnd + 2);
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

function findStaticTypeScriptObjectProperty(
	contents: string,
	objectStart: number,
	propertyName: string,
): number | undefined {
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

function resolveStaticViteTaskCommand(
	packageDirectory: string,
	taskName: string,
): Result<PackageTaskCommandResolution | undefined, CloudflareDeploymentBlocked> {
	const configNames = [
		"vite.config.ts",
		"vite.config.mts",
		"vite.config.js",
		"vite.config.mjs",
	] as const;
	const configPaths = configNames
		.map((name) => join(packageDirectory, name))
		.filter((path) => existsSync(path));
	if (configPaths.length === 0) return { _tag: "ok", value: undefined };
	if (configPaths.length > 1)
		return blocked(`Vite task resolution found multiple config files in ${packageDirectory}.`);
	const configPath = configPaths[0];
	if (configPath === undefined) return { _tag: "ok", value: undefined };
	let contents: string;
	try {
		contents = readFileSync(configPath, "utf8");
	} catch (cause) {
		return blocked(
			`Vite task resolution cannot read ${configPath}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	const defineConfigMatch = /\bdefineConfig\s*\(/g.exec(contents);
	if (defineConfigMatch === null) return { _tag: "ok", value: undefined };
	const rootStart = skipStaticTypeScriptTrivia(contents, defineConfigMatch.index + defineConfigMatch[0].length);
	const runStart = findStaticTypeScriptObjectProperty(contents, rootStart, "run");
	const tasksStart =
		runStart === undefined ? undefined : findStaticTypeScriptObjectProperty(contents, runStart, "tasks");
	const taskStart =
		tasksStart === undefined
			? undefined
			: findStaticTypeScriptObjectProperty(contents, tasksStart, taskName);
	const commandStart =
		taskStart === undefined
			? undefined
			: findStaticTypeScriptObjectProperty(contents, taskStart, "command");
	const command =
		commandStart === undefined ? undefined : readStaticTypeScriptString(contents, commandStart);
	if (command === undefined || command.value.trim().length === 0)
		return { _tag: "ok", value: undefined };
	return {
		_tag: "ok",
		value: { sourcePath: configPath, taskName, command: command.value },
	};
}

function resolvePackageTaskCommand(
	task: PackageTask,
	cache: DeploymentEvaluationCache | undefined,
): Result<PackageTaskCommandResolution | undefined, CloudflareDeploymentBlocked> {
	let packagePath: string | undefined;
	if (task.filter === undefined)
		packagePath = findFileUpward(task.packageCwd, ["package.json"]);
	else {
		const workspacePackage = resolveWorkspacePackagePath(task.packageCwd, task.filter, cache);
		if (workspacePackage._tag === "err") return workspacePackage;
		packagePath = workspacePackage.value;
	}
	if (packagePath === undefined)
		return blocked(`script resolution found no package.json from ${task.packageCwd}.`);
	if (task.runner === "vp" || task.runner === "vpr") {
		const viteTask = resolveStaticViteTaskCommand(dirname(packagePath), task.taskName);
		if (viteTask._tag === "err" || viteTask.value !== undefined) return viteTask;
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
		value: { sourcePath: packagePath, taskName: task.taskName, command: script },
	};
}

function findStaticNodeDeploymentScript(
	segment: readonly string[],
	cwd: string,
): string | undefined {
	const assignment = parseEnvironmentAssignments(segment);
	if (executableName(assignment.rest[0] ?? "") !== "node") return undefined;
	const scriptArgument = assignment.rest[1];
	if (
		scriptArgument === undefined ||
		scriptArgument.startsWith("-") ||
		!/[.](?:[cm]?[jt]s)$/.test(scriptArgument)
	)
		return undefined;
	let scriptPath: string;
	let contents: string;
	try {
		scriptPath = realpathSync(resolve(cwd, scriptArgument));
		contents = readFileSync(scriptPath, "utf8");
	} catch {
		return undefined;
	}
	return mentionsCloudflareDeployment(contents) ? scriptPath : undefined;
}

function parseDeploymentInvocation(
	segment: readonly string[],
	cwd: string,
	ambientEnvironment: Readonly<Record<string, string>>,
): DeploymentInvocation | undefined {
	const metaIndex = segment.findIndex((token) => SHELL_META_TOKENS.has(token));
	const commandTokens = segment.slice(0, metaIndex === -1 ? segment.length : metaIndex);
	const assignment = parseEnvironmentAssignments(commandTokens);
	const cli = unwrapCloudflareCli(assignment.rest);
	if (cli === undefined) return undefined;
	return { ...cli, environmentVariables: { ...ambientEnvironment, ...assignment.values }, cwd };
}

function hasEnabledBooleanFlag(args: readonly string[], longName: string): boolean {
	return args.some((argument) => argument === longName || argument === `${longName}=true`);
}

function deploymentCommandWords(invocation: DeploymentInvocation): readonly string[] {
	const valueFlags =
		invocation.cli === "wrangler"
			? WRANGLER_VALUE_FLAGS
			: invocation.cli === "cf"
				? CF_VALUE_FLAGS
				: ALCHEMY_VALUE_FLAGS;
	const words: string[] = [];
	for (let index = 0; index < invocation.args.length; index += 1) {
		const argument = invocation.args[index];
		if (argument === undefined) continue;
		if (valueFlags.has(argument)) {
			index += 1;
			continue;
		}
		if (argument.startsWith("-")) continue;
		words.push(argument);
	}
	return words;
}

function hasAdjacentArguments(args: readonly string[], first: string, second: string): boolean {
	return args.some((argument, index) => argument === first && args[index + 1] === second);
}

function destructiveDeploymentDecision(
	invocation: DeploymentInvocation,
): CloudflareDeploymentDecision | undefined {
	if (invocation.args.some((argument) => argument === "--help" || argument === "-h"))
		return undefined;
	if (invocation.cli === "alchemy" && deploymentCommandWords(invocation)[0] === "destroy") {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				"Alchemy destroy is destructive and is never authorized by the deployment allowlist.",
			).message,
		};
	}
	if (invocation.cli !== "wrangler") {
		return undefined;
	}
	const positional = deploymentCommandWords(invocation);
	if (positional[0] !== "delete") return undefined;
	const worker = positional[1];
	return {
		_tag: "block",
		reason: new CloudflareDeploymentBlocked(
			`Wrangler Worker deletion${worker === undefined ? "" : ` for ${JSON.stringify(worker)}`} is destructive and is never authorized by the deployment allowlist.`,
		).message,
	};
}

function deploymentIntent(invocation: DeploymentInvocation): DeploymentIntent | undefined {
	const positional = deploymentCommandWords(invocation);
	if (invocation.cli === "alchemy") {
		if (invocation.args.some((argument) => argument === "--help" || argument === "-h"))
			return undefined;
		if (positional[0] !== "deploy") return undefined;
		return { ...invocation, dryRun: hasEnabledBooleanFlag(invocation.args, "--dry-run") };
	}
	if (invocation.cli === "wrangler") {
		if (invocation.args.some((argument) => argument === "--help" || argument === "-h"))
			return undefined;
		const isDeploy = invocation.args.some((argument) => WRANGLER_DEPLOY_COMMANDS.has(argument));
		const isVersionsDeploy = hasAdjacentArguments(invocation.args, "versions", "deploy");
		const isTriggersDeploy = hasAdjacentArguments(invocation.args, "triggers", "deploy");
		if (!isDeploy && !isVersionsDeploy && !isTriggersDeploy) return undefined;
		return {
			...invocation,
			dryRun: isDeploy && hasEnabledBooleanFlag(invocation.args, "--dry-run"),
		};
	}

	const isDeploy = positional[0] === "deploy";
	const isTrafficDeploy = positional[0] === "versions" && positional[1] === "deploy";
	const isWorkersDeploymentCreate =
		positional[0] === "workers" && positional[1] === "deployments" && positional[2] === "create";
	if (!isDeploy && !isTrafficDeploy && !isWorkersDeploymentCreate) return undefined;
	return { ...invocation, dryRun: isDeploy && hasEnabledBooleanFlag(invocation.args, "--dry-run") };
}

function readFlagValues(args: readonly string[], names: readonly string[]): readonly string[] {
	const values: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === undefined) continue;
		const matchingName = names.find((name) => argument === name || argument.startsWith(`${name}=`));
		if (matchingName === undefined) continue;
		if (argument === matchingName) {
			const value = args[index + 1];
			if (value !== undefined && !value.startsWith("-")) values.push(value);
			else values.push("");
			index += 1;
		} else values.push(argument.slice(matchingName.length + 1));
	}
	return values;
}

function oneFlagValue(
	args: readonly string[],
	names: readonly string[],
	label: string,
): Result<string | undefined, CloudflareDeploymentBlocked> {
	const values = readFlagValues(args, names);
	if (values.some((value) => value.length === 0)) return blocked(`${label} requires a value.`);
	if (new Set(values).size > 1)
		return blocked(`conflicting ${label} values make the deployment target ambiguous.`);
	return { _tag: "ok", value: values[0] };
}

function stripJsonComments(input: string): string {
	let output = "";
	let inString = false;
	let escaped = false;
	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];
		const next = input[index + 1];
		if (inString) {
			output += character;
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') {
			inString = true;
			output += character;
		} else if (character === "/" && next === "/") {
			while (index < input.length && input[index] !== "\n") index += 1;
			output += "\n";
		} else if (character === "/" && next === "*") {
			index += 2;
			while (index < input.length && !(input[index] === "*" && input[index + 1] === "/"))
				index += 1;
			index += 1;
		} else output += character;
	}
	let withoutTrailingCommas = "";
	inString = false;
	escaped = false;
	for (let index = 0; index < output.length; index += 1) {
		const character = output[index];
		if (inString) {
			withoutTrailingCommas += character;
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') inString = true;
		if (character === ",") {
			let nextIndex = index + 1;
			while (/\s/.test(output[nextIndex] ?? "")) nextIndex += 1;
			if (["}", "]"].includes(output[nextIndex] ?? "")) continue;
		}
		withoutTrailingCommas += character;
	}
	return withoutTrailingCommas;
}

function parseJsonWranglerConfiguration(
	contents: string,
	path: string,
): Result<WranglerConfiguration, CloudflareDeploymentBlocked> {
	let value: unknown;
	try {
		value = JSON.parse(stripJsonComments(contents));
	} catch (cause) {
		return blocked(
			`cannot parse Wrangler config ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	if (!isStringRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
		return blocked(
			`Wrangler config ${path} needs a non-empty top-level "name" to resolve the Worker application.`,
		);
	}
	const environmentNames = new Set<string>();
	const environmentWorkerNames: Record<string, string> = {};
	if (value.env !== undefined) {
		if (!isStringRecord(value.env))
			return blocked(`Wrangler config ${path} has an invalid "env" object.`);
		for (const [environment, settings] of Object.entries(value.env)) {
			environmentNames.add(environment);
			if (
				isStringRecord(settings) &&
				typeof settings.name === "string" &&
				settings.name.length > 0
			) {
				environmentWorkerNames[environment] = settings.name;
			}
		}
	}
	return {
		_tag: "ok",
		value: { topLevelName: value.name, environmentNames, environmentWorkerNames },
	};
}

function parseTomlString(value: string): string | undefined {
	const match = value.trim().match(/^(["'])(.*)\1\s*(?:#.*)?$/);
	if (match?.[2] === undefined || match[2].includes("\\")) return undefined;
	return match[2];
}

function tomlEnvironmentName(section: string): string | undefined {
	const match = section.match(/^env\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))(?:\.|$)/);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function parseTomlWranglerConfiguration(
	contents: string,
	path: string,
): Result<WranglerConfiguration, CloudflareDeploymentBlocked> {
	let section = "";
	let topLevelName: string | undefined;
	const environmentNames = new Set<string>();
	const environmentWorkerNames: Record<string, string> = {};
	for (const line of contents.split(/\r?\n/)) {
		const sectionMatch = line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/);
		if (sectionMatch?.[1] !== undefined) {
			section = sectionMatch[1].trim();
			const environment = tomlEnvironmentName(section);
			if (section.startsWith("env.") && environment === undefined) {
				return blocked(
					`Wrangler config ${path} has an environment section the guard cannot parse safely: [${section}].`,
				);
			}
			if (environment !== undefined) environmentNames.add(environment);
			continue;
		}
		const nameMatch = line.match(/^\s*name\s*=\s*(.+)$/);
		if (nameMatch?.[1] === undefined) continue;
		const name = parseTomlString(nameMatch[1]);
		if (name === undefined || name.length === 0)
			return blocked(`Wrangler config ${path} has an invalid name value.`);
		if (section === "") topLevelName = name;
		else {
			const environment = tomlEnvironmentName(section);
			if (
				environment !== undefined &&
				[`env.${environment}`, `env."${environment}"`, `env.'${environment}'`].includes(section)
			)
				environmentWorkerNames[environment] = name;
		}
	}
	if (topLevelName === undefined)
		return blocked(
			`Wrangler config ${path} needs a non-empty top-level name to resolve the Worker application.`,
		);
	return { _tag: "ok", value: { topLevelName, environmentNames, environmentWorkerNames } };
}

function findFileUpward(start: string, fileNames: readonly string[]): string | undefined {
	let current = resolve(start);
	while (true) {
		for (const fileName of fileNames) {
			const candidate = join(current, fileName);
			if (existsSync(candidate)) return candidate;
		}
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function findWranglerConfiguration(start: string): string | undefined {
	return findFileUpward(start, ["wrangler.json", "wrangler.jsonc", "wrangler.toml"]);
}

function loadWranglerConfiguration(
	path: string,
): Result<WranglerConfiguration, CloudflareDeploymentBlocked> {
	let contents: string;
	try {
		contents = readFileSync(path, "utf8");
	} catch (cause) {
		return blocked(
			`cannot read Wrangler config ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	return path.endsWith(".toml")
		? parseTomlWranglerConfiguration(contents, path)
		: parseJsonWranglerConfiguration(contents, path);
}

function resolveWranglerTarget(
	intent: DeploymentIntent,
): Result<WorkerDeploymentTarget, CloudflareDeploymentBlocked> {
	const cwd = oneFlagValue(intent.args, ["--cwd"], "--cwd");
	if (cwd._tag === "err") return cwd;
	const effectiveCwd = resolve(intent.cwd, cwd.value ?? ".");
	const config = oneFlagValue(intent.args, ["--config", "-c"], "--config/-c");
	if (config._tag === "err") return config;
	const configPath =
		config.value === undefined
			? findWranglerConfiguration(effectiveCwd)
			: resolve(effectiveCwd, config.value);
	if (configPath === undefined)
		return blocked(
			`no Wrangler config found from ${effectiveCwd}; pass --config so the Worker application is explicit.`,
		);
	const configuration = loadWranglerConfiguration(configPath);
	if (configuration._tag === "err") return configuration;

	const cliEnvironment = oneFlagValue(intent.args, ["--env", "-e"], "--env/-e");
	if (cliEnvironment._tag === "err") return cliEnvironment;
	const environment =
		cliEnvironment.value ?? intent.environmentVariables.CLOUDFLARE_ENV ?? DEFAULT_ENVIRONMENT;
	if (environment.length === 0) return blocked("CLOUDFLARE_ENV must not be empty.");
	if (
		environment !== DEFAULT_ENVIRONMENT &&
		!configuration.value.environmentNames.has(environment)
	) {
		return blocked(`unknown Wrangler environment ${JSON.stringify(environment)} in ${configPath}.`);
	}
	const cliName = oneFlagValue(intent.args, ["--name"], "--name");
	if (cliName._tag === "err") return cliName;
	const worker =
		cliName.value ??
		configuration.value.environmentWorkerNames[environment] ??
		configuration.value.topLevelName;
	return { _tag: "ok", value: { worker, environment } };
}

function readCfPrebuiltWorkerName(cwd: string): Result<string, CloudflareDeploymentBlocked> {
	const configPath = join(cwd, ".cloudflare", "output", "v0", "workers", "default", "config.json");
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (cause) {
		return blocked(
			`cannot read cf --prebuilt Worker output ${configPath}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	if (!isStringRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
		return blocked(`cf --prebuilt Worker output ${configPath} needs a non-empty "name".`);
	}
	return { _tag: "ok", value: value.name };
}

function confirmCfWranglerProject(cwd: string): Result<undefined, CloudflareDeploymentBlocked> {
	const manifestPath = findFileUpward(cwd, ["package.json", "pyproject.toml", "Cargo.toml"]);
	if (manifestPath === undefined)
		return blocked("cf project discovery found no package.json, pyproject.toml, or Cargo.toml.");
	if (!manifestPath.endsWith("package.json")) {
		return blocked(
			`cf project discovery selected ${manifestPath}; Python and Rust dev-server deployment targets cannot be resolved before build with confidence.`,
		);
	}
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch (cause) {
		return blocked(
			`cannot parse cf project manifest ${manifestPath}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	if (!isStringRecord(manifest))
		return blocked(`cf project manifest ${manifestPath} is not an object.`);
	const dependencies = {
		...(isStringRecord(manifest.dependencies) ? manifest.dependencies : {}),
		...(isStringRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
	};
	if ("@cloudflare/vite-plugin" in dependencies) {
		return blocked(
			"cf project discovery delegates to the Cloudflare Vite plugin, whose generated Worker target cannot be resolved before build with confidence.",
		);
	}
	if (!("wrangler" in dependencies)) {
		return blocked(
			"cf project discovery cannot confirm Wrangler as the installed Cloudflare dev server from package.json.",
		);
	}
	return { _tag: "ok", value: undefined };
}

function resolveCfTarget(
	intent: DeploymentIntent,
): Result<WorkerDeploymentTarget, CloudflareDeploymentBlocked> {
	const positional = deploymentCommandWords(intent);
	if (positional[0] === "versions") {
		return blocked(
			"cf versions deploy changes traffic but v0.6.0 does not expose enough application/environment identity to authorize it safely.",
		);
	}
	if (
		positional[0] === "workers" &&
		positional[1] === "deployments" &&
		positional[2] === "create"
	) {
		return blocked(
			"cf workers deployments create changes Worker traffic directly, but --worker identifies only a script and provides no logical allowlist environment; ask the user to perform this traffic deployment manually.",
		);
	}
	const mode = oneFlagValue(intent.args, ["--mode", "-m"], "--mode/-m");
	if (mode._tag === "err") return mode;
	if (mode.value === undefined)
		return blocked(
			"cf deploy requires an explicit --mode/-m because its omitted deployment mode cannot be resolved confidently.",
		);
	if (hasEnabledBooleanFlag(intent.args, "--prebuilt")) {
		const worker = readCfPrebuiltWorkerName(intent.cwd);
		return worker._tag === "err"
			? worker
			: { _tag: "ok", value: { worker: worker.value, environment: mode.value } };
	}
	const project = confirmCfWranglerProject(intent.cwd);
	if (project._tag === "err") return project;
	const configPath = findWranglerConfiguration(intent.cwd);
	if (configPath === undefined) {
		return blocked(
			"cf deploy project discovery did not yield a readable Wrangler config; the Worker application cannot be authorized before build with confidence.",
		);
	}
	const configuration = loadWranglerConfiguration(configPath);
	if (configuration._tag === "err") return configuration;
	const worker =
		configuration.value.environmentWorkerNames[mode.value] ?? configuration.value.topLevelName;
	return { _tag: "ok", value: { worker, environment: mode.value } };
}

function staticallyReadAlchemyStackName(contents: string): string | undefined {
	const names: string[] = [];
	let index = 0;
	while (index < contents.length) {
		const character = contents[index];
		const next = contents[index + 1];
		if (character === "/" && next === "/") {
			index = contents.indexOf("\n", index + 2);
			if (index === -1) break;
			continue;
		}
		if (character === "/" && next === "*") {
			index = contents.indexOf("*/", index + 2);
			if (index === -1) return undefined;
			index += 2;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			const quote = character;
			index += 1;
			while (index < contents.length && contents[index] !== quote) {
				if (contents[index] === "\\") index += 1;
				index += 1;
			}
			if (index >= contents.length) return undefined;
			index += 1;
			continue;
		}
		if (
			contents.startsWith("Alchemy.Stack", index) &&
			!/[A-Za-z0-9_$.]/.test(contents[index - 1] ?? "")
		) {
			index += "Alchemy.Stack".length;
			while (/\s/.test(contents[index] ?? "")) index += 1;
			if (contents[index] !== "(") continue;
			index += 1;
			while (/\s/.test(contents[index] ?? "")) index += 1;
			const quote = contents[index];
			if (quote !== '"' && quote !== "'") return undefined;
			const start = index + 1;
			index = contents.indexOf(quote, start);
			if (index === -1) return undefined;
			const name = contents.slice(start, index);
			if (!/^[A-Za-z0-9_-]+$/.test(name)) return undefined;
			index += 1;
			while (/\s/.test(contents[index] ?? "")) index += 1;
			if (contents[index] !== ",") return undefined;
			names.push(name);
			continue;
		}
		index += 1;
	}
	return names.length === 1 ? names[0] : undefined;
}

function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveRelativeTypeScriptModule(
	importingPath: string,
	specifier: string,
): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const unresolved = resolve(dirname(importingPath), specifier);
	const candidates = /\.[cm]?[jt]sx?$/.test(unresolved)
		? [unresolved]
		: [
				`${unresolved}.ts`,
				`${unresolved}.mts`,
				`${unresolved}.js`,
				`${unresolved}.mjs`,
				join(unresolved, "index.ts"),
			];
	const existing = candidates.filter((candidate) => existsSync(candidate));
	return existing.length === 1 ? existing[0] : undefined;
}

function findNamedTypeScriptImport(
	contents: string,
	localName: string,
): { readonly importedName: string; readonly specifier: string } | undefined {
	const matches: Array<{ readonly importedName: string; readonly specifier: string }> = [];
	for (const match of contents.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
		const imports = match[1];
		const specifier = match[2];
		if (imports === undefined || specifier === undefined) continue;
		for (const entry of imports.split(",")) {
			const imported = entry.trim().replace(/^type\s+/, "");
			const names = imported.split(/\s+as\s+/);
			const importedName = names[0];
			const importedLocalName = names[1] ?? importedName;
			if (importedName !== undefined && importedLocalName === localName)
				matches.push({ importedName, specifier });
		}
	}
	return matches.length === 1 ? matches[0] : undefined;
}

function staticallyReadExportedStringConstant(
	modulePath: string,
	constantName: string,
	visitedPaths: ReadonlySet<string>,
): string | undefined {
	if (visitedPaths.has(modulePath) || visitedPaths.size >= 8) return undefined;
	let contents: string;
	try {
		contents = readFileSync(modulePath, "utf8");
	} catch {
		return undefined;
	}
	const constantPattern = new RegExp(
		`\\bexport\\s+const\\s+${escapeRegularExpression(constantName)}(?:\\s*:[^=;]+)?\\s*=\\s*(["'])([A-Za-z0-9_-]+)\\1`,
		"g",
	);
	const constants = [...contents.matchAll(constantPattern)];
	if (constants.length === 1) return constants[0]?.[2];
	if (constants.length > 1) return undefined;
	const imported = findNamedTypeScriptImport(contents, constantName);
	if (imported === undefined) return undefined;
	const importedPath = resolveRelativeTypeScriptModule(modulePath, imported.specifier);
	return importedPath === undefined
		? undefined
		: staticallyReadExportedStringConstant(
				importedPath,
				imported.importedName,
				new Set([...visitedPaths, modulePath]),
			);
}

function staticallyReadTypedAlchemyStackName(
	projectPath: string,
	contents: string,
): string | undefined {
	const defaultStackHandles = [
		...contents.matchAll(/\bexport\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\.make\s*\(/g),
	];
	if (defaultStackHandles.length !== 1) return undefined;
	const stackHandleName = defaultStackHandles[0]?.[1];
	if (stackHandleName === undefined) return undefined;
	const stackHandleImport = findNamedTypeScriptImport(contents, stackHandleName);
	if (stackHandleImport === undefined) return undefined;
	const stackHandlePath = resolveRelativeTypeScriptModule(projectPath, stackHandleImport.specifier);
	if (stackHandlePath === undefined) return undefined;
	let stackHandleContents: string;
	try {
		stackHandleContents = readFileSync(stackHandlePath, "utf8");
	} catch {
		return undefined;
	}
	const stackArgumentPattern = new RegExp(
		`\\bexport\\s+class\\s+${escapeRegularExpression(stackHandleImport.importedName)}\\s+extends\\s+Alchemy\\.Stack(?:\\s*<[\\s\\S]*?>)?\\s*\\(\\s*\\)\\s*\\(\\s*([A-Za-z_$][A-Za-z0-9_$]*|["'][A-Za-z0-9_-]+["'])`,
		"g",
	);
	const stackArguments = [...stackHandleContents.matchAll(stackArgumentPattern)];
	if (stackArguments.length !== 1) return undefined;
	const stackArgument = stackArguments[0]?.[1];
	if (stackArgument === undefined) return undefined;
	if (stackArgument.startsWith('"') || stackArgument.startsWith("'"))
		return stackArgument.slice(1, -1);
	return staticallyReadExportedStringConstant(stackHandlePath, stackArgument, new Set());
}

function resolveAlchemyStackName(
	projectPath: string,
): Result<string | undefined, CloudflareDeploymentBlocked> {
	let contents: string;
	try {
		contents = readFileSync(projectPath, "utf8");
	} catch (cause) {
		return blocked(
			`project resolution cannot read Alchemy entrypoint ${projectPath}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	return {
		_tag: "ok",
		value:
			staticallyReadAlchemyStackName(contents) ??
			staticallyReadTypedAlchemyStackName(projectPath, contents),
	};
}

function resolveAlchemyTarget(
	intent: DeploymentIntent,
): Result<AlchemyDeploymentTarget, CloudflareDeploymentBlocked> {
	const cliStage = oneFlagValue(intent.args, ["--stage"], "Alchemy --stage");
	if (cliStage._tag === "err") return cliStage;
	const environmentStage = intent.environmentVariables.STAGE;
	if (environmentStage !== undefined && environmentStage.length === 0)
		return blocked("stage resolution requires STAGE to be non-empty.");
	if (
		cliStage.value !== undefined &&
		environmentStage !== undefined &&
		cliStage.value !== environmentStage
	) {
		return blocked("stage resolution found conflicting Alchemy --stage and STAGE values.");
	}
	const stage = cliStage.value ?? environmentStage;
	if (stage === undefined) {
		return blocked(
			"stage resolution requires explicit Alchemy --stage or STAGE; the dev_${USER} default is not authorized implicitly.",
		);
	}
	const positional = deploymentCommandWords(intent);
	if (positional.length > 2)
		return blocked("project resolution found multiple Alchemy entrypoint arguments.");
	const projectCandidate = resolve(intent.cwd, positional[1] ?? "alchemy.run.ts");
	const project = canonicalExistingPath(projectCandidate);
	if (project._tag === "err") return project;
	try {
		if (!statSync(project.value).isFile())
			return blocked(
				`project resolution requires an Alchemy entrypoint file, received ${project.value}.`,
			);
	} catch (cause) {
		return blocked(
			`project resolution cannot inspect ${project.value}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	const stack = resolveAlchemyStackName(project.value);
	return stack._tag === "err"
		? stack
		: { _tag: "ok", value: { project: project.value, stage, stack: stack.value } };
}

function workerPolicyDecision(
	target: WorkerDeploymentTarget,
	policy: CloudflareDeploymentPolicy,
): CloudflareDeploymentDecision {
	const environments = policy.workers[target.worker];
	if (environments === undefined) {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				`unknown Worker application ${JSON.stringify(target.worker)}; add it to ${POLICY_FILE_NAME} outside the agent session.`,
			).message,
		};
	}
	if (!environments.has(target.environment)) {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				`environment ${JSON.stringify(target.environment)} is not allowed for Worker ${JSON.stringify(target.worker)}; use "default" explicitly for Wrangler's top-level environment.`,
			).message,
		};
	}
	return {
		_tag: "allow",
		reason: `Cloudflare deployment allowed for ${target.worker}/${target.environment}.`,
	};
}

function alchemyPolicyDecision(
	target: AlchemyDeploymentTarget,
	policy: CloudflareDeploymentPolicy,
): CloudflareDeploymentDecision {
	if (policy.version === 1) {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				`policy authorization for Alchemy requires version 2 of ${POLICY_FILE_NAME}.`,
			).message,
		};
	}
	const entry = policy.alchemy.find((candidate) => candidate.project === target.project);
	if (entry === undefined) {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				`policy authorization denied unknown Alchemy project ${JSON.stringify(target.project)}; add its canonical entrypoint outside the agent session.`,
			).message,
		};
	}
	if (!entry.stages.has(target.stage)) {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				`policy authorization denied Alchemy stage ${JSON.stringify(target.stage)} for project ${JSON.stringify(target.project)}.`,
			).message,
		};
	}
	if (entry.stack !== undefined && target.stack !== entry.stack) {
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				`policy authorization expected Alchemy stack ${JSON.stringify(entry.stack)}, but project resolution found ${JSON.stringify(target.stack)}.`,
			).message,
		};
	}
	return {
		_tag: "allow",
		reason: `Cloudflare Alchemy deployment allowed for ${target.project} at stage ${target.stage}.`,
	};
}

type DeploymentEvaluationOptions = {
	readonly cwd: string;
	readonly policy: CloudflareDeploymentPolicy;
	readonly environmentVariables?: Readonly<Record<string, string>>;
};

/** Evaluates recognized Wrangler, cf, and Alchemy deployments against the global policy. */
export function evaluateCloudflareDeploymentCommand(
	command: string,
	options: DeploymentEvaluationOptions,
): CloudflareDeploymentDecision {
	return evaluateCloudflareDeploymentCommandWithCache(command, options, undefined, {
		depth: 0,
		activeScripts: new Set(),
	});
}

function evaluateCloudflareDeploymentCommandWithCache(
	command: string,
	options: DeploymentEvaluationOptions,
	cache: DeploymentEvaluationCache | undefined,
	resolution: ScriptResolutionContext = { depth: 0, activeScripts: new Set() },
): CloudflareDeploymentDecision {
	if (isAllowlistedRepositoryWorkingDirectory(options.cwd, options.policy, cache)) {
		return {
			_tag: "allow",
			reason: "Cloudflare deployment guard exempted this canonical allowlisted repository.",
		};
	}

	const tokenized = tokenizeShell(command);
	if (tokenized._tag === "err") {
		return mentionsCloudflareDeployment(command) || /\b(?:deploy|destroy)\b/i.test(command)
			? { _tag: "block", reason: tokenized.error.message }
			: { _tag: "unrelated" };
	}

	const shellSegments = splitShellSegmentsWithSeparators(tokenized.value);
	if (
		shellSegments.some(
			(segment) => segment.precedingSeparator === "|" || segment.precedingSeparator === "||",
		) &&
		mentionsCloudflareDeployment(command)
	)
		return {
			_tag: "block",
			reason: new CloudflareDeploymentBlocked(
				"ambiguous shell pipelines or || around a deployment must be split into direct commands.",
			).message,
		};

	let currentCwd = resolve(options.cwd);
	let currentEnvironment: Readonly<Record<string, string>> = options.environmentVariables ?? {};
	let sawDeployment = false;
	for (let index = 0; index < shellSegments.length; index += 1) {
		const shellSegment = shellSegments[index];
		if (shellSegment === undefined) continue;
		const segment = shellSegment.tokens;
		if (segment[0] === "export") {
			currentEnvironment = {
				...currentEnvironment,
				...parseEnvironmentAssignments(segment.slice(1)).values,
			};
			continue;
		}
		if (segment[0] === "unset" && ["CLOUDFLARE_ENV", "STAGE"].includes(segment[1] ?? "")) {
			const name = segment[1];
			if (name === "CLOUDFLARE_ENV") {
				const { CLOUDFLARE_ENV: _removed, ...remaining } = currentEnvironment;
				currentEnvironment = remaining;
			} else {
				const { STAGE: _removed, ...remaining } = currentEnvironment;
				currentEnvironment = remaining;
			}
			continue;
		}
		if (segment[0] === "cd" && segment.length === 2) {
			const followingSeparator = shellSegments[index + 1]?.precedingSeparator;
			if (followingSeparator !== "&&") {
				const remainingCommand = shellSegments
					.slice(index + 1)
					.flatMap((remaining) => remaining.tokens)
					.join(" ");
				if (
					mentionsCloudflareDeployment(remainingCommand) ||
					/\b(?:deploy|destroy)\b/i.test(remainingCommand)
				) {
					return {
						_tag: "block",
						reason: new CloudflareDeploymentBlocked(
							"project resolution requires cd before deployment to use &&.",
						).message,
					};
				}
			}
			currentCwd = resolve(currentCwd, segment[1] ?? ".");
			continue;
		}

		const packageTask = parsePackageTask(segment, currentCwd);
		if (packageTask._tag === "err") {
			if (
				mentionsCloudflareDeployment(segment.join(" ")) ||
				segment.some((token) => /deploy|destroy/i.test(token))
			) {
				return { _tag: "block", reason: packageTask.error.message };
			}
		} else if (packageTask.value !== undefined) {
			const packageTaskCommand = resolvePackageTaskCommand(packageTask.value, cache);
			if (packageTaskCommand._tag === "err")
				return { _tag: "block", reason: packageTaskCommand.error.message };
			if (packageTaskCommand.value === undefined) {
				if (/deploy|destroy/i.test(packageTask.value.taskName)) {
					return {
						_tag: "block",
						reason: new CloudflareDeploymentBlocked(
							`script resolution found no static script ${JSON.stringify(packageTask.value.taskName)}.`,
						).message,
					};
				}
				continue;
			}
			if (resolution.depth >= MAX_PACKAGE_SCRIPT_DEPTH) {
				return {
					_tag: "block",
					reason: new CloudflareDeploymentBlocked(
						`script resolution exceeded ${MAX_PACKAGE_SCRIPT_DEPTH} recursive package scripts.`,
					).message,
				};
			}
			const scriptKey = `${packageTaskCommand.value.sourcePath}#${packageTaskCommand.value.taskName}`;
			if (resolution.activeScripts.has(scriptKey)) {
				return {
					_tag: "block",
					reason: new CloudflareDeploymentBlocked(
						`script resolution detected a cycle at ${scriptKey}.`,
					).message,
				};
			}
			const nestedDecision = evaluateCloudflareDeploymentCommandWithCache(
				packageTaskCommand.value.command,
				{
					...options,
					cwd: dirname(packageTaskCommand.value.sourcePath),
					environmentVariables: currentEnvironment,
				},
				cache,
				{
					depth: resolution.depth + 1,
					activeScripts: new Set([...resolution.activeScripts, scriptKey]),
				},
			);
			if (nestedDecision._tag === "block") return nestedDecision;
			if (nestedDecision._tag === "allow") sawDeployment = true;
			else if (/deploy|destroy/i.test(packageTask.value.taskName)) {
				return {
					_tag: "block",
					reason: new CloudflareDeploymentBlocked(
						`script resolution for ${JSON.stringify(packageTask.value.taskName)} did not reach a recognized static deployment command.`,
					).message,
				};
			}
			continue;
		}

		const staticNodeDeploymentScript = findStaticNodeDeploymentScript(segment, currentCwd);
		if (staticNodeDeploymentScript !== undefined) {
			return {
				_tag: "block",
				reason: new CloudflareDeploymentBlocked(
					`script resolution found Cloudflare deployment logic in static Node entrypoint ${JSON.stringify(staticNodeDeploymentScript)}.`,
				).message,
			};
		}

		const segmentCommand = segment.join(" ");
		if (
			segment.some((token) => ["<", "<<", "&"].includes(token)) &&
			mentionsCloudflareDeployment(segmentCommand)
		) {
			return {
				_tag: "block",
				reason: new CloudflareDeploymentBlocked(
					"ambiguous shell input or background evaluation around a deployment is not allowed.",
				).message,
			};
		}
		const invocation = parseDeploymentInvocation(segment, currentCwd, currentEnvironment);
		if (invocation === undefined) {
			const shellCommand = executableName(segment[0] ?? "");
			if (
				["bash", "sh", "zsh", "fish"].includes(shellCommand) &&
				segment.some(mentionsCloudflareDeployment)
			) {
				return {
					_tag: "block",
					reason: new CloudflareDeploymentBlocked(
						"deployment hidden inside shell -c evaluation is ambiguous; run the deployment command directly.",
					).message,
				};
			}
			continue;
		}
		const destructiveDecision = destructiveDeploymentDecision(invocation);
		if (destructiveDecision !== undefined) return destructiveDecision;
		const intent = deploymentIntent(invocation);
		if (intent === undefined) {
			if (invocation.args.some(mentionsCloudflareDeployment)) {
				return {
					_tag: "block",
					reason: new CloudflareDeploymentBlocked(
						"deployment hidden inside package-runner shell mode is ambiguous; run the deployment command directly.",
					).message,
				};
			}
			continue;
		}
		sawDeployment = true;
		if (intent.dryRun) continue;
		if (intent.cli === "alchemy") {
			const target = resolveAlchemyTarget(intent);
			if (target._tag === "err") return { _tag: "block", reason: target.error.message };
			const decision = alchemyPolicyDecision(target.value, options.policy);
			if (decision._tag === "block") return decision;
		} else {
			const target =
				intent.cli === "wrangler" ? resolveWranglerTarget(intent) : resolveCfTarget(intent);
			if (target._tag === "err") return { _tag: "block", reason: target.error.message };
			const decision = workerPolicyDecision(target.value, options.policy);
			if (decision._tag === "block") return decision;
		}
	}
	return sawDeployment
		? { _tag: "allow", reason: "Only dry-run or allowlisted Cloudflare deployments were found." }
		: { _tag: "unrelated" };
}

function loadCachedGlobalPolicy(cached: CachedGlobalPolicy | undefined): {
	readonly cache: CachedGlobalPolicy | undefined;
	readonly result: Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked>;
} {
	let fingerprint: string;
	try {
		fingerprint = fileFingerprint(POLICY_FILE_PATH);
	} catch (cause) {
		return {
			cache: undefined,
			result: blocked(
				`cannot read global policy ${POLICY_FILE_PATH}: ${cause instanceof Error ? cause.message : String(cause)}.`,
			),
		};
	}
	if (cached?.fingerprint === fingerprint) return { cache: cached, result: cached.result };

	let result: Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked>;
	try {
		const input: unknown = JSON.parse(readFileSync(POLICY_FILE_PATH, "utf8"));
		result = parseCloudflareDeploymentPolicy(input);
	} catch (cause) {
		result = blocked(
			`cannot parse global policy ${POLICY_FILE_PATH}: ${cause instanceof Error ? cause.message : String(cause)}.`,
		);
	}
	const nextCache = { fingerprint, result };
	return { cache: nextCache, result };
}

function normalizedToolPath(path: string, cwd: string): string {
	const home = homedir();
	const withoutAt = path
		.replace(/^@/, "")
		.replace(/^~(?=\/|$)/, home)
		.replace(/^\$HOME(?=\/|$)/, home)
		.replace(/^\$\{HOME}(?=\/|$)/, home);
	const absolute = isAbsolute(withoutAt) ? resolve(withoutAt) : resolve(cwd, withoutAt);
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}

const POLICY_READ_ONLY_COMMANDS = new Set([
	"cat",
	"less",
	"head",
	"tail",
	"rg",
	"grep",
	"jq",
	"stat",
	"ls",
	"test",
	"readlink",
	"realpath",
]);

/** Detects shell writes or ambiguous access to the fixed global deployment policy file. */
export function findsCloudflarePolicyMutation(command: string, cwd: string): boolean {
	const tokenized = tokenizeShell(command);
	if (tokenized._tag === "err") {
		return (
			command.includes(POLICY_FILE_NAME) &&
			/(?:^|\s)(?:rm|tee|touch|truncate|cp|install|mv|rsync|sed|perl|dd|python|node|ruby)\b|(?:>|>>)/.test(
				command,
			)
		);
	}
	const isPolicyPath = (path: string) =>
		normalizedToolPath(path.replace(/^of=/, ""), cwd) === normalizedToolPath(POLICY_FILE_PATH, cwd);
	for (const segment of splitShellSegments(tokenized.value)) {
		for (let index = 0; index < segment.length - 1; index += 1) {
			if ([">", ">>"].includes(segment[index] ?? "") && isPolicyPath(segment[index + 1] ?? ""))
				return true;
		}
		const assignment = parseEnvironmentAssignments(segment);
		const commandName = executableName(assignment.rest[0] ?? "");
		const operands = assignment.rest.slice(1);
		const shellCommandIndex = operands.findIndex((value) => value === "-c");
		if (["bash", "sh", "zsh", "fish"].includes(commandName) && shellCommandIndex !== -1) {
			const nestedCommand = operands[shellCommandIndex + 1];
			if (nestedCommand !== undefined && findsCloudflarePolicyMutation(nestedCommand, cwd))
				return true;
		}
		if (DIRECT_MUTATION_COMMANDS.has(commandName) && operands.some(isPolicyPath)) return true;
		if (
			["sed", "perl"].includes(commandName) &&
			operands.some(
				(value) => value === "-i" || value.startsWith("-i") || value.startsWith("--in-place"),
			) &&
			operands.some(isPolicyPath)
		)
			return true;
		if (COPY_MUTATION_COMMANDS.has(commandName)) {
			const paths = operands.filter((value) => !value.startsWith("-"));
			if (paths.at(-1) !== undefined && isPolicyPath(paths.at(-1) ?? "")) return true;
		}
		if (
			commandName === "dd" &&
			operands.some((value) => value.startsWith("of=") && isPolicyPath(value))
		)
			return true;
		if (
			!POLICY_READ_ONLY_COMMANDS.has(commandName) &&
			commandName !== "cp" &&
			operands.some((value) => isPolicyPath(value) || value.includes(POLICY_FILE_NAME))
		)
			return true;
	}
	return false;
}

function mayNeedCloudflareDeploymentGuard(command: string): boolean {
	return (
		command.includes(POLICY_FILE_NAME) ||
		GUARDED_COMMAND_WORD_PATTERN.test(command) ||
		(command.includes("node") && NODE_SCRIPT_PATH_PATTERN.test(command))
	);
}

/** Installs the global Pi tool_call guard for Cloudflare deployments and policy mutation. */
export default function cloudflareDeploymentAllowlistExtension(pi: ExtensionAPI): void {
	let cachedPolicy: CachedGlobalPolicy | undefined;
	const evaluationCache: DeploymentEvaluationCache = {
		packageScripts: new Map(),
		policyRepositoryRoots: new WeakMap(),
	};
	const canonicalPolicyPath = normalizedToolPath(POLICY_FILE_PATH, process.cwd());
	const ambientEnvironment: Readonly<Record<string, string>> = {
		...(process.env.CLOUDFLARE_ENV === undefined
			? {}
			: { CLOUDFLARE_ENV: process.env.CLOUDFLARE_ENV }),
		...(process.env.STAGE === undefined ? {} : { STAGE: process.env.STAGE }),
	};

	pi.on("tool_call", (event, ctx) => {
		if (
			(event.toolName === "write" || event.toolName === "edit") &&
			(isToolCallEventType("write", event) || isToolCallEventType("edit", event))
		) {
			if (
				!event.input.path.includes(POLICY_FILE_NAME) ||
				normalizedToolPath(event.input.path, ctx.cwd) !== canonicalPolicyPath
			)
				return;
			return {
				block: true,
				reason: new CloudflareDeploymentBlocked(
					`the agent cannot modify global policy ${POLICY_FILE_PATH}; edit it manually outside Pi.`,
				).message,
			};
		}
		if (event.toolName !== "bash" || !isToolCallEventType("bash", event)) return;
		const command = event.input.command;
		if (!mayNeedCloudflareDeploymentGuard(command)) return;
		if (command.includes(POLICY_FILE_NAME) && findsCloudflarePolicyMutation(command, ctx.cwd)) {
			return {
				block: true,
				reason: new CloudflareDeploymentBlocked(
					`the agent cannot mutate global policy ${POLICY_FILE_PATH}; edit it manually outside Pi.`,
				).message,
			};
		}

		const preflightDecision = evaluateCloudflareDeploymentCommandWithCache(
			command,
			{
				cwd: ctx.cwd,
				policy: DENY_ALL_DEPLOYMENT_POLICY,
				environmentVariables: ambientEnvironment,
			},
			evaluationCache,
		);
		if (preflightDecision._tag === "unrelated" || preflightDecision._tag === "allow") return;

		const loadedPolicy = loadCachedGlobalPolicy(cachedPolicy);
		cachedPolicy = loadedPolicy.cache;
		if (loadedPolicy.result._tag === "err") {
			return { block: true, reason: loadedPolicy.result.error.message };
		}
		const decision = evaluateCloudflareDeploymentCommandWithCache(
			command,
			{
				cwd: ctx.cwd,
				policy: loadedPolicy.result.value,
				environmentVariables: ambientEnvironment,
			},
			evaluationCache,
		);
		if (decision._tag === "block") return { block: true, reason: decision.reason };
	});
}
