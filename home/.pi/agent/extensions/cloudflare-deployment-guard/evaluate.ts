/**
 * Evaluates one agent bash command against the Cloudflare deployment policy. Every simple command that
 * runs is classified (deployment CLI, package task, nested shell, Node entrypoint, or unrelated) in the
 * shell state it runs in; only deployment-capable commands are held to the policy.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import {
	type CloudflareDeploymentDecision,
	blockDecision,
	isDeploymentTaskName,
	mentionsCloudflareDeploymentText,
	uncertainDecision,
} from "./decision.ts";
import {
	type DeploymentInvocation,
	deploymentCommandWords,
	deploymentIntent,
	destructiveDeploymentDecision,
	findDeploymentCli,
	findStaticNodeDeploymentScript,
	resolveAlchemyTarget,
	resolveCfTarget,
	resolveWranglerTarget,
} from "./deploy-commands.ts";
import { type PackageScriptCache, parsePackageTask, resolvePackageTaskCommands } from "./package-scripts.ts";
import {
	type CloudflareDeploymentPolicy,
	type RepositoryIdentityCache,
	alchemyPolicyDecision,
	isAllowlistedRepositoryWorkingDirectory,
	workerPolicyDecision,
} from "./policy.ts";
import {
	type ShellState,
	type ShellWord,
	type SimpleShellCommand,
	childProcessShellState,
	createShellState,
	executableName,
	isShellVariableDynamic,
	nestedShellScript,
	parseShellScript,
	resolveShellPath,
	walkShellProgram,
} from "./shell-ast.ts";

const MAX_NESTING_DEPTH = 12;
const MAX_SHELL_SCRIPT_BYTES = 512 * 1024;
const DEPLOYMENT_ENVIRONMENT_NAMES = ["CLOUDFLARE_ENV", "STAGE"] as const;
const DYNAMIC_MARKER = "\u0000dynamic";

export type DeploymentEvaluationOptions = {
	readonly cwd: string;
	readonly policy: CloudflareDeploymentPolicy;
	/** Ambient `CLOUDFLARE_ENV`/`STAGE` the agent's shell inherits. */
	readonly environmentVariables?: Readonly<Record<string, string>>;
	/** Exempt repositories holding allowlisted Alchemy projects (default true); false is for measurement. */
	readonly repositoryExemption?: boolean;
};

/** File-system caches shared across evaluations by one extension instance. */
export type DeploymentEvaluationCache = {
	readonly packageScripts: PackageScriptCache;
	readonly repositories: RepositoryIdentityCache;
};

export function createDeploymentEvaluationCache(): DeploymentEvaluationCache {
	return { packageScripts: new Map(), repositories: new Map() };
}

type EvaluationContext = {
	readonly policy: CloudflareDeploymentPolicy;
	readonly cache: DeploymentEvaluationCache;
	readonly depth: number;
	readonly activeScripts: ReadonlySet<string>;
	/** Shared by nested evaluations: set when any deployment (including a dry run) was recognized. */
	readonly progress: { sawDeployment: boolean };
	/** In an exempt repository only Wrangler deletion and Alchemy destroy are still blocked. */
	readonly destructiveOnly: boolean;
};

/** Evaluates recognized Wrangler, cf, and Alchemy deployments in a bash command against the policy. */
export function evaluateCloudflareDeploymentCommand(
	command: string,
	options: DeploymentEvaluationOptions,
	cache: DeploymentEvaluationCache = createDeploymentEvaluationCache(),
): CloudflareDeploymentDecision {
	const exempt =
		options.repositoryExemption !== false &&
		isAllowlistedRepositoryWorkingDirectory(options.cwd, options.policy, cache.repositories);
	const context: EvaluationContext = {
		policy: options.policy,
		cache,
		depth: 0,
		activeScripts: new Set(),
		progress: { sawDeployment: false },
		destructiveOnly: exempt,
	};
	const decision = evaluateShellSource(command, createShellState(options.cwd, options.environmentVariables), context);
	if (decision !== undefined) return decision;
	if (exempt)
		return { _tag: "allow", reason: "Cloudflare deployment guard exempted this canonical allowlisted repository." };
	return context.progress.sawDeployment
		? { _tag: "allow", reason: "Only dry-run or allowlisted Cloudflare deployments were found." }
		: { _tag: "unrelated" };
}

