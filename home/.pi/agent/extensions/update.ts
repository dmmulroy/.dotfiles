import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

type InstallMethod = "bun" | "npm" | "homebrew" | "native";
type NotifyType = "info" | "error" | "success" | "warning";

type Reporter = {
	notify: (message: string, type?: NotifyType) => void;
};

type DetectionResult = {
	method: InstallMethod;
	details: string;
	piPath?: string;
	resolvedPiPath?: string;
	brewFormula?: string;
};

type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
};

const PACKAGE_NAME = "@mariozechner/pi-coding-agent";
const BREW_FORMULA_CANDIDATES = ["pi", "pi-coding-agent"] as const;
const EXEC_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5_000;

function createReporter(ctx: Pick<ExtensionContext, "hasUI" | "ui">): Reporter {
	return {
		notify: (message, type = "info") => {
			if (ctx.hasUI) {
				ctx.ui.notify(message, type);
			} else if (type === "error") {
				console.error(message);
			} else {
				console.log(message);
			}
		},
	};
}

function formatCommand(command: string, args: string[]): string {
	return [command, ...args].join(" ");
}

async function safeExec(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	timeout = EXEC_TIMEOUT_MS,
): Promise<ExecResult> {
	try {
		const result = await pi.exec(command, args, { timeout });
		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.code,
			killed: result.killed,
		};
	} catch (error) {
		return {
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
			code: 1,
		};
	}
}

async function commandExists(pi: ExtensionAPI, command: string): Promise<boolean> {
	const result = await safeExec(pi, "which", [command], 10_000);
	return result.code === 0 && result.stdout.trim().length > 0;
}

async function getPiPathInfo(pi: ExtensionAPI): Promise<{ piPath?: string; resolvedPiPath?: string }> {
	const whichPi = await safeExec(pi, "which", ["pi"], 10_000);
	const piPath = whichPi.code === 0 ? whichPi.stdout.trim() : "";
	if (!piPath) return {};

	for (const command of ["realpath", "readlink"]) {
		if (!(await commandExists(pi, command))) continue;
		const args = command === "realpath" ? [piPath] : ["-f", piPath];
		const resolved = await safeExec(pi, command, args, 10_000);
		if (resolved.code === 0 && resolved.stdout.trim()) {
			return { piPath, resolvedPiPath: resolved.stdout.trim() };
		}
	}

	return { piPath, resolvedPiPath: piPath };
}

async function detectHomebrewFormula(
	pi: ExtensionAPI,
	paths: string[],
): Promise<{ formula?: string; details?: string }> {
	if (!(await commandExists(pi, "brew"))) return {};

	const prefixResult = await safeExec(pi, "brew", ["--prefix"], 10_000);
	const prefix = prefixResult.code === 0 ? prefixResult.stdout.trim() : "";
	const listResult = await safeExec(pi, "brew", ["list", "--formula"], 15_000);
	const installedFormulas = new Set(
		listResult.code === 0
			? listResult.stdout
					.split("\n")
					.map((line) => line.trim())
					.filter(Boolean)
			: [],
	);

	for (const formula of BREW_FORMULA_CANDIDATES) {
		if (!installedFormulas.has(formula)) continue;

		const info = await safeExec(pi, "brew", ["--prefix", formula], 10_000);
		const formulaPrefix = info.code === 0 ? info.stdout.trim() : "";
		if (formulaPrefix && paths.some((path) => path.startsWith(formulaPrefix))) {
			return {
				formula,
				details: `Installed via Homebrew formula '${formula}'`,
			};
		}
	}

	if (prefix && paths.some((path) => path.startsWith(prefix))) {
		for (const formula of BREW_FORMULA_CANDIDATES) {
			if (installedFormulas.has(formula)) {
				return {
					formula,
					details: `Installed via Homebrew formula '${formula}'`,
				};
			}
		}
	}

	return {};
}

