/**
 * Bash parsing for the Cloudflare deployment guard. Commands are parsed with mvdan/sh (`sh-syntax`), then
 * walked in execution order so that only the words of commands that actually run decide anything: heredoc
 * bodies, quoted strings, and redirect targets are data unless they are fed to a shell.
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

import { BinCmdOperator, RedirOperator, parse } from "sh-syntax/sync";
import type {
	Assign,
	CallExpr,
	DeclClause,
	File,
	Redirect,
	Stmt,
	Word,
	WordPart,
} from "sh-syntax/sync";

/** One evaluated shell word. `value` is undefined when the word depends on runtime expansion. */
export type ShellWord = {
	readonly value: string | undefined;
	/** The word's source text, for diagnostics and localized heuristics. */
	readonly source: string;
	/** True when an unquoted glob character remains in the value. */
	readonly glob: boolean;
};

export type ShellRedirect = {
	readonly kind: "write" | "read" | "duplicate" | "heredoc";
	readonly fileDescriptor: string | undefined;
	readonly target: ShellWord | undefined;
};

/** Where a command's standard input comes from. */
export type ShellStandardInput =
	| { readonly kind: "inherited" }
	| { readonly kind: "heredoc"; readonly source: string }
	| { readonly kind: "file"; readonly path: ShellWord }
	| { readonly kind: "pipe"; readonly upstreamSource: string };

/** One simple command (`CallExpr`) that runs, with its words evaluated in the walk's current state. */
export type SimpleShellCommand = {
	readonly words: readonly ShellWord[];
	/** `NAME=value` prefix assignments, which only apply to this command. */
	readonly assignments: ReadonlyMap<string, string | undefined>;
	readonly redirects: readonly ShellRedirect[];
	readonly standardInput: ShellStandardInput;
	readonly source: string;
};

/**
 * The shell state a command runs in. `environment` holds exported variables; a value of undefined means
 * the variable is set to something the guard cannot know.
 */
export type ShellState = {
	cwd: string;
	/** Why the working directory is uncertain, if it is. */
	cwdProblem: string | undefined;
	environment: Map<string, string | undefined>;
	shellVariables: Map<string, string | undefined>;
	/** `source`/`.`/`set -a` side effects: unlisted variables may hold anything. */
	unknownEnvironment: boolean;
	allExport: boolean;
};

export type ShellParseResult =
	| { readonly _tag: "ok"; readonly file: File; readonly bytes: Buffer }
	| { readonly _tag: "err"; readonly message: string };

/** Parses bash source; parse failures are returned, never thrown. */
export function parseShellScript(source: string): ShellParseResult {
	try {
		return { _tag: "ok", file: parse(source), bytes: Buffer.from(source, "utf8") };
	} catch (cause) {
		return { _tag: "err", message: cause instanceof Error ? cause.message : String(cause) };
	}
}

/** Creates the state a top-level command starts in. */
export function createShellState(
	cwd: string,
	environment: Readonly<Record<string, string>> = {},
): ShellState {
	return {
		cwd: resolve(cwd),
		cwdProblem: undefined,
		environment: new Map(Object.entries(environment)),
		shellVariables: new Map(),
		unknownEnvironment: false,
		allExport: false,
	};
}

/** Copies a state for a subshell, pipeline element, or nested shell. */
export function cloneShellState(state: ShellState): ShellState {
	return {
		...state,
		environment: new Map(state.environment),
		shellVariables: new Map(state.shellVariables),
	};
}

/** A child process (`bash -c`, a package script) sees exported variables only. */
export function childProcessShellState(state: ShellState, cwd = state.cwd): ShellState {
	return {
		cwd,
		cwdProblem: cwd === state.cwd ? state.cwdProblem : undefined,
		environment: new Map(state.environment),
		shellVariables: new Map(),
		unknownEnvironment: state.unknownEnvironment,
		allExport: false,
	};
}

/** Reads one variable as a command would see it; undefined means unknown. */
export function lookupShellVariable(state: ShellState, name: string): string | undefined {
	if (state.shellVariables.has(name)) return state.shellVariables.get(name);
	if (state.environment.has(name)) return state.environment.get(name);
	if (name === "HOME") return homedir();
	if (name === "PWD" && state.cwdProblem === undefined) return state.cwd;
	return undefined;
}

/** True when a variable is set to a value the guard cannot know. */
export function isShellVariableDynamic(
	environment: ReadonlyMap<string, string | undefined>,
	unknownEnvironment: boolean,
	name: string,
): boolean {
	if (environment.has(name)) return environment.get(name) === undefined;
	return unknownEnvironment;
}

