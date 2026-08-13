import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const POLICY_FILE_NAME = "cloudflare-deployment-allowlist.json";
const POLICY_FILE_PATH = fileURLToPath(new URL(`../${POLICY_FILE_NAME}`, import.meta.url));
const DEFAULT_ENVIRONMENT = "default";
const SHELL_SEPARATORS = new Set(["&&", "||", ";", "|", "\n"]);
const SHELL_META_TOKENS = new Set(["<", ">", ">>", "<<", "&"]);
const WRANGLER_DEPLOY_COMMANDS = new Set(["deploy", "publish"]);
const DIRECT_MUTATION_COMMANDS = new Set(["rm", "tee", "touch", "truncate"]);
const COPY_MUTATION_COMMANDS = new Set(["cp", "install", "mv", "rsync"]);
const DENY_ALL_DEPLOYMENT_POLICY: CloudflareDeploymentPolicy = { version: 1, workers: {} };

type Result<T, E> =
	| { readonly _tag: "ok"; readonly value: T }
	| { readonly _tag: "err"; readonly error: E };

/** A Worker application key mapped to its explicitly allowed logical environment names. */
export type CloudflareDeploymentPolicy = {
	readonly version: 1;
	readonly workers: Readonly<Record<string, ReadonlySet<string>>>;
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
	readonly cli: "wrangler" | "cf";
	readonly args: readonly string[];
	readonly environmentVariables: Readonly<Record<string, string>>;
	readonly cwd: string;
};

