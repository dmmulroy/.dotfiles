/**
 * Wrangler, cf, and Alchemy invocations: recognizing them behind package-manager wrappers, classifying
 * their intent (deploy, dry run, help, destroy), and resolving the Worker or Alchemy project they target.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
	type CloudflareDeploymentBlocked,
	type CloudflareDeploymentDecision,
	type Result,
	blocked,
	denialDecision,
	errorMessage,
	isStringRecord,
} from "./decision.ts";
import type { AlchemyDeploymentTarget, WorkerDeploymentTarget } from "./policy.ts";
import { type ShellWord, executableName } from "./shell-ast.ts";

const DEFAULT_ENVIRONMENT = "default";
const WRANGLER_VALUE_FLAGS = new Set(["--cwd", "--config", "-c", "--env", "-e", "--name", "--log-level"]);
const CF_VALUE_FLAGS = new Set(["--mode", "-m", "--tag", "--message", "--profile", "--zone", "-z", "--local-endpoint"]);
const ALCHEMY_VALUE_FLAGS = new Set(["--stage", "--profile", "--env-file", "--log-level", "--completions"]);
const HELP_FLAGS = new Set(["--help", "-h", "--version"]);

export type DeploymentCli = "wrangler" | "cf" | "alchemy";

/** A Wrangler, cf, or Alchemy invocation with the environment it runs in. */
export type DeploymentInvocation = {
	readonly cli: DeploymentCli;
	readonly args: readonly string[];
	/** Source text of arguments that depend on runtime expansion. */
	readonly dynamicArguments: readonly string[];
	readonly environmentVariables: Readonly<Record<string, string>>;
	/** Variables (`CLOUDFLARE_ENV`, `STAGE`) set to values the guard cannot know. */
	readonly dynamicEnvironmentNames: ReadonlySet<string>;
	readonly cwd: string;
};

type DeploymentIntent = DeploymentInvocation & { readonly dryRun: boolean };

const CLI_NAMES = new Set<string>(["wrangler", "cf", "alchemy"]);

function isDeploymentCli(value: string | undefined): value is DeploymentCli {
	return value !== undefined && CLI_NAMES.has(value);
}

/**
 * Finds a Wrangler/cf/Alchemy invocation in a command's words, directly or behind npx, pnpx, bunx, vpx,
 * `pnpm|npm|yarn|vp exec|dlx`, `bun x`, or `pnpm|yarn <cli>`. Returns the index of the first CLI argument.
 */
export function findDeploymentCli(
	words: readonly ShellWord[],
): { readonly cli: DeploymentCli; readonly argumentIndex: number } | undefined {
	const first = words[0]?.value;
	if (first === undefined) return undefined;
	const executable = executableName(first);
	if (isDeploymentCli(executable)) return { cli: executable, argumentIndex: 1 };
	const second = words[1]?.value;
	let searchFrom: number | undefined;
	if (["npx", "pnpx", "bunx", "vpx"].includes(executable)) searchFrom = 1;
	else if (["pnpm", "npm"].includes(executable) && ["exec", "dlx", "x"].includes(second ?? "")) searchFrom = 2;
	else if (executable === "yarn") searchFrom = ["exec", "dlx"].includes(second ?? "") ? 2 : 1;
	else if (executable === "pnpm" && isDeploymentCli(second)) searchFrom = 1;
	else if (executable === "bun" && second === "x") searchFrom = 2;
	else if (executable === "vp" && ["exec", "dlx"].includes(second ?? "")) searchFrom = 2;
	if (searchFrom === undefined) return undefined;
	for (let index = searchFrom; index < words.length; index += 1) {
		const value = words[index]?.value;
		if (value === undefined) continue;
		if (value === "--") continue;
		const packageName = value.replace(/@(?:latest|next|beta|\d.*)$/, "");
		if (isDeploymentCli(packageName)) return { cli: packageName, argumentIndex: index + 1 };
		// yarn <script> and similar: only flags may precede the CLI.
		if (executable === "yarn" && searchFrom === 1 && !value.startsWith("-")) return undefined;
	}
	return undefined;
}