function evaluateShellSource(
	source: string,
	state: ShellState,
	context: EvaluationContext,
): CloudflareDeploymentDecision | undefined {
	const parsed = parseShellScript(source);
	if (parsed._tag === "err")
		return mentionsCloudflareDeploymentText(source)
			? uncertainDecision(`the shell command around a deployment could not be parsed (${parsed.message}).`)
			: undefined;
	return walkShellProgram(parsed, state, (command, commandState) => evaluateSimpleCommand(command, commandState, context));
}

type UnwrappedCommand = {
	readonly words: readonly ShellWord[];
	readonly assignments: ReadonlyMap<string, string | undefined>;
	/** A secrets wrapper (`doppler run`, `op run`) injects variables the guard cannot see. */
	readonly injectsEnvironment: boolean;
	/** `xargs` and `find -exec` append arguments from their input. */
	readonly appendsDynamicArguments: boolean;
	readonly opaque: string | undefined;
};

const SIMPLE_WRAPPERS = new Set(["nohup", "time", "caffeinate", "unbuffer", "chronic", "stdbuf", "nice", "ionice"]);
const SECRET_WRAPPERS = new Set(["doppler", "op", "infisical", "dotenvx", "dotenv", "varlock", "envchain"]);
const WRAPPER_VALUE_OPTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
	env: new Set(["-u", "--unset", "-C", "--chdir"]),
	sudo: new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U"]),
	doas: new Set(["-u", "-C"]),
	exec: new Set(["-a"]),
	nice: new Set(["-n"]),
	ionice: new Set(["-c", "-n", "-p"]),
	timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
	xargs: new Set(["-n", "-L", "-P", "-s", "-d", "-E", "-I", "-a", "-J", "-R", "-S"]),
};

function skipOptions(words: readonly ShellWord[], from: number, valueOptions: ReadonlySet<string> | undefined): number {
	let index = from;
	while (index < words.length) {
		const value = words[index]?.value;
		if (value === undefined || !value.startsWith("-") || value === "-") break;
		index += 1;
		if (value === "--") break;
		if (valueOptions?.has(value)) index += 1;
	}
	return index;
}

/** Strips command wrappers (`env X=1`, `sudo`, `timeout 60`, `xargs`, `find -exec`, `doppler run --`). */
function unwrapCommandWrappers(words: readonly ShellWord[]): UnwrappedCommand {
	let current = words;
	const assignments = new Map<string, string | undefined>();
	let injectsEnvironment = false;
	let appendsDynamicArguments = false;
	for (let guard = 0; guard < 16; guard += 1) {
		const name = current[0]?.value === undefined ? undefined : executableName(current[0].value);
		if (name === undefined) break;
		if (name === "env") {
			if (current.some((word) => word.value === "-S" || word.value?.startsWith("--split-string")))
				return { words: current, assignments, injectsEnvironment, appendsDynamicArguments, opaque: "env -S splits a string into a command" };
			let index = skipOptions(current, 1, WRAPPER_VALUE_OPTIONS.env);
			while (index < current.length) {
				const word = current[index];
				const match = word?.value?.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);
				if (match?.[1] === undefined) {
					if (word?.value === undefined && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word?.source ?? ""))
						assignments.set(word?.source.split("=")[0] ?? "", undefined);
					else break;
				} else assignments.set(match[1], match[2]);
				index += 1;
			}
			current = current.slice(index);
			continue;
		}
		if (name === "command") {
			if (current.some((word, index) => index > 0 && (word.value === "-v" || word.value === "-V")))
				return { words: [], assignments, injectsEnvironment, appendsDynamicArguments, opaque: undefined };
			current = current.slice(skipOptions(current, 1, undefined));
			continue;
		}
		if (name === "exec" || name === "sudo" || name === "doas" || SIMPLE_WRAPPERS.has(name)) {
			let index = skipOptions(current, 1, WRAPPER_VALUE_OPTIONS[name]);
			// `nice -10 cmd` and `stdbuf -oL cmd` already skipped as options.
			if (name === "sudo" || name === "doas") {
				while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(current[index]?.value ?? "")) index += 1;
			}
			current = current.slice(index);
			continue;
		}
		if (name === "timeout") {
			current = current.slice(skipOptions(current, 1, WRAPPER_VALUE_OPTIONS.timeout) + 1);
			continue;
		}
		if (name === "xargs") {
			appendsDynamicArguments = true;
			current = current.slice(skipOptions(current, 1, WRAPPER_VALUE_OPTIONS.xargs));
			continue;
		}
		if (name === "find") {
			const execIndex = current.findIndex((word) => ["-exec", "-execdir", "-ok", "-okdir"].includes(word.value ?? ""));
			if (execIndex === -1) break;
			const rest = current.slice(execIndex + 1);
			const end = rest.findIndex((word) => word.value === ";" || word.value === "+");
			appendsDynamicArguments = true;
			current = end === -1 ? rest : rest.slice(0, end);
			continue;
		}
		if (SECRET_WRAPPERS.has(name)) {
			const separator = current.findIndex((word) => word.value === "--");
			if (separator === -1) {
				if (name === "dotenv" || name === "envchain") {
					injectsEnvironment = true;
					current = current.slice(skipOptions(current, 1, new Set(["-e", "-f", "-c", "-v", "-p"])));
					continue;
				}
				break;
			}
			injectsEnvironment = true;
			current = current.slice(separator + 1);
			continue;
		}
		break;
	}
	return { words: current, assignments, injectsEnvironment, appendsDynamicArguments, opaque: undefined };
}