type DeploymentIntent = {
	readonly cli: "wrangler" | "cf";
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

type DeploymentTarget = {
	readonly worker: string;
	readonly environment: string;
};

type CachedPackageScripts = {
	readonly fingerprint: string;
	readonly scripts: Readonly<Record<string, unknown>> | undefined;
	readonly unreadable: boolean;
};

type DeploymentEvaluationCache = {
	readonly packageScripts: Map<string, CachedPackageScripts>;
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

/** Parses the versioned global policy; malformed and unknown policy shapes are errors. */
export function parseCloudflareDeploymentPolicy(
	input: unknown,
): Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked> {
	if (!isStringRecord(input) || input.version !== 1 || !isStringRecord(input.workers)) {
		return blocked(
			`invalid ${POLICY_FILE_NAME}; expected { "version": 1, "workers": { "worker-name": ["default", "staging"] } }.`,
		);
	}

	const workers: Record<string, ReadonlySet<string>> = {};
	for (const [worker, environments] of Object.entries(input.workers)) {
		if (
			worker.trim() !== worker ||
			worker.length === 0 ||
			!Array.isArray(environments) ||
			environments.length === 0 ||
			environments.some(
				(environment) =>
					typeof environment !== "string" ||
					environment.length === 0 ||
					environment.trim() !== environment,
			)
		) {
			return blocked(
				`invalid ${POLICY_FILE_NAME} entry for ${JSON.stringify(worker)}; use a non-empty array of exact environment names (use "default" for Wrangler's top-level environment).`,
			);
		}
		workers[worker] = new Set(environments);
	}

	return { _tag: "ok", value: { version: 1, workers } };
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
			else if (character === "\\" && quote === '"' && command[index + 1] !== undefined) {
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
			return blocked("ambiguous shell evaluation around a recognized deployment must be split into a direct command.");
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
	if (quote !== undefined) return blocked("unterminated shell quote makes the deployment target ambiguous.");
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

function parseEnvironmentAssignments(
	tokens: readonly string[],
): { readonly rest: readonly string[]; readonly values: Readonly<Record<string, string>> } {
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
	return token.split("/").at(-1) ?? token;
}

function mentionsCloudflareDeployment(command: string): boolean {
	return /\b(?:wrangler|cf)\b[\s\S]*(?:\b(?:deploy|publish)\b|\bworkers\s+deployments\s+create\b)/.test(command);
}

function unwrapCloudflareCli(tokens: readonly string[]): { cli: "wrangler" | "cf"; args: readonly string[] } | undefined {
	if (tokens.length === 0) return undefined;
	const executable = executableName(tokens[0] ?? "");
	if (executable === "wrangler" || executable === "cf") {
		return { cli: executable, args: tokens.slice(1) };
	}

	let searchFrom: number | undefined;
	if (["npx", "pnpx", "bunx", "vpx"].includes(executable)) searchFrom = 1;
	else if (["pnpm", "npm"].includes(executable) && ["exec", "dlx"].includes(tokens[1] ?? "")) searchFrom = 2;
	else if (executable === "yarn") searchFrom = ["exec", "dlx"].includes(tokens[1] ?? "") ? 2 : 1;
	else if (executable === "bun" && tokens[1] === "x") searchFrom = 2;
	else if (executable === "vp" && ["exec", "dlx"].includes(tokens[1] ?? "")) searchFrom = 2;
	if (searchFrom === undefined) return undefined;

	for (let index = searchFrom; index < tokens.length; index += 1) {
		const packageName = tokens[index]?.replace(/@(?:latest|next|\d.*)$/, "");
		if (packageName === "wrangler" || packageName === "cf") {
			return { cli: packageName, args: tokens.slice(index + 1) };
		}
	}
	return undefined;
}

function firstPackageTaskArgument(
	args: readonly string[],
	valueOptions: ReadonlySet<string>,
): string | undefined {
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === undefined) continue;
		if (valueOptions.has(argument)) {
			index += 1;
			continue;
		}
		if (argument.startsWith("-")) continue;
		return argument;
	}
	return undefined;
}

function packageTaskName(tokens: readonly string[]): string | undefined {
	const assignment = parseEnvironmentAssignments(tokens);
	const executable = executableName(assignment.rest[0] ?? "");
	const args = assignment.rest.slice(1);
	const taskValueOptions = new Set([
		"--concurrency-limit",
		"--cwd",
		"--filter",
		"-F",
		"--log",
		"--prefix",
		"--workspace",
	]);
	if (executable === "vpr") return firstPackageTaskArgument(args, taskValueOptions);

	const runIndex = args.findIndex((argument) => argument === "run" || argument === "run-script");
	if (["npm", "pnpm", "bun", "vp"].includes(executable)) {
		if (runIndex === -1) {
			if (executable !== "pnpm" || ["exec", "dlx"].includes(args[0] ?? "")) return undefined;
			return firstPackageTaskArgument(args, taskValueOptions);
		}
		const valueOptions = executable === "npm"
			? new Set([...taskValueOptions, "-w"])
			: taskValueOptions;
		return firstPackageTaskArgument(args.slice(runIndex + 1), valueOptions);
	}
	if (executable === "yarn") {
		if (["exec", "dlx"].includes(args[0] ?? "")) return undefined;
		if (runIndex !== -1) return firstPackageTaskArgument(args.slice(runIndex + 1), taskValueOptions);
		return firstPackageTaskArgument(args, taskValueOptions);
	}
	return undefined;
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
		return { fingerprint: "missing", scripts: undefined, unreadable: true };
	}
	const cached = cache?.packageScripts.get(packagePath);
	if (cached?.fingerprint === fingerprint) return cached;

	let loaded: CachedPackageScripts;
	try {
		const manifest: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
		loaded = {
			fingerprint,
			scripts: isStringRecord(manifest) && isStringRecord(manifest.scripts)
				? manifest.scripts
				: undefined,
			unreadable: false,
		};
	} catch {
		loaded = { fingerprint, scripts: undefined, unreadable: true };
	}
	cache?.packageScripts.set(packagePath, loaded);
	return loaded;
}

function packageTaskDeployReason(
	segment: readonly string[],
	cwd: string,
	cache: DeploymentEvaluationCache | undefined,
): string | undefined {
	const taskSpecifier = packageTaskName(segment);
	if (taskSpecifier === undefined) return undefined;
	const taskName = taskSpecifier.split("#").at(-1) ?? taskSpecifier;
	if (/deploy/i.test(taskName)) {
		return `indirect package/Vite+ task ${JSON.stringify(taskSpecifier)} may deploy Cloudflare resources; run the underlying Wrangler or cf command directly so its Worker and environment can be checked.`;
	}

	const packagePath = findFileUpward(cwd, ["package.json"]);
	if (packagePath === undefined) return undefined;
	const packageScripts = loadCachedPackageScripts(packagePath, cache);
	if (packageScripts.unreadable) {
		return `package task ${JSON.stringify(taskSpecifier)} cannot be inspected safely because package.json is invalid or unreadable.`;
	}
	const script = packageScripts.scripts?.[taskName];
	if (typeof script === "string" && mentionsCloudflareDeployment(script)) {
		return `package script ${JSON.stringify(taskName)} invokes a Cloudflare deployment indirectly; run ${JSON.stringify(script)} directly so its Worker and environment can be checked.`;
	}
	return undefined;
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
	const valueFlags = invocation.cli === "wrangler"
		? new Set(["--cwd", "--config", "-c", "--env", "-e", "--name"])
		: new Set(["--mode", "-m", "--tag", "--message", "--profile", "--zone", "-z", "--local-endpoint"]);
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

function wranglerDeleteDecision(invocation: DeploymentInvocation): CloudflareDeploymentDecision | undefined {
	if (invocation.cli !== "wrangler" || invocation.args.some((argument) => argument === "--help" || argument === "-h")) {
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
	if (invocation.cli === "wrangler") {
		if (invocation.args.some((argument) => argument === "--help" || argument === "-h")) return undefined;
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
		positional[0] === "workers" &&
		positional[1] === "deployments" &&
		positional[2] === "create";
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
	if (new Set(values).size > 1) return blocked(`conflicting ${label} values make the deployment target ambiguous.`);
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
			while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) index += 1;
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
		return blocked(`cannot parse Wrangler config ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`);
	}
	if (!isStringRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
		return blocked(`Wrangler config ${path} needs a non-empty top-level "name" to resolve the Worker application.`);
	}
	const environmentNames = new Set<string>();
	const environmentWorkerNames: Record<string, string> = {};
	if (value.env !== undefined) {
		if (!isStringRecord(value.env)) return blocked(`Wrangler config ${path} has an invalid "env" object.`);
		for (const [environment, settings] of Object.entries(value.env)) {
			environmentNames.add(environment);
			if (isStringRecord(settings) && typeof settings.name === "string" && settings.name.length > 0) {
				environmentWorkerNames[environment] = settings.name;
			}
		}
	}
	return { _tag: "ok", value: { topLevelName: value.name, environmentNames, environmentWorkerNames } };
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
				return blocked(`Wrangler config ${path} has an environment section the guard cannot parse safely: [${section}].`);
			}
			if (environment !== undefined) environmentNames.add(environment);
			continue;
		}
		const nameMatch = line.match(/^\s*name\s*=\s*(.+)$/);
		if (nameMatch?.[1] === undefined) continue;
		const name = parseTomlString(nameMatch[1]);
		if (name === undefined || name.length === 0) return blocked(`Wrangler config ${path} has an invalid name value.`);
		if (section === "") topLevelName = name;
		else {
			const environment = tomlEnvironmentName(section);
			if (
				environment !== undefined &&
				[`env.${environment}`, `env."${environment}"`, `env.'${environment}'`].includes(section)
			) environmentWorkerNames[environment] = name;
		}
	}
	if (topLevelName === undefined) return blocked(`Wrangler config ${path} needs a non-empty top-level name to resolve the Worker application.`);
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
		return blocked(`cannot read Wrangler config ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`);
	}
	return path.endsWith(".toml")
		? parseTomlWranglerConfiguration(contents, path)
		: parseJsonWranglerConfiguration(contents, path);
}