async function detectInstallMethod(pi: ExtensionAPI): Promise<DetectionResult> {
	const { piPath, resolvedPiPath } = await getPiPathInfo(pi);
	const candidatePaths = [piPath, resolvedPiPath].filter((value): value is string => Boolean(value));

	if (candidatePaths.length > 0) {
		const brew = await detectHomebrewFormula(pi, candidatePaths);
		if (brew.formula) {
			return {
				method: "homebrew",
				details: `${brew.details}${resolvedPiPath && resolvedPiPath !== piPath ? ` at ${resolvedPiPath}` : piPath ? ` at ${piPath}` : ""}`,
				piPath,
				resolvedPiPath,
				brewFormula: brew.formula,
			};
		}

		if (candidatePaths.some((path) => path.includes(".bun") || path.includes("/bun/"))) {
			return {
				method: "bun",
				details: `Installed via bun at: ${resolvedPiPath ?? piPath}`,
				piPath,
				resolvedPiPath,
			};
		}

		if (candidatePaths.some((path) => path.includes(".npm") || path.includes("npm-global") || path.includes("node_modules"))) {
			return {
				method: "npm",
				details: `Installed via npm at: ${resolvedPiPath ?? piPath}`,
				piPath,
				resolvedPiPath,
			};
		}

		if (await commandExists(pi, "npm")) {
			const npmPrefix = await safeExec(pi, "npm", ["config", "get", "prefix"], 10_000);
			const prefix = npmPrefix.code === 0 ? npmPrefix.stdout.trim() : "";
			if (prefix && candidatePaths.some((path) => path.startsWith(prefix))) {
				return {
					method: "npm",
					details: `Installed via npm at: ${resolvedPiPath ?? piPath}`,
					piPath,
					resolvedPiPath,
				};
			}
		}

		if (await commandExists(pi, "bun")) {
			const bunBin = await safeExec(pi, "bun", ["pm", "bin", "-g"], 10_000);
			const binPath = bunBin.code === 0 ? bunBin.stdout.trim() : "";
			if (binPath && candidatePaths.some((path) => path.startsWith(binPath))) {
				return {
					method: "bun",
					details: `Installed via bun at: ${resolvedPiPath ?? piPath}`,
					piPath,
					resolvedPiPath,
				};
			}
		}
	}

	if (await commandExists(pi, "bun")) {
		const bunList = await safeExec(pi, "bun", ["pm", "ls", "-g"], 15_000);
		if (bunList.code === 0 && bunList.stdout.includes(PACKAGE_NAME)) {
			return {
				method: "bun",
				details: "Detected via bun global packages",
				piPath,
				resolvedPiPath,
			};
		}
	}

	if (await commandExists(pi, "npm")) {
		const npmList = await safeExec(pi, "npm", ["list", "-g", "--depth=0", PACKAGE_NAME], 20_000);
		if (npmList.code === 0 && npmList.stdout.includes(PACKAGE_NAME)) {
			return {
				method: "npm",
				details: "Detected via npm global packages",
				piPath,
				resolvedPiPath,
			};
		}
	}

	if (piPath || resolvedPiPath) {
		return {
			method: "native",
			details: `Native or manual install detected at: ${resolvedPiPath ?? piPath}`,
			piPath,
			resolvedPiPath,
		};
	}

	return {
		method: "native",
		details: "Could not determine installation method; assuming native/manual install",
	};
}

async function getPiVersion(pi: ExtensionAPI): Promise<string | undefined> {
	const result = await safeExec(pi, "pi", ["--version"], 10_000);
	if (result.code !== 0) return undefined;

	const output = `${result.stdout}\n${result.stderr}`.trim();
	const match = output.match(/\b(\d+\.\d+\.\d+(?:[-+][^\s]+)?)\b/);
	return match?.[1] ?? output.split("\n")[0]?.trim() ?? undefined;
}

function summarizeResult(result: ExecResult): string {
	const pieces = [result.stdout.trim(), result.stderr.trim()].filter(Boolean);
	return pieces.join("\n").trim() || `Command exited with code ${result.code}`;
}