/** The environment one command runs with: exported variables, wrapper assignments, and prefix assignments. */
function commandEnvironment(
	state: ShellState,
	command: SimpleShellCommand,
	unwrapped: UnwrappedCommand,
): { readonly environment: Map<string, string | undefined>; readonly unknown: boolean } {
	const environment = new Map(state.environment);
	for (const [name, value] of command.assignments) environment.set(name, value);
	for (const [name, value] of unwrapped.assignments) environment.set(name, value);
	return { environment, unknown: state.unknownEnvironment || unwrapped.injectsEnvironment };
}

function evaluateSimpleCommand(
	command: SimpleShellCommand,
	state: ShellState,
	context: EvaluationContext,
): CloudflareDeploymentDecision | undefined {
	const unwrapped = unwrapCommandWrappers(command.words);
	if (unwrapped.opaque !== undefined)
		return mentionsCloudflareDeploymentText(command.source)
			? uncertainDecision(`${unwrapped.opaque}; run the deployment command directly.`)
			: undefined;
	const words = unwrapped.words;
	const nameWord = words[0];
	if (nameWord === undefined) return undefined;
	if (nameWord.value === undefined)
		return mentionsCloudflareDeploymentText(command.source)
			? uncertainDecision(`the command name ${JSON.stringify(nameWord.source)} is dynamic; run the deployment command directly.`)
			: undefined;

	const environment = commandEnvironment(state, command, unwrapped);
	const nested = nestedShellScript(words, command.standardInput, command.source);
	if (nested !== undefined) {
		if (context.destructiveOnly && nested.kind !== "source") return undefined;
		return evaluateNestedShell(nested, executableName(nameWord.value), state, environment, context);
	}
	if (context.destructiveOnly) {
		const cli = findDeploymentCli(words);
		if (cli === undefined) return undefined;
		const args = words.slice(cli.argumentIndex).map((word) => word.value ?? DYNAMIC_MARKER);
		return destructiveDeploymentDecision({
			cli: cli.cli,
			args,
			dynamicArguments: [],
			environmentVariables: {},
			dynamicEnvironmentNames: new Set(),
			cwd: state.cwd,
		});
	}

	const nodeScript = findStaticNodeDeploymentScript(words, state.cwd);
	if (nodeScript !== undefined)
		return uncertainDecision(
			`script resolution found Cloudflare deployment logic in static Node entrypoint ${JSON.stringify(nodeScript)}.`,
		);

	const cli = findDeploymentCli(words);
	if (cli !== undefined)
		return evaluateDeploymentInvocation(cli, words, unwrapped, environment, state, context);

	return evaluatePackageTask(words, command, environment, state, context);
}