function resolveWranglerTarget(intent: DeploymentIntent): Result<DeploymentTarget, CloudflareDeploymentBlocked> {
	const cwd = oneFlagValue(intent.args, ["--cwd"], "--cwd");
	if (cwd._tag === "err") return cwd;
	const effectiveCwd = resolve(intent.cwd, cwd.value ?? ".");
	const config = oneFlagValue(intent.args, ["--config", "-c"], "--config/-c");
	if (config._tag === "err") return config;
	const configPath = config.value === undefined
		? findWranglerConfiguration(effectiveCwd)
		: resolve(effectiveCwd, config.value);
	if (configPath === undefined) return blocked(`no Wrangler config found from ${effectiveCwd}; pass --config so the Worker application is explicit.`);
	const configuration = loadWranglerConfiguration(configPath);
	if (configuration._tag === "err") return configuration;

	const cliEnvironment = oneFlagValue(intent.args, ["--env", "-e"], "--env/-e");
	if (cliEnvironment._tag === "err") return cliEnvironment;
	const environment = cliEnvironment.value ?? intent.environmentVariables.CLOUDFLARE_ENV ?? DEFAULT_ENVIRONMENT;
	if (environment.length === 0) return blocked("CLOUDFLARE_ENV must not be empty.");
	if (environment !== DEFAULT_ENVIRONMENT && !configuration.value.environmentNames.has(environment)) {
		return blocked(`unknown Wrangler environment ${JSON.stringify(environment)} in ${configPath}.`);
	}
	const cliName = oneFlagValue(intent.args, ["--name"], "--name");
	if (cliName._tag === "err") return cliName;
	const worker = cliName.value ?? configuration.value.environmentWorkerNames[environment] ?? configuration.value.topLevelName;
	return { _tag: "ok", value: { worker, environment } };
}