const ANSI_C_ESCAPES: Readonly<Record<string, string>> = {
	a: "\u0007",
	b: "\b",
	e: "\u001b",
	E: "\u001b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
	v: "\v",
	"\\": "\\",
	"'": "'",
	'"': '"',
	"?": "?",
};

function decodeAnsiCQuoted(value: string): string {
	return value.replace(
		/\\(x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|[0-7]{1,3}|.)/g,
		(match, escape: string) => {
			if (/^x/.test(escape)) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
			if (/^[uU]/.test(escape)) return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
			if (/^[0-7]/.test(escape)) return String.fromCharCode(Number.parseInt(escape, 8));
			return ANSI_C_ESCAPES[escape] ?? match;
		},
	);
}

function unescapeUnquotedLiteral(value: string): string {
	return value.replace(/\\\n/g, "").replace(/\\(.)/gs, "$1");
}

function unescapeDoubleQuotedLiteral(value: string): string {
	return value.replace(/\\\n/g, "").replace(/\\([$`"\\])/g, "$1");
}

type WordEvaluation = { value: string; dynamic: boolean; glob: boolean };

function evaluateWordParts(
	parts: readonly WordPart[],
	state: ShellState,
	quoted: boolean,
	isFirstWordPart: boolean,
): WordEvaluation {
	let value = "";
	let dynamic = false;
	let glob = false;
	for (const [index, part] of parts.entries()) {
		switch (part.type) {
			case "Lit": {
				let literal = quoted
					? unescapeDoubleQuotedLiteral(part.value)
					: unescapeUnquotedLiteral(part.value);
				if (!quoted && isFirstWordPart && index === 0 && /^~(?=\/|$)/.test(part.value))
					literal = homedir() + literal.slice(1);
				else if (!quoted && isFirstWordPart && index === 0 && part.value.startsWith("~"))
					dynamic = true;
				if (!quoted && /(?<!\\)[*?[]/.test(part.value)) glob = true;
				value += literal;
				break;
			}
			case "SglQuoted":
				value += part.dollar ? decodeAnsiCQuoted(part.value) : part.value;
				break;
			case "DblQuoted": {
				const inner = evaluateWordParts(part.parts, state, true, false);
				value += inner.value;
				dynamic ||= inner.dynamic;
				break;
			}
			case "ParamExp": {
				const simple =
					part.param !== null &&
					!part.excl &&
					!part.length &&
					!part.width &&
					part.index === null &&
					part.slice === null &&
					part.repl === null &&
					part.exp === null &&
					part.nestedParam === null &&
					part.modifiers.length === 0;
				const resolved = simple ? lookupShellVariable(state, part.param?.value ?? "") : undefined;
				if (resolved === undefined) dynamic = true;
				else value += resolved;
				break;
			}
			default:
				// Command and process substitution, arithmetic, brace expansion, and extended globs.
				dynamic = true;
		}
	}
	return { value, dynamic, glob };
}

/** A shell program with byte offsets, so node source text can be sliced exactly. */
export type ShellSource = { readonly bytes: Buffer };

export function nodeSource(source: ShellSource, node: { readonly start: number; readonly end: number }): string {
	return source.bytes.subarray(node.start, node.end).toString("utf8");
}

/** Evaluates a word against the current state. */
export function evaluateShellWord(word: Word, state: ShellState, source: ShellSource): ShellWord {
	const evaluated = evaluateWordParts(word.parts, state, false, true);
	return {
		value: evaluated.dynamic ? undefined : evaluated.value,
		source: nodeSource(source, word),
		glob: evaluated.glob,
	};
}

const WRITE_REDIRECTS = new Set<number>([
	RedirOperator.RdrOut,
	RedirOperator.AppOut,
	RedirOperator.RdrInOut,
	RedirOperator.RdrClob,
	RedirOperator.AppClob,
	RedirOperator.RdrAll,
	RedirOperator.RdrAllClob,
	RedirOperator.AppAll,
	RedirOperator.AppAllClob,
]);
const HEREDOC_REDIRECTS = new Set<number>([
	RedirOperator.Hdoc,
	RedirOperator.DashHdoc,
	RedirOperator.WordHdoc,
]);

function describeRedirect(redirect: Redirect, state: ShellState, source: ShellSource): ShellRedirect {
	const target = redirect.word === null ? undefined : evaluateShellWord(redirect.word, state, source);
	const fileDescriptor = redirect.n?.value;
	if (HEREDOC_REDIRECTS.has(redirect.op)) return { kind: "heredoc", fileDescriptor, target };
	if (WRITE_REDIRECTS.has(redirect.op)) return { kind: "write", fileDescriptor, target };
	if (redirect.op === RedirOperator.DplOut || redirect.op === RedirOperator.DplIn) {
		// `>&file` (not a descriptor number or `-`) writes to a file.
		const isDescriptor = target?.value !== undefined && /^(?:\d+-?|-)$/.test(target.value);
		if (redirect.op === RedirOperator.DplOut && !isDescriptor)
			return { kind: "write", fileDescriptor, target };
		return { kind: "duplicate", fileDescriptor, target };
	}
	return { kind: "read", fileDescriptor, target };
}

function heredocSource(redirect: Redirect, state: ShellState, source: ShellSource): string | undefined {
	if (redirect.op === RedirOperator.WordHdoc)
		return redirect.word === null ? undefined : evaluateShellWord(redirect.word, state, source).value;
	if (redirect.hdoc === null) return "";
	// Heredoc bodies keep their raw text: the nested shell expands what the outer shell would have.
	return nodeSource(source, redirect.hdoc);
}

function standardInputOf(
	redirects: readonly Redirect[],
	state: ShellState,
	source: ShellSource,
	pipeUpstream: string | undefined,
): ShellStandardInput {
	let input: ShellStandardInput =
		pipeUpstream === undefined ? { kind: "inherited" } : { kind: "pipe", upstreamSource: pipeUpstream };
	for (const redirect of redirects) {
		const descriptor = redirect.n?.value;
		if (descriptor !== undefined && descriptor !== "0") continue;
		if (HEREDOC_REDIRECTS.has(redirect.op)) {
			const text = heredocSource(redirect, state, source);
			input =
				text === undefined
					? { kind: "pipe", upstreamSource: nodeSource(source, redirect) }
					: { kind: "heredoc", source: text };
		} else if (redirect.op === RedirOperator.RdrIn && redirect.word !== null)
			input = { kind: "file", path: evaluateShellWord(redirect.word, state, source) };
	}
	return input;
}

/** What a visitor returns: undefined continues the walk, a value stops it. */
export type ShellVisitor<T> = (command: SimpleShellCommand, state: ShellState) => T | undefined;

type WalkContext<T> = {
	readonly source: ShellSource;
	readonly visit: ShellVisitor<T>;
};

/** Collects command and process substitutions nested anywhere below a node, without descending into them. */
function collectSubstitutions(node: unknown, found: Stmt[][]): void {
	if (node === null || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const child of node) collectSubstitutions(child, found);
		return;
	}
	const record = node as { readonly type?: unknown; readonly stmts?: unknown };
	if ((record.type === "CmdSubst" || record.type === "ProcSubst") && Array.isArray(record.stmts)) {
		found.push(record.stmts as Stmt[]);
		return;
	}
	for (const [key, value] of Object.entries(record)) {
		if (key === "type" || typeof value !== "object") continue;
		collectSubstitutions(value, found);
	}
}

function walkSubstitutions<T>(node: unknown, state: ShellState, context: WalkContext<T>): T | undefined {
	const substitutions: Stmt[][] = [];
	collectSubstitutions(node, substitutions);
	for (const stmts of substitutions) {
		const result = walkStatements(stmts, cloneShellState(state), context);
		if (result !== undefined) return result;
	}
	return undefined;
}

function isExistingDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function changeDirectory(state: ShellState, target: ShellWord | undefined, label: string): void {
	if (target === undefined) {
		state.cwd = lookupShellVariable(state, "HOME") ?? homedir();
		state.cwdProblem = undefined;
		return;
	}
	if (target.value === undefined || target.value === "-") {
		state.cwdProblem = `${label} target ${JSON.stringify(target.source)} is dynamic`;
		return;
	}
	const next = isAbsolute(target.value) ? resolve(target.value) : resolve(state.cwd, target.value);
	if (!isExistingDirectory(next)) {
		state.cwdProblem = `${label} target ${JSON.stringify(target.value)} does not exist`;
		return;
	}
	// An absolute target is known even after an earlier uncertain cd.
	if (state.cwdProblem !== undefined && !isAbsolute(target.value)) return;
	state.cwd = next;
	state.cwdProblem = undefined;
}

function setShellVariable(state: ShellState, name: string, value: string | undefined, exported: boolean): void {
	state.shellVariables.set(name, value);
	if (exported || state.allExport || state.environment.has(name)) state.environment.set(name, value);
}

function applyDeclaration(clause: DeclClause, state: ShellState, source: ShellSource): void {
	const variant = clause.variant?.value ?? "";
	const assigns: readonly Assign[] = clause.args.length > 0 ? clause.args : clause.assigns;
	let exported = variant === "export";
	let unexport = false;
	for (const assign of assigns) {
		// Flags such as `-x` and `-n` are nameless naked assignments whose value is the flag.
		if (assign.name !== null || assign.value === null) continue;
		const flag = evaluateShellWord(assign.value, state, source).value ?? "";
		if (/^-\w*x/.test(flag)) exported = true;
		if (variant === "export" && /^-\w*n/.test(flag)) unexport = true;
	}
	for (const assign of assigns) {
		const name = assign.name?.value;
		if (name === undefined) continue;
		if (unexport) {
			state.environment.delete(name);
			continue;
		}
		if (assign.naked && assign.value === null) {
			if (exported) state.environment.set(name, lookupShellVariable(state, name));
			continue;
		}
		const value =
			assign.value === null ? "" : evaluateShellWord(assign.value, state, source).value;
		setShellVariable(state, name, assign.array === null ? value : undefined, exported);
	}
}

/** Applies the effect of `cd`, `pushd`, `popd`, `unset`, `set`, and `source` on the shell state. */
function applyStateBuiltin(command: SimpleShellCommand, state: ShellState): void {
	const [name, ...args] = command.words;
	switch (name?.value) {
		case "cd":
		case "pushd": {
			const operands = args.filter((word) => !(word.value !== undefined && /^-[LPe@]+$/.test(word.value)));
			if (name.value === "pushd" && operands.length === 0) {
				state.cwdProblem = "pushd without a target swaps to an unknown directory";
				return;
			}
			changeDirectory(state, operands[0], name.value);
			return;
		}
		case "popd":
			state.cwdProblem = "popd returns to an unknown directory";
			return;
		case "unset":
			for (const word of args) {
				if (word.value === undefined || word.value.startsWith("-")) continue;
				state.shellVariables.delete(word.value);
				state.environment.delete(word.value);
			}
			return;
		case "set":
			for (const [index, word] of args.entries()) {
				if (word.value === undefined) continue;
				if (/^-[a-zA-Z]*a/.test(word.value)) state.allExport = true;
				if (/^\+[a-zA-Z]*a/.test(word.value)) state.allExport = false;
				if (word.value === "-o" && args[index + 1]?.value === "allexport") state.allExport = true;
				if (word.value === "+o" && args[index + 1]?.value === "allexport") state.allExport = false;
			}
			return;
		case "source":
		case ".":
			state.unknownEnvironment = true;
			return;
		default:
	}
}

function walkCall<T>(
	stmt: Stmt,
	call: CallExpr,
	state: ShellState,
	context: WalkContext<T>,
	pipeUpstream: string | undefined,
): T | undefined {
	const nested = walkSubstitutions([call.args, call.assigns, stmt.redirs], state, context);
	if (nested !== undefined) return nested;
	if (call.args.length === 0) {
		for (const assign of call.assigns) {
			const name = assign.name?.value;
			if (name === undefined) continue;
			const value =
				assign.array !== null
					? undefined
					: assign.value === null
						? ""
						: evaluateShellWord(assign.value, state, context.source).value;
			setShellVariable(state, name, value, false);
		}
		if (stmt.redirs.length === 0) return undefined;
	}
	const assignments = new Map<string, string | undefined>();
	for (const assign of call.assigns) {
		const name = assign.name?.value;
		if (name === undefined) continue;
		assignments.set(
			name,
			assign.array !== null
				? undefined
				: assign.value === null
					? ""
					: evaluateShellWord(assign.value, state, context.source).value,
		);
	}
	const command: SimpleShellCommand = {
		words: call.args.map((word) => evaluateShellWord(word, state, context.source)),
		assignments,
		redirects: stmt.redirs.map((redirect) => describeRedirect(redirect, state, context.source)),
		standardInput: standardInputOf(stmt.redirs, state, context.source, pipeUpstream),
		source: nodeSource(context.source, stmt),
	};
	const result = context.visit(command, state);
	if (result !== undefined) return result;
	applyStateBuiltin(command, state);
	return undefined;
}

function markCwdChangedIn(before: ShellState, after: ShellState, target: ShellState, why: string): void {
	if (after.cwd !== before.cwd || after.cwdProblem !== before.cwdProblem)
		target.cwdProblem = why;
}

function walkStatement<T>(
	stmt: Stmt,
	state: ShellState,
	context: WalkContext<T>,
	pipeUpstream?: string,
): T | undefined {
	// A background job runs in its own subshell.
	const effectiveState = stmt.background ? cloneShellState(state) : state;
	const command = stmt.cmd;
	if (command === null) return walkSubstitutions(stmt.redirs, effectiveState, context);
	switch (command.type) {
		case "CallExpr":
			return walkCall(stmt, command, effectiveState, context, pipeUpstream);
		case "BinaryCmd": {
			if (command.x === null || command.y === null) return undefined;
			if (command.op === BinCmdOperator.Pipe || command.op === BinCmdOperator.PipeAll) {
				const left = walkStatement(command.x, cloneShellState(effectiveState), context, pipeUpstream);
				if (left !== undefined) return left;
				return walkStatement(
					command.y,
					cloneShellState(effectiveState),
					context,
					nodeSource(context.source, command.x),
				);
			}
			const before = cloneShellState(effectiveState);
			const left = walkStatement(command.x, effectiveState, context, pipeUpstream);
			if (left !== undefined) return left;
			if (command.op === BinCmdOperator.OrStmt) {
				// The right side runs only when the left side failed, possibly after part of it ran.
				const failurePath = cloneShellState(before);
				markCwdChangedIn(
					before,
					effectiveState,
					failurePath,
					"the working directory depends on which command before || failed",
				);
				return walkStatement(command.y, failurePath, context);
			}
			return walkStatement(command.y, effectiveState, context);
		}
		case "Subshell":
			return walkStatements(command.stmts, cloneShellState(effectiveState), context);
		case "Block":
			return walkStatements(command.stmts, effectiveState, context);
		case "IfClause": {
			const before = cloneShellState(effectiveState);
			let clause: typeof command | null = command;
			while (clause !== null) {
				const condition = walkStatements(clause.cond, effectiveState, context);
				if (condition !== undefined) return condition;
				const branch = cloneShellState(effectiveState);
				const result = walkStatements(clause.then, branch, context);
				if (result !== undefined) return result;
				markCwdChangedIn(effectiveState, branch, effectiveState, "a conditional branch changed the working directory");
				clause = clause.else;
			}
			markCwdChangedIn(before, effectiveState, effectiveState, "a conditional branch changed the working directory");
			return undefined;
		}
		case "WhileClause": {
			const loop = cloneShellState(effectiveState);
			const result =
				walkStatements(command.cond, loop, context) ?? walkStatements(command.do, loop, context);
			if (result !== undefined) return result;
			markCwdChangedIn(effectiveState, loop, effectiveState, "a loop changed the working directory");
			return undefined;
		}
		case "ForClause": {
			const loop = cloneShellState(effectiveState);
			if (command.loop?.type === "WordIter") {
				const items = walkSubstitutions(command.loop.items, effectiveState, context);
				if (items !== undefined) return items;
				const name = command.loop.name?.value;
				if (name !== undefined) loop.shellVariables.set(name, undefined);
			}
			const result = walkStatements(command.do, loop, context);
			if (result !== undefined) return result;
			markCwdChangedIn(effectiveState, loop, effectiveState, "a loop changed the working directory");
			return undefined;
		}
		case "CaseClause": {
			const word = walkSubstitutions(command.word, effectiveState, context);
			if (word !== undefined) return word;
			for (const item of command.items) {
				const branch = cloneShellState(effectiveState);
				const result = walkStatements(item.stmts, branch, context);
				if (result !== undefined) return result;
				markCwdChangedIn(effectiveState, branch, effectiveState, "a case branch changed the working directory");
			}
			return undefined;
		}
		case "FuncDecl":
			// Evaluated where it is declared, as if it ran there.
			return command.body === null
				? undefined
				: walkStatement(command.body, cloneShellState(effectiveState), context);
		case "TimeClause":
		case "CoprocClause":
			return command.stmt === null ? undefined : walkStatement(command.stmt, effectiveState, context, pipeUpstream);
		case "DeclClause": {
			const nested = walkSubstitutions([command.args, command.assigns, stmt.redirs], effectiveState, context);
			if (nested !== undefined) return nested;
			applyDeclaration(command, effectiveState, context.source);
			return undefined;
		}
		default:
			return walkSubstitutions(command, effectiveState, context);
	}
}

function walkStatements<T>(stmts: readonly Stmt[], state: ShellState, context: WalkContext<T>): T | undefined {
	for (const stmt of stmts) {
		const result = walkStatement(stmt, state, context);
		if (result !== undefined) return result;
	}
	return undefined;
}

/** Walks every simple command of a parsed program in execution order, updating `state` as bash would. */
export function walkShellProgram<T>(
	parsed: { readonly file: File; readonly bytes: Buffer },
	state: ShellState,
	visit: ShellVisitor<T>,
): T | undefined {
	return walkStatements(parsed.file.stmts, state, { source: { bytes: parsed.bytes }, visit });
}

/** Returns the basename of a command word. */
export function executableName(value: string): string {
	const slashIndex = value.lastIndexOf("/");
	return slashIndex === -1 ? value : value.slice(slashIndex + 1);
}

/** Quotes one argument for appending to a shell command string. */
export function quoteShellArgument(value: string): string {
	return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

const SHELL_INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);

/** The script a shell interpreter invocation runs, when the command is one. */
export type NestedShellScript =
	| { readonly kind: "source"; readonly source: string; readonly loginOrInteractive: boolean }
	| { readonly kind: "file"; readonly path: string; readonly loginOrInteractive: boolean }
	| { readonly kind: "noexec" }
	| { readonly kind: "opaque"; readonly why: string; readonly evidence: string };

/**
 * Finds the script run by `bash -c '...'`, `sh <<EOF`, `bash script.sh`, `bash < script.sh`, or `eval ...`.
 * Returns undefined when `words` is not a shell interpreter or eval.
 */
export function nestedShellScript(
	words: readonly ShellWord[],
	standardInput: ShellStandardInput,
	commandSource: string,
): NestedShellScript | undefined {
	const name = words[0]?.value === undefined ? undefined : executableName(words[0].value);
	if (name === "eval") {
		const parts = words.slice(1);
		if (parts.some((word) => word.value === undefined))
			return { kind: "opaque", why: "eval of a dynamic string", evidence: commandSource };
		return {
			kind: "source",
			source: parts.map((word) => word.value ?? "").join(" "),
			loginOrInteractive: false,
		};
	}
	if (name === undefined || !SHELL_INTERPRETERS.has(name)) return undefined;
	let runsCommandString = false;
	let readsStandardInput = false;
	let loginOrInteractive = false;
	let index = 1;
	for (; index < words.length; index += 1) {
		const value = words[index]?.value;
		if (value === undefined) break;
		if (value === "--" || value === "-") {
			index += 1;
			break;
		}
		if (value === "--login" || value === "--interactive") {
			loginOrInteractive = true;
			continue;
		}
		if (value.startsWith("--")) {
			if (["--rcfile", "--init-file"].includes(value)) index += 1;
			continue;
		}
		if (/^[-+][A-Za-z]+$/.test(value)) {
			const letters = value.slice(1);
			if (value.startsWith("-") && letters.includes("n")) return { kind: "noexec" };
			if (letters.includes("c")) runsCommandString = true;
			if (letters.includes("s")) readsStandardInput = true;
			if (/[li]/.test(letters)) loginOrInteractive = true;
			if (letters.includes("o")) index += 1;
			continue;
		}
		break;
	}
	const operand = words[index];
	if (runsCommandString) {
		if (operand === undefined) return { kind: "noexec" };
		if (operand.value === undefined)
			return { kind: "opaque", why: "shell -c with a dynamic command string", evidence: commandSource };
		return { kind: "source", source: operand.value, loginOrInteractive };
	}
	if (operand !== undefined && !readsStandardInput) {
		if (operand.value === undefined)
			return { kind: "opaque", why: "shell script path is dynamic", evidence: commandSource };
		return { kind: "file", path: operand.value, loginOrInteractive };
	}
	switch (standardInput.kind) {
		case "heredoc":
			return { kind: "source", source: standardInput.source, loginOrInteractive };
		case "file":
			return standardInput.path.value === undefined
				? { kind: "opaque", why: "shell reads a dynamic script path", evidence: commandSource }
				: { kind: "file", path: standardInput.path.value, loginOrInteractive };
		case "pipe":
			return {
				kind: "opaque",
				why: "shell reads its script from a pipe",
				evidence: standardInput.upstreamSource,
			};
		case "inherited":
			return { kind: "noexec" };
	}
}

/** Resolves a static path word against a working directory. */
export function resolveShellPath(cwd: string, value: string): string {
	return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

/** True when `path` exists. */
export function pathExists(path: string): boolean {
	return existsSync(path);
}