function deploymentEnvironment(environment: { readonly environment: ReadonlyMap<string, string | undefined>; readonly unknown: boolean }): {
	readonly environmentVariables: Readonly<Record<string, string>>;
	readonly dynamicEnvironmentNames: ReadonlySet<string>;
} {
	const environmentVariables: Record<string, string> = {};
	const dynamicEnvironmentNames = new Set<string>();
	for (const name of DEPLOYMENT_ENVIRONMENT_NAMES) {
		if (isShellVariableDynamic(environment.environment, environment.unknown, name)) dynamicEnvironmentNames.add(name);
		else {
			const value = environment.environment.get(name);
			if (value !== undefined) environmentVariables[name] = value;
		}
	}
	return { environmentVariables, dynamicEnvironmentNames };
}

function evaluateDeploymentInvocation(
	cli: NonNullable<ReturnType<typeof findDeploymentCli>>,
	words: readonly ShellWord[],
	unwrapped: UnwrappedCommand,
	environment: { readonly environment: ReadonlyMap<string, string | undefined>; readonly unknown: boolean },
	state: ShellState,
	context: EvaluationContext,
): CloudflareDeploymentDecision | undefined {
	const argumentWords = words.slice(cli.argumentIndex);
	const dynamicArguments = argumentWords.filter((word) => word.value === undefined).map((word) => word.source);
	if (unwrapped.appendsDynamicArguments) dynamicArguments.push("(arguments appended by xargs or find -exec)");
	const invocation: DeploymentInvocation = {
		cli: cli.cli,
		args: argumentWords.map((word) => word.value ?? DYNAMIC_MARKER),
		dynamicArguments,
		...deploymentEnvironment(environment),
		cwd: state.cwd,
	};
	const destructive = destructiveDeploymentDecision(invocation);
	if (destructive !== undefined) return destructive;
	const positional = deploymentCommandWords(invocation);
	// Only verb positions decide intent: `alchemy state read "$id"` has a dynamic operand, not a dynamic verb.
	const verbCount =
		cli.cli === "alchemy"
			? 1
			: cli.cli === "cf" && positional[0] === "workers"
				? 3
				: ["versions", "triggers", "pages"].includes(positional[0] ?? "")
					? 2
					: 1;
	if (positional.slice(0, verbCount).includes(DYNAMIC_MARKER))
		return uncertainDecision(
			`the ${cli.cli} subcommand is dynamic (${dynamicArguments.join(" ")}); run the deployment command directly.`,
		);
	const intent = deploymentIntent(invocation);
	if (intent === undefined) return undefined;
	context.progress.sawDeployment = true;
	if (dynamicArguments.length > 0)
		return uncertainDecision(
			`deployment arguments ${dynamicArguments.map((value) => JSON.stringify(value)).join(", ")} are dynamic, so the target cannot be resolved.`,
		);
	if (intent.dryRun) return undefined;
	if (state.cwdProblem !== undefined)
		return uncertainDecision(`project resolution cannot determine the working directory: ${state.cwdProblem}.`);
	if (intent.cli === "alchemy") {
		const target = resolveAlchemyTarget(intent);
		if (target._tag === "err") return blockDecision(target.error);
		const decision = alchemyPolicyDecision(target.value, context.policy, context.cache.repositories);
		return decision._tag === "block" ? decision : undefined;
	}
	const target = intent.cli === "wrangler" ? resolveWranglerTarget(intent) : resolveCfTarget(intent);
	if (target._tag === "err") return blockDecision(target.error);
	const decision = workerPolicyDecision(target.value, context.policy);
	return decision._tag === "block" ? decision : undefined;
}