function valueFlags(cli: DeploymentCli): ReadonlySet<string> {
	return cli === "wrangler" ? WRANGLER_VALUE_FLAGS : cli === "cf" ? CF_VALUE_FLAGS : ALCHEMY_VALUE_FLAGS;
}

/** The positional command words of an invocation, skipping flags and their values. */
export function deploymentCommandWords(invocation: Pick<DeploymentInvocation, "cli" | "args">): readonly string[] {
	const flags = valueFlags(invocation.cli);
	const words: string[] = [];
	for (let index = 0; index < invocation.args.length; index += 1) {
		const argument = invocation.args[index];
		if (argument === undefined) continue;
		if (flags.has(argument)) {
			index += 1;
			continue;
		}
		if (argument.startsWith("-")) continue;
		words.push(argument);
	}
	return words;
}

/** True for `--help`, `-h`, and `--version`, which print and exit. */
export function isHelpInvocation(invocation: Pick<DeploymentInvocation, "args">): boolean {
	return invocation.args.some((argument) => HELP_FLAGS.has(argument));
}

function hasEnabledBooleanFlag(args: readonly string[], longName: string): boolean {
	return args.some((argument) => argument === longName || argument === `${longName}=true`);
}

/**
 * Wrangler Worker deletion and Alchemy destroy are never authorized, including `alchemy destroy --dry-run`:
 * an Alchemy version that ignores the flag would destroy the stage.
 */
export function destructiveDeploymentDecision(
	invocation: DeploymentInvocation,
): CloudflareDeploymentDecision | undefined {
	if (isHelpInvocation(invocation)) return undefined;
	const positional = deploymentCommandWords(invocation);
	if (invocation.cli === "alchemy" && positional[0] === "destroy")
		return denialDecision("Alchemy destroy is destructive and is never authorized by the deployment allowlist.");
	if (invocation.cli !== "wrangler" || positional[0] !== "delete") return undefined;
	const worker = positional[1];
	return denialDecision(
		`Wrangler Worker deletion${worker === undefined ? "" : ` for ${JSON.stringify(worker)}`} is destructive and is never authorized by the deployment allowlist.`,
	);
}

/** Classifies a deploying invocation; undefined when it does not deploy (help, inspection, uploads). */
export function deploymentIntent(invocation: DeploymentInvocation): DeploymentIntent | undefined {
	if (isHelpInvocation(invocation)) return undefined;
	const positional = deploymentCommandWords(invocation);
	if (invocation.cli === "alchemy") {
		if (positional[0] !== "deploy") return undefined;
		return { ...invocation, dryRun: hasEnabledBooleanFlag(invocation.args, "--dry-run") };
	}
	if (invocation.cli === "wrangler") {
		const isDeploy = positional[0] === "deploy" || positional[0] === "publish";
		const isSubcommandDeploy =
			["versions", "triggers", "pages"].includes(positional[0] ?? "") && positional[1] === "deploy";
		if (!isDeploy && !isSubcommandDeploy) return undefined;
		return { ...invocation, dryRun: isDeploy && hasEnabledBooleanFlag(invocation.args, "--dry-run") };
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
			values.push(value !== undefined && !value.startsWith("-") ? value : "");
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

type WranglerConfiguration = {
	readonly topLevelName: string;
	readonly environmentNames: ReadonlySet<string>;
	readonly environmentWorkerNames: Readonly<Record<string, string>>;
};

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
		return blocked(`cannot parse Wrangler config ${path}: ${errorMessage(cause)}.`);
	}
	if (!isStringRecord(value) || typeof value.name !== "string" || value.name.length === 0)
		return blocked(`Wrangler config ${path} needs a non-empty top-level "name" to resolve the Worker application.`);
	const environmentNames = new Set<string>();
	const environmentWorkerNames: Record<string, string> = {};
	if (value.env !== undefined) {
		if (!isStringRecord(value.env)) return blocked(`Wrangler config ${path} has an invalid "env" object.`);
		for (const [environment, settings] of Object.entries(value.env)) {
			environmentNames.add(environment);
			if (isStringRecord(settings) && typeof settings.name === "string" && settings.name.length > 0)
				environmentWorkerNames[environment] = settings.name;
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
			if (section.startsWith("env.") && environment === undefined)
				return blocked(`Wrangler config ${path} has an environment section the guard cannot parse safely: [${section}].`);
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
			)
				environmentWorkerNames[environment] = name;
		}
	}
	if (topLevelName === undefined)
		return blocked(`Wrangler config ${path} needs a non-empty top-level name to resolve the Worker application.`);
	return { _tag: "ok", value: { topLevelName, environmentNames, environmentWorkerNames } };
}