function readCfPrebuiltWorkerName(cwd: string): Result<string, CloudflareDeploymentBlocked> {
	const configPath = join(cwd, ".cloudflare", "output", "v0", "workers", "default", "config.json");
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (cause) {
		return blocked(`cannot read cf --prebuilt Worker output ${configPath}: ${cause instanceof Error ? cause.message : String(cause)}.`);
	}
	if (!isStringRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
		return blocked(`cf --prebuilt Worker output ${configPath} needs a non-empty "name".`);
	}
	return { _tag: "ok", value: value.name };
}

function confirmCfWranglerProject(cwd: string): Result<undefined, CloudflareDeploymentBlocked> {
	const manifestPath = findFileUpward(cwd, ["package.json", "pyproject.toml", "Cargo.toml"]);
	if (manifestPath === undefined) return blocked("cf project discovery found no package.json, pyproject.toml, or Cargo.toml.");
	if (!manifestPath.endsWith("package.json")) {
		return blocked(`cf project discovery selected ${manifestPath}; Python and Rust dev-server deployment targets cannot be resolved before build with confidence.`);
	}
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch (cause) {
		return blocked(`cannot parse cf project manifest ${manifestPath}: ${cause instanceof Error ? cause.message : String(cause)}.`);
	}
	if (!isStringRecord(manifest)) return blocked(`cf project manifest ${manifestPath} is not an object.`);
	const dependencies = {
		...(isStringRecord(manifest.dependencies) ? manifest.dependencies : {}),
		...(isStringRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
	};
	if ("@cloudflare/vite-plugin" in dependencies) {
		return blocked("cf project discovery delegates to the Cloudflare Vite plugin, whose generated Worker target cannot be resolved before build with confidence.");
	}
	if (!("wrangler" in dependencies)) {
		return blocked("cf project discovery cannot confirm Wrangler as the installed Cloudflare dev server from package.json.");
	}
	return { _tag: "ok", value: undefined };
}

function resolveCfTarget(intent: DeploymentIntent): Result<DeploymentTarget, CloudflareDeploymentBlocked> {
	const positional = deploymentCommandWords(intent);
	if (positional[0] === "versions") {
		return blocked("cf versions deploy changes traffic but v0.6.0 does not expose enough application/environment identity to authorize it safely.");
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
	if (mode.value === undefined) return blocked("cf deploy requires an explicit --mode/-m because its omitted deployment mode cannot be resolved confidently.");
	if (hasEnabledBooleanFlag(intent.args, "--prebuilt")) {
		const worker = readCfPrebuiltWorkerName(intent.cwd);
		return worker._tag === "err" ? worker : { _tag: "ok", value: { worker: worker.value, environment: mode.value } };
	}
	const project = confirmCfWranglerProject(intent.cwd);
	if (project._tag === "err") return project;
	const configPath = findWranglerConfiguration(intent.cwd);
	if (configPath === undefined) {
		return blocked("cf deploy project discovery did not yield a readable Wrangler config; the Worker application cannot be authorized before build with confidence.");
	}
	const configuration = loadWranglerConfiguration(configPath);
	if (configuration._tag === "err") return configuration;
	const worker = configuration.value.environmentWorkerNames[mode.value] ?? configuration.value.topLevelName;
	return { _tag: "ok", value: { worker, environment: mode.value } };
}

function policyDecision(
	target: DeploymentTarget,
	policy: CloudflareDeploymentPolicy,
): CloudflareDeploymentDecision {
	const environments = policy.workers[target.worker];
	if (environments === undefined) {
		return { _tag: "block", reason: new CloudflareDeploymentBlocked(`unknown Worker application ${JSON.stringify(target.worker)}; add it to ${POLICY_FILE_NAME} outside the agent session.`).message };
	}
	if (!environments.has(target.environment)) {
		return { _tag: "block", reason: new CloudflareDeploymentBlocked(`environment ${JSON.stringify(target.environment)} is not allowed for Worker ${JSON.stringify(target.worker)}; use "default" explicitly for Wrangler's top-level environment.`).message };
	}
	return { _tag: "allow", reason: `Cloudflare deployment allowed for ${target.worker}/${target.environment}.` };
}

type DeploymentEvaluationOptions = {
	readonly cwd: string;
	readonly policy: CloudflareDeploymentPolicy;
	readonly environmentVariables?: Readonly<Record<string, string>>;
};

/** Evaluates recognized Wrangler/cf deployments in an agent bash command against a parsed global policy. */
export function evaluateCloudflareDeploymentCommand(
	command: string,
	options: DeploymentEvaluationOptions,
): CloudflareDeploymentDecision {
	return evaluateCloudflareDeploymentCommandWithCache(command, options, undefined);
}

function evaluateCloudflareDeploymentCommandWithCache(
	command: string,
	options: DeploymentEvaluationOptions,
	cache: DeploymentEvaluationCache | undefined,
): CloudflareDeploymentDecision {
	const tokenized = tokenizeShell(command);
	if (tokenized._tag === "err") {
		return mentionsCloudflareDeployment(command)
			? { _tag: "block", reason: tokenized.error.message }
			: { _tag: "unrelated" };
	}

	let currentCwd = resolve(options.cwd);
	let currentEnvironment: Readonly<Record<string, string>> = options.environmentVariables ?? {};
	let sawDeployment = false;
	const shellSegments = splitShellSegmentsWithSeparators(tokenized.value);
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
		if (segment[0] === "unset" && segment[1] === "CLOUDFLARE_ENV") {
			const { CLOUDFLARE_ENV: _removed, ...remainingEnvironment } = currentEnvironment;
			currentEnvironment = remainingEnvironment;
			continue;
		}
		if (segment[0] === "cd" && segment.length === 2) {
			const followingSeparator = shellSegments[index + 1]?.precedingSeparator;
			if (followingSeparator !== "&&") {
				const remainingCommand = shellSegments.slice(index + 1).flatMap((remaining) => remaining.tokens).join(" ");
				if (mentionsCloudflareDeployment(remainingCommand)) {
					return { _tag: "block", reason: new CloudflareDeploymentBlocked("cd before deployment must use && so the effective project directory is unambiguous.").message };
				}
			}
			currentCwd = resolve(currentCwd, segment[1] ?? ".");
			continue;
		}
		const taskDeployReason = packageTaskDeployReason(segment, currentCwd, cache);
		if (taskDeployReason !== undefined) {
			return { _tag: "block", reason: new CloudflareDeploymentBlocked(taskDeployReason).message };
		}
		const invocation = parseDeploymentInvocation(segment, currentCwd, currentEnvironment);
		if (invocation === undefined) {
			const shellCommand = executableName(segment[0] ?? "");
			if (["bash", "sh", "zsh", "fish"].includes(shellCommand) && segment.some(mentionsCloudflareDeployment)) {
				return { _tag: "block", reason: new CloudflareDeploymentBlocked("deployment hidden inside shell -c evaluation is ambiguous; run the Wrangler or cf command directly.").message };
			}
			continue;
		}
		const deleteDecision = wranglerDeleteDecision(invocation);
		if (deleteDecision !== undefined) return deleteDecision;
		const intent = deploymentIntent(invocation);
		if (intent === undefined) {
			if (invocation.args.some(mentionsCloudflareDeployment)) {
				return { _tag: "block", reason: new CloudflareDeploymentBlocked("deployment hidden inside package-runner shell mode is ambiguous; run the Wrangler or cf command directly.").message };
			}
			continue;
		}
		sawDeployment = true;
		if (intent.dryRun) continue;
		const target = intent.cli === "wrangler" ? resolveWranglerTarget(intent) : resolveCfTarget(intent);
		if (target._tag === "err") return { _tag: "block", reason: target.error.message };
		const decision = policyDecision(target.value, options.policy);
		if (decision._tag === "block") return decision;
	}
	return sawDeployment ? { _tag: "allow", reason: "Only dry-run or allowlisted Cloudflare deployments were found." } : { _tag: "unrelated" };
}

function loadCachedGlobalPolicy(
	cached: CachedGlobalPolicy | undefined,
): { readonly cache: CachedGlobalPolicy | undefined; readonly result: Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked> } {
	let fingerprint: string;
	try {
		fingerprint = fileFingerprint(POLICY_FILE_PATH);
	} catch (cause) {
		return {
			cache: undefined,
			result: blocked(`cannot read global policy ${POLICY_FILE_PATH}: ${cause instanceof Error ? cause.message : String(cause)}.`),
		};
	}
	if (cached?.fingerprint === fingerprint) return { cache: cached, result: cached.result };

	let result: Result<CloudflareDeploymentPolicy, CloudflareDeploymentBlocked>;
	try {
		const input: unknown = JSON.parse(readFileSync(POLICY_FILE_PATH, "utf8"));
		result = parseCloudflareDeploymentPolicy(input);
	} catch (cause) {
		result = blocked(`cannot parse global policy ${POLICY_FILE_PATH}: ${cause instanceof Error ? cause.message : String(cause)}.`);
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

/** Detects high-confidence shell writes to the fixed global deployment policy file. */
export function findsCloudflarePolicyMutation(command: string, cwd: string): boolean {
	const tokenized = tokenizeShell(command);
	if (tokenized._tag === "err") return false;
	const isPolicyPath = (path: string) => normalizedToolPath(path.replace(/^of=/, ""), cwd) === normalizedToolPath(POLICY_FILE_PATH, cwd);
	for (const segment of splitShellSegments(tokenized.value)) {
		for (let index = 0; index < segment.length - 1; index += 1) {
			if ([">", ">>"].includes(segment[index] ?? "") && isPolicyPath(segment[index + 1] ?? "")) return true;
		}
		const assignment = parseEnvironmentAssignments(segment);
		const commandName = executableName(assignment.rest[0] ?? "");
		const operands = assignment.rest.slice(1);
		if (DIRECT_MUTATION_COMMANDS.has(commandName) && operands.some(isPolicyPath)) return true;
		if (["sed", "perl"].includes(commandName) && operands.some((value) => value === "-i" || value.startsWith("-i") || value.startsWith("--in-place")) && operands.some(isPolicyPath)) return true;
		if (COPY_MUTATION_COMMANDS.has(commandName)) {
			const paths = operands.filter((value) => !value.startsWith("-"));
			if (paths.at(-1) !== undefined && isPolicyPath(paths.at(-1) ?? "")) return true;
		}
		if (commandName === "dd" && operands.some((value) => value.startsWith("of=") && isPolicyPath(value))) return true;
	}
	return false;
}

function mayNeedCloudflareDeploymentGuard(command: string): boolean {
	return command.includes(POLICY_FILE_NAME) ||
		/\b(?:wrangler|cf|npx|pnpx|bunx|vpx|npm|pnpm|yarn|bun|vp|vpr)\b/.test(command);
}

/** Installs the global Pi tool_call guard for Cloudflare deployments and policy mutation. */
export default function cloudflareDeploymentAllowlistExtension(pi: ExtensionAPI): void {
	let cachedPolicy: CachedGlobalPolicy | undefined;
	const evaluationCache: DeploymentEvaluationCache = { packageScripts: new Map() };
	const canonicalPolicyPath = normalizedToolPath(POLICY_FILE_PATH, process.cwd());

	pi.on("tool_call", (event, ctx) => {
		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			if (normalizedToolPath(event.input.path, ctx.cwd) !== canonicalPolicyPath) return;
			return { block: true, reason: new CloudflareDeploymentBlocked(`the agent cannot modify global policy ${POLICY_FILE_PATH}; edit it manually outside Pi.`).message };
		}
		if (!isToolCallEventType("bash", event)) return;
		const command = event.input.command;
		if (!mayNeedCloudflareDeploymentGuard(command)) return;
		if (command.includes(POLICY_FILE_NAME) && findsCloudflarePolicyMutation(command, ctx.cwd)) {
			return { block: true, reason: new CloudflareDeploymentBlocked(`the agent cannot mutate global policy ${POLICY_FILE_PATH}; edit it manually outside Pi.`).message };
		}

		const ambientEnvironment: Readonly<Record<string, string>> =
			process.env.CLOUDFLARE_ENV === undefined
				? {}
				: { CLOUDFLARE_ENV: process.env.CLOUDFLARE_ENV };
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
