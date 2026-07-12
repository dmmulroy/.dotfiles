#!/usr/bin/env -S node --import=tsx
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { UnixSocketSchedulerClient } from "./client.ts";
import type { ThinkingLevel } from "./domain.ts";
import { LaunchdInstaller } from "./launchd.ts";
import { PiBackgroundAuthProbe } from "./preflight.ts";
import { READ_ONLY_DEFAULT_TOOLS, isReadOnlyDefaultTool, parseIntervalText } from "./extension/ui.ts";

interface ParsedArguments {
  readonly command: string;
  readonly flags: ReadonlyMap<string, string | true>;
}

function parseArguments(argv: readonly string[]): ParsedArguments | undefined {
  const command = argv[0];
  if (!command || command.startsWith("--")) return undefined;
  const flags = new Map<string, string | true>();
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) return undefined;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) { flags.set(arg.slice(2), next); index += 1; }
    else flags.set(arg.slice(2), true);
  }
  return { command, flags };
}

function stringFlag(args: ParsedArguments, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function thinkingLevel(value: string | undefined): ThinkingLevel {
  return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" ? value : "off";
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, (_key, item: unknown) => item instanceof Error ? { tag: "_tag" in item ? item._tag : "Error", message: item.message } : item, 2)}\n`);
}

function usage(): never {
  process.stderr.write("Usage: pi-scheduler <health|list|inbox|create|pause|resume|delete|run|cancel|get|setup> [--flag value]\n");
  process.exit(2);
}

async function whichPi(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/which", ["pi"], { stdio: ["ignore", "pipe", "ignore"] });
    let value = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { value += chunk; });
    child.once("close", (code) => resolve(code === 0 && value.trim().startsWith("/") ? value.trim() : undefined));
    child.once("error", () => resolve(undefined));
  });
}

/** Run the flag-based scheduler CLI against the durable daemon protocol. */
export async function runCli(argv: readonly string[]): Promise<number> {
  const args = parseArguments(argv);
  if (!args) usage();
  const stateDirectory = stringFlag(args, "state-dir") ?? join(homedir(), ".pi", "agent", "scheduler");
  const client = new UnixSocketSchedulerClient(stringFlag(args, "socket") ?? join(stateDirectory, "scheduler.sock"));
  if (args.command === "health") {
    const result = await client.health(); output(result); return result.ok ? 0 : 1;
  }
  if (args.command === "list") {
    const result = await client.listJobs({ includeDeleted: args.flags.has("all") }); output(result); return result.ok ? 0 : 1;
  }
  if (args.command === "inbox") {
    const result = await client.listRuns({ unreadOnly: true }); output(result); return result.ok ? 0 : 1;
  }
  if (args.command === "create") {
    const name = stringFlag(args, "name");
    const prompt = stringFlag(args, "prompt");
    const cwd = stringFlag(args, "cwd");
    const provider = stringFlag(args, "provider");
    const modelId = stringFlag(args, "model");
    const interval = stringFlag(args, "interval");
    const cron = stringFlag(args, "cron");
    if (!name || !prompt || !cwd || !provider || !modelId || (!interval && !cron) || (interval && cron)) usage();
    const tools = (stringFlag(args, "tools") ?? READ_ONLY_DEFAULT_TOOLS.join(",")).split(",").map((tool) => tool.trim()).filter(Boolean);
    const elevated = tools.filter((tool) => !isReadOnlyDefaultTool(tool));
    if (elevated.length > 0 && !args.flags.has("approve-elevated-tools")) {
      process.stderr.write(`Elevated tools require --approve-elevated-tools: ${elevated.join(", ")}\n`);
      return 2;
    }
    const everyMs = interval ? parseIntervalText(interval) : undefined;
    if (interval && !everyMs) usage();
    const result = await client.createJob({
      name,
      prompt,
      cwd,
      schedule: interval ? { kind: "interval", everyMs, anchorAt: Date.now() } : { kind: "cron", expression: cron, timezone: stringFlag(args, "timezone") ?? Intl.DateTimeFormat().resolvedOptions().timeZone },
      execution: {
        timeoutMs: Number(stringFlag(args, "timeout-minutes") ?? "15") * 60_000,
        tools,
        model: { provider, modelId, thinkingLevel: stringFlag(args, "thinking") ?? "off" },
        overlap: stringFlag(args, "overlap") ?? "skip",
        misfire: stringFlag(args, "misfire") ?? "fireOnce",
      },
      activate: !args.flags.has("draft"),
    });
    output(result); return result.ok ? 0 : 1;
  }
  if (args.command === "setup") {
    const provider = stringFlag(args, "provider");
    const modelId = stringFlag(args, "model");
    const piPath = stringFlag(args, "pi") ?? await whichPi();
    if (!provider || !modelId || !piPath) usage();
    const extensionDirectory = dirname(fileURLToPath(import.meta.url));
    const installed = await new LaunchdInstaller().install({
      plistPath: join(homedir(), "Library", "LaunchAgents", "dev.dmmulroy.pi-scheduler.plist"),
      configuration: {
        nodePath: process.execPath, piPath,
        daemonPath: join(extensionDirectory, "daemon.ts"), supervisorPath: join(extensionDirectory, "worker-supervisor.ts"),
        stateDirectory, logPath: join(stateDirectory, "daemon.log"),
      },
      smokeTest: async () => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const health = await client.health();
          if (health.ok) return new PiBackgroundAuthProbe(piPath).verify({ provider, modelId, thinkingLevel: thinkingLevel(stringFlag(args, "thinking")) });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return { ok: false, error: new (await import("./errors.ts")).BackgroundAuthenticationError() };
      },
    });
    output(installed); return installed.ok ? 0 : 1;
  }
  const id = stringFlag(args, "id");
  if (!id) usage();
  if (args.command === "get") { const result = await client.getRun(id); output(result); return result.ok ? 0 : 1; }
  if (args.command === "cancel") { const result = await client.cancelRun(id); output(result); return result.ok ? 0 : 1; }
  const action = args.command === "pause" ? "pause" : args.command === "resume" ? "resume" : args.command === "delete" ? "delete" : args.command === "run" ? "runNow" : undefined;
  if (!action) usage();
  const result = await client.jobAction(action, id); output(result); return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
}