function isTransientRegistryError(result: ExecResult): boolean {
	const output = `${result.stdout}\n${result.stderr}`;
	return /E404|404 Not Found|ETARGET|ERESOLVE|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ERR_SOCKET_TIMEOUT|fetch failed/i.test(output);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearPackageCache(pi: ExtensionAPI, method: InstallMethod, reporter: Reporter): Promise<void> {
	if (method === "npm") {
		reporter.notify("Clearing npm cache...", "info");
		await safeExec(pi, "npm", ["cache", "clean", "--force"], 30_000);
	} else if (method === "bun") {
		reporter.notify("Clearing bun cache...", "info");
		await safeExec(pi, "bun", ["pm", "cache", "rm"], 30_000);
	}
}

async function runUpdate(pi: ExtensionAPI, detection: DetectionResult, reporter: Reporter): Promise<ExecResult> {
	let command = "";
	let args: string[] = [];

	switch (detection.method) {
		case "bun":
			command = "bun";
			args = ["install", "-g", PACKAGE_NAME];
			break;
		case "npm":
			command = "npm";
			args = ["install", "-g", PACKAGE_NAME];
			break;
		case "homebrew":
			command = "brew";
			args = ["upgrade", detection.brewFormula ?? "pi"];
			break;
		case "native":
			throw new Error("Native/manual install detected. Please download the latest release manually from https://github.com/badlogic/pi-mono/releases");
	}

	reporter.notify(`Running: ${formatCommand(command, args)}`, "info");
	return safeExec(pi, command, args, EXEC_TIMEOUT_MS);
}

async function performUpdate(
	pi: ExtensionAPI,
	ctx: Pick<ExtensionContext, "hasUI" | "ui" | "shutdown">,
	options: { shutdownWhenDone?: boolean } = {},
): Promise<void> {
	const reporter = createReporter(ctx);
	reporter.notify("Detecting pi installation method...", "info");

	try {
		const beforeVersion = await getPiVersion(pi);
		if (beforeVersion) {
			reporter.notify(`Current version: ${beforeVersion}`, "info");
		}

		const detection = await detectInstallMethod(pi);
		reporter.notify(detection.details, "info");

		if (detection.method === "native") {
			reporter.notify(
				"Native/manual install detected. Download the latest release from https://github.com/badlogic/pi-mono/releases",
				"warning",
			);
			return;
		}

		let result = await runUpdate(pi, detection, reporter);

		if (result.code !== 0 && isTransientRegistryError(result)) {
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
				reporter.notify(
					`Registry error detected (attempt ${attempt}/${MAX_RETRIES}). ` +
					`This usually means a dependency hasn't fully propagated yet. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
					"warning",
				);
				await clearPackageCache(pi, detection.method, reporter);
				await sleep(RETRY_DELAY_MS);
				result = await runUpdate(pi, detection, reporter);
				if (result.code === 0) break;
				if (!isTransientRegistryError(result)) break;
			}
		}

		if (result.code !== 0) {
			throw new Error(summarizeResult(result));
		}

		const afterVersion = await getPiVersion(pi);
		if (beforeVersion && afterVersion && beforeVersion !== afterVersion) {
			reporter.notify(`Update complete: ${beforeVersion} -> ${afterVersion}`, "success");
		} else if (afterVersion) {
			reporter.notify(`Update complete. Current version: ${afterVersion}`, "success");
		} else {
			reporter.notify("Update complete.", "success");
		}

		reporter.notify("Restart pi to ensure the updated version is used everywhere.", "info");
	} catch (error) {
		reporter.notify(`Update failed: ${error instanceof Error ? error.message : String(error)}`, "error");
	} finally {
		if (options.shutdownWhenDone) {
			ctx.shutdown();
		}
	}
}

export default function updateExtension(pi: ExtensionAPI) {
	pi.registerCommand("update", {
		description: "Update pi to the latest version",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			await performUpdate(pi, ctx);
		},
	});

	pi.registerFlag("update", {
		description: "Update pi to the latest version and exit",
		type: "boolean",
		default: false,
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("update") !== true) return;
		await performUpdate(pi, ctx, { shutdownWhenDone: true });
	});
}