/** Finds the nearest of `fileNames` at or above `start`. */
export function findFileUpward(start: string, fileNames: readonly string[]): string | undefined {
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

function loadWranglerConfiguration(path: string): Result<WranglerConfiguration, CloudflareDeploymentBlocked> {
	let contents: string;
	try {
		contents = readFileSync(path, "utf8");
	} catch (cause) {
		return blocked(`cannot read Wrangler config ${path}: ${errorMessage(cause)}.`);
	}
	return path.endsWith(".toml")
		? parseTomlWranglerConfiguration(contents, path)
		: parseJsonWranglerConfiguration(contents, path);
}

/** Resolves the Worker and environment a Wrangler deployment targets. */
export function resolveWranglerTarget(
	intent: DeploymentInvocation,
): Result<WorkerDeploymentTarget, CloudflareDeploymentBlocked> {
	const cwd = oneFlagValue(intent.args, ["--cwd"], "--cwd");
	if (cwd._tag === "err") return cwd;
	const effectiveCwd = resolve(intent.cwd, cwd.value ?? ".");
	const config = oneFlagValue(intent.args, ["--config", "-c"], "--config/-c");
	if (config._tag === "err") return config;
	const configPath =
		config.value === undefined ? findWranglerConfiguration(effectiveCwd) : resolve(effectiveCwd, config.value);
	if (configPath === undefined)
		return blocked(`no Wrangler config found from ${effectiveCwd}; pass --config so the Worker application is explicit.`);
	const configuration = loadWranglerConfiguration(configPath);
	if (configuration._tag === "err") return configuration;

	const cliEnvironment = oneFlagValue(intent.args, ["--env", "-e"], "--env/-e");
	if (cliEnvironment._tag === "err") return cliEnvironment;
	if (cliEnvironment.value === undefined && intent.dynamicEnvironmentNames.has("CLOUDFLARE_ENV"))
		return blocked("CLOUDFLARE_ENV is set to a value the guard cannot resolve; pass --env explicitly.");
	const environment = cliEnvironment.value ?? intent.environmentVariables.CLOUDFLARE_ENV ?? DEFAULT_ENVIRONMENT;
	if (environment.length === 0) return blocked("CLOUDFLARE_ENV must not be empty.");
	if (environment !== DEFAULT_ENVIRONMENT && !configuration.value.environmentNames.has(environment))
		return blocked(`unknown Wrangler environment ${JSON.stringify(environment)} in ${configPath}.`);
	const cliName = oneFlagValue(intent.args, ["--name"], "--name");
	if (cliName._tag === "err") return cliName;
	const worker =
		cliName.value ?? configuration.value.environmentWorkerNames[environment] ?? configuration.value.topLevelName;
	return { _tag: "ok", value: { worker, environment } };
}

function readCfPrebuiltWorkerName(cwd: string): Result<string, CloudflareDeploymentBlocked> {
	const configPath = join(cwd, ".cloudflare", "output", "v0", "workers", "default", "config.json");
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (cause) {
		return blocked(
			`cannot read cf --prebuilt Worker output ${configPath}: ${errorMessage(cause)}; run the build first.`,
		);
	}
	if (!isStringRecord(value) || typeof value.name !== "string" || value.name.length === 0)
		return blocked(`cf --prebuilt Worker output ${configPath} needs a non-empty "name".`);
	return { _tag: "ok", value: value.name };
}

function confirmCfWranglerProject(cwd: string): Result<undefined, CloudflareDeploymentBlocked> {
	const manifestPath = findFileUpward(cwd, ["package.json", "pyproject.toml", "Cargo.toml"]);
	if (manifestPath === undefined)
		return blocked("cf project discovery found no package.json, pyproject.toml, or Cargo.toml.");
	if (!manifestPath.endsWith("package.json"))
		return blocked(
			`cf project discovery selected ${manifestPath}; Python and Rust dev-server deployment targets cannot be resolved before build with confidence.`,
		);
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch (cause) {
		return blocked(`cannot parse cf project manifest ${manifestPath}: ${errorMessage(cause)}.`);
	}
	if (!isStringRecord(manifest)) return blocked(`cf project manifest ${manifestPath} is not an object.`);
	const dependencies = {
		...(isStringRecord(manifest.dependencies) ? manifest.dependencies : {}),
		...(isStringRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
	};
	if ("@cloudflare/vite-plugin" in dependencies)
		return blocked(
			"cf project discovery delegates to the Cloudflare Vite plugin, whose generated Worker target cannot be resolved before build with confidence.",
		);
	if (!("wrangler" in dependencies))
		return blocked("cf project discovery cannot confirm Wrangler as the installed Cloudflare dev server from package.json.");
	return { _tag: "ok", value: undefined };
}

/** Resolves the Worker and logical environment (`--mode`) a cf deployment targets. */
export function resolveCfTarget(intent: DeploymentInvocation): Result<WorkerDeploymentTarget, CloudflareDeploymentBlocked> {
	const positional = deploymentCommandWords(intent);
	if (positional[0] === "versions")
		return blocked(
			"cf versions deploy changes traffic but v0.6.0 does not expose enough application/environment identity to authorize it safely.",
		);
	if (positional[0] === "workers" && positional[1] === "deployments" && positional[2] === "create")
		return blocked(
			"cf workers deployments create changes Worker traffic directly, but --worker identifies only a script and provides no logical allowlist environment; ask the user to perform this traffic deployment manually.",
		);
	const mode = oneFlagValue(intent.args, ["--mode", "-m"], "--mode/-m");
	if (mode._tag === "err") return mode;
	if (mode.value === undefined)
		return blocked("cf deploy requires an explicit --mode/-m because its omitted deployment mode cannot be resolved confidently.");
	if (hasEnabledBooleanFlag(intent.args, "--prebuilt")) {
		const worker = readCfPrebuiltWorkerName(intent.cwd);
		return worker._tag === "err" ? worker : { _tag: "ok", value: { worker: worker.value, environment: mode.value } };
	}
	const project = confirmCfWranglerProject(intent.cwd);
	if (project._tag === "err") return project;
	const configPath = findWranglerConfiguration(intent.cwd);
	if (configPath === undefined)
		return blocked(
			"cf deploy project discovery did not yield a readable Wrangler config; the Worker application cannot be authorized before build with confidence.",
		);
	const configuration = loadWranglerConfiguration(configPath);
	if (configuration._tag === "err") return configuration;
	const worker = configuration.value.environmentWorkerNames[mode.value] ?? configuration.value.topLevelName;
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
		if (contents.startsWith("Alchemy.Stack", index) && !/[A-Za-z0-9_$.]/.test(contents[index - 1] ?? "")) {
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
			if (contents[index] !== "," && contents[index] !== ")") return undefined;
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

function resolveRelativeTypeScriptModule(importingPath: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const unresolved = resolve(dirname(importingPath), specifier);
	const candidates = /\.[cm]?[jt]sx?$/.test(unresolved)
		? [unresolved]
		: [`${unresolved}.ts`, `${unresolved}.mts`, `${unresolved}.js`, `${unresolved}.mjs`, join(unresolved, "index.ts")];
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
			if (importedName !== undefined && importedLocalName === localName) matches.push({ importedName, specifier });
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
		: staticallyReadExportedStringConstant(importedPath, imported.importedName, new Set([...visitedPaths, modulePath]));
}

/**
 * Reads the Stack name of `export default Handle.make(...)`, or of `export default Value;` where `Value` is
 * imported from a module that declares `export const Value = Handle.make(...)`.
 */
function staticallyReadTypedAlchemyStackName(projectPath: string, contents: string, depth = 0): string | undefined {
	const defaultStackHandles = [...contents.matchAll(/\bexport\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\.make\s*\(/g)];
	if (defaultStackHandles.length === 1) {
		const stackHandleName = defaultStackHandles[0]?.[1];
		return stackHandleName === undefined ? undefined : readStackHandleName(projectPath, contents, stackHandleName);
	}
	if (depth > 0) return undefined;
	const defaultValues = [...contents.matchAll(/\bexport\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;/g)];
	if (defaultValues.length !== 1) return undefined;
	const valueName = defaultValues[0]?.[1];
	if (valueName === undefined) return undefined;
	const valueImport = findNamedTypeScriptImport(contents, valueName);
	if (valueImport === undefined) return undefined;
	const valuePath = resolveRelativeTypeScriptModule(projectPath, valueImport.specifier);
	if (valuePath === undefined) return undefined;
	let valueContents: string;
	try {
		valueContents = readFileSync(valuePath, "utf8");
	} catch {
		return undefined;
	}
	const handles = [
		...valueContents.matchAll(
			new RegExp(
				`\\bexport\\s+const\\s+${escapeRegularExpression(valueImport.importedName)}(?:\\s*:[^=;]+)?\\s*=\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\.make\\s*\\(`,
				"g",
			),
		),
	];
	if (handles.length !== 1) return undefined;
	const stackHandleName = handles[0]?.[1];
	return stackHandleName === undefined ? undefined : readStackHandleName(valuePath, valueContents, stackHandleName);
}

function readStackHandleName(modulePath: string, contents: string, stackHandleName: string): string | undefined {
	const projectPath = modulePath;
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
	if (stackArgument.startsWith('"') || stackArgument.startsWith("'")) return stackArgument.slice(1, -1);
	return staticallyReadExportedStringConstant(stackHandlePath, stackArgument, new Set());
}

function resolveAlchemyStackName(projectPath: string): Result<string | undefined, CloudflareDeploymentBlocked> {
	let contents: string;
	try {
		contents = readFileSync(projectPath, "utf8");
	} catch (cause) {
		return blocked(`project resolution cannot read Alchemy entrypoint ${projectPath}: ${errorMessage(cause)}.`);
	}
	return {
		_tag: "ok",
		value: staticallyReadAlchemyStackName(contents) ?? staticallyReadTypedAlchemyStackName(projectPath, contents),
	};
}

/** Resolves the canonical Alchemy entrypoint, stage, and stack an Alchemy deployment targets. */
export function resolveAlchemyTarget(
	intent: DeploymentInvocation,
): Result<AlchemyDeploymentTarget, CloudflareDeploymentBlocked> {
	const cliStage = oneFlagValue(intent.args, ["--stage"], "Alchemy --stage");
	if (cliStage._tag === "err") return cliStage;
	if (intent.dynamicEnvironmentNames.has("STAGE"))
		return blocked("STAGE is set to a value the guard cannot resolve, so the Alchemy stage is ambiguous.");
	const environmentStage = intent.environmentVariables.STAGE;
	if (environmentStage !== undefined && environmentStage.length === 0)
		return blocked("stage resolution requires STAGE to be non-empty.");
	if (cliStage.value !== undefined && environmentStage !== undefined && cliStage.value !== environmentStage)
		return blocked("stage resolution found conflicting Alchemy --stage and STAGE values.");
	const stage = cliStage.value ?? environmentStage;
	if (stage === undefined)
		return blocked(
			"stage resolution requires explicit Alchemy --stage or STAGE; the dev_${USER} default is not authorized implicitly.",
		);
	const positional = deploymentCommandWords(intent);
	if (positional.length > 2) return blocked("project resolution found multiple Alchemy entrypoint arguments.");
	const projectCandidate = resolve(intent.cwd, positional[1] ?? "alchemy.run.ts");
	let project: string;
	try {
		project = realpathSync(projectCandidate);
		if (!statSync(project).isFile())
			return blocked(`project resolution requires an Alchemy entrypoint file, received ${project}.`);
	} catch (cause) {
		return blocked(`project resolution cannot canonicalize ${JSON.stringify(projectCandidate)}: ${errorMessage(cause)}.`);
	}
	const stack = resolveAlchemyStackName(project);
	return stack._tag === "err" ? stack : { _tag: "ok", value: { project, stage, stack: stack.value } };
}

const NODE_LIKE_RUNTIMES = new Set(["node", "tsx", "bun", "deno"]);
const NODE_SCRIPT_PATTERN = /\.(?:[cm]?[jt]s|tsx?)$/;
const PROCESS_SPAWN_PATTERN =
	/\b(?:child_process|ChildProcess|execa|execFile|execFileSync|execSync|spawnSync|spawn|Bun\.spawn|Deno\.Command)\b|\$`/;
const QUOTED_CLI_PATTERN = /["'`](?:wrangler|alchemy|cf)["'`\s]/;
const QUOTED_DEPLOY_VERB_PATTERN = /["'`\s](?:deploy|destroy)["'`\s]/;

/**
 * Finds `node script.ts` (also `tsx`, `bun`, `deno run`) whose source spawns Wrangler, cf, or Alchemy with a
 * deploy or destroy verb. `--help` invocations are skipped.
 */
export function findStaticNodeDeploymentScript(words: readonly ShellWord[], cwd: string): string | undefined {
	const runtime = words[0]?.value === undefined ? undefined : executableName(words[0].value);
	if (runtime === undefined || !NODE_LIKE_RUNTIMES.has(runtime)) return undefined;
	let index = 1;
	if (runtime === "deno" && words[1]?.value === "run") index = 2;
	if (runtime === "bun" && words[1]?.value === "run") index = 2;
	for (; index < words.length; index += 1) {
		const value = words[index]?.value;
		if (value === undefined) return undefined;
		if (["--import", "--require", "-r", "--loader", "--env-file"].includes(value)) {
			index += 1;
			continue;
		}
		if (["-e", "--eval", "-p", "--print"].includes(value)) return undefined;
		if (!value.startsWith("-")) break;
	}
	const scriptArgument = words[index]?.value;
	if (scriptArgument === undefined || !NODE_SCRIPT_PATTERN.test(scriptArgument)) return undefined;
	if (words.slice(index + 1).some((word) => word.value === "--help" || word.value === "-h")) return undefined;
	let scriptPath: string;
	let contents: string;
	try {
		scriptPath = realpathSync(resolve(cwd, scriptArgument));
		contents = readFileSync(scriptPath, "utf8");
	} catch {
		return undefined;
	}
	return PROCESS_SPAWN_PATTERN.test(contents) &&
		QUOTED_CLI_PATTERN.test(contents) &&
		QUOTED_DEPLOY_VERB_PATTERN.test(contents)
		? scriptPath
		: undefined;
}