function evaluateNestedShell(
	nested: NonNullable<ReturnType<typeof nestedShellScript>>,
	name: string,
	state: ShellState,
	environment: { readonly environment: Map<string, string | undefined>; readonly unknown: boolean },
	context: EvaluationContext,
): CloudflareDeploymentDecision | undefined {
	if (nested.kind === "noexec") return undefined;
	if (nested.kind === "opaque")
		return mentionsCloudflareDeploymentText(nested.evidence)
			? uncertainDecision(`${nested.why} around a deployment; run the deployment command directly.`)
			: undefined;
	if (context.depth >= MAX_NESTING_DEPTH)
		return uncertainDecision(`script resolution exceeded ${MAX_NESTING_DEPTH} nested shells or package scripts.`);
	let source: string;
	if (nested.kind === "file") {
		const path = resolveShellPath(state.cwd, nested.path);
		try {
			const stats = statSync(path);
			if (!stats.isFile() || stats.size > MAX_SHELL_SCRIPT_BYTES) return undefined;
			source = readFileSync(path, "utf8");
		} catch {
			return undefined;
		}
		// A script that never mentions deploying cannot deploy through a recognized command.
		if (!/deploy|destroy|publish|delete/i.test(source)) return undefined;
	} else source = nested.source;

	// eval runs in the current shell; every other form starts a child process with exported variables.
	const nestedState: ShellState =
		name === "eval"
			? state
			: {
					...childProcessShellState(state),
					environment: new Map(environment.environment),
					unknownEnvironment: environment.unknown,
				};
	const sawBefore = context.progress.sawDeployment;
	context.progress.sawDeployment = false;
	const decision = evaluateShellSource(source, nestedState, { ...context, depth: context.depth + 1 });
	const reached = context.progress.sawDeployment;
	context.progress.sawDeployment = sawBefore || reached;
	if (decision !== undefined) return decision;
	if (reached && nested.kind !== "file" && nested.loginOrInteractive)
		return uncertainDecision(
			"a login or interactive shell may change the deployment environment through its startup files; run the deployment command directly.",
		);
	return undefined;
}

function evaluatePackageTask(
	words: readonly ShellWord[],
	command: SimpleShellCommand,
	environment: { readonly environment: Map<string, string | undefined>; readonly unknown: boolean },
	state: ShellState,
	context: EvaluationContext,
): CloudflareDeploymentDecision | undefined {
	const parsed = parsePackageTask(words, state.cwd);
	if (parsed._tag === "none") return undefined;
	if (parsed._tag === "unresolvable") {
		const mayDeploy =
			parsed.taskName === undefined
				? mentionsCloudflareDeploymentText(command.source) || /deploy|destroy/i.test(command.source)
				: isDeploymentTaskName(parsed.taskName);
		return mayDeploy ? blockDecision(parsed.error) : undefined;
	}
	const task = parsed.task;
	const mayDeploy = isDeploymentTaskName(task.taskName);
	if (state.cwdProblem !== undefined && task.filter === undefined)
		return mayDeploy
			? uncertainDecision(`script resolution cannot determine the working directory: ${state.cwdProblem}.`)
			: undefined;
	const resolved = resolvePackageTaskCommands(task, context.cache.packageScripts);
	if (resolved._tag === "err") return mayDeploy ? blockDecision(resolved.error) : undefined;
	if (resolved.value.length === 0)
		return mayDeploy
			? uncertainDecision(`script resolution found no static script ${JSON.stringify(task.taskName)}.`)
			: undefined;

	let reachedDeployment = false;
	for (const script of resolved.value) {
		const scriptKey = `${script.sourcePath}#${script.taskName}`;
		// A cycle runs nothing new; built-ins such as `vp test` look like one when a script shares their name.
		if (context.activeScripts.has(scriptKey)) continue;
		if (context.depth >= MAX_NESTING_DEPTH) {
			if (mayDeploy)
				return uncertainDecision(`script resolution exceeded ${MAX_NESTING_DEPTH} nested shells or package scripts.`);
			continue;
		}
		const scriptState: ShellState = {
			...childProcessShellState(state, dirname(script.sourcePath)),
			environment: new Map(environment.environment),
			unknownEnvironment: environment.unknown,
		};
		const sawBefore = context.progress.sawDeployment;
		context.progress.sawDeployment = false;
		const decision = evaluateShellSource(script.command, scriptState, {
			...context,
			depth: context.depth + 1,
			activeScripts: new Set([...context.activeScripts, scriptKey]),
		});
		reachedDeployment ||= context.progress.sawDeployment;
		context.progress.sawDeployment = sawBefore || context.progress.sawDeployment;
		if (decision !== undefined) return decision;
	}
	if (mayDeploy && !reachedDeployment)
		return uncertainDecision(
			`script resolution for ${JSON.stringify(task.taskName)} did not reach a recognized static deployment command.`,
		);
	return undefined;
}
