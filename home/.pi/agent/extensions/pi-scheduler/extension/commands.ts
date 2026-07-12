import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { SchedulerClient } from "../client.ts";
import { LaunchdInstaller } from "../launchd.ts";
import { PiBackgroundAuthProbe } from "../preflight.ts";
import { runJobWizard } from "./ui.ts";

/** Dependencies used by the `/schedule` command adapter. */
export interface SchedulerCommandDependencies {
  readonly client: SchedulerClient;
  readonly extensionDirectory: string;
  readonly installer?: LaunchdInstaller;
}

function errorMessage(error: Error): string {
  return `${"_tag" in error && typeof error._tag === "string" ? error._tag : "SchedulerError"}: ${error.message}`;
}

async function waitForHealth(client: SchedulerClient): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await client.health();
    if (health.ok && health.value.status === "ok") return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function setup(pi: ExtensionAPI, ctx: ExtensionCommandContext, dependencies: SchedulerCommandDependencies): Promise<void> {
  if (!ctx.model) { ctx.ui.notify("Select a model before scheduler setup", "error"); return; }
  const selectedModel = ctx.model;
  const found = await pi.exec("/usr/bin/which", ["pi"]);
  const piPath = found.code === 0 ? found.stdout.trim() : "";
  if (!piPath.startsWith("/")) { ctx.ui.notify("Could not resolve the Pi executable", "error"); return; }
  const major = Number(process.versions.node.split(".")[0]);
  const minor = Number(process.versions.node.split(".")[1]);
  if (major < 22 || (major === 22 && minor < 19)) { ctx.ui.notify("Pi scheduler requires Node 22.19 or newer", "error"); return; }
  try { await import("node:sqlite"); }
  catch { ctx.ui.notify("This Node runtime does not provide node:sqlite", "error"); return; }
  const stateDirectory = join(homedir(), ".pi", "agent", "scheduler");
  const plistPath = join(homedir(), "Library", "LaunchAgents", "dev.dmmulroy.pi-scheduler.plist");
  const installer = dependencies.installer ?? new LaunchdInstaller();
  const installed = await installer.install({
    plistPath,
    configuration: {
      nodePath: process.execPath,
      piPath,
      daemonPath: join(dependencies.extensionDirectory, "daemon.ts"),
      supervisorPath: join(dependencies.extensionDirectory, "worker-supervisor.ts"),
      stateDirectory,
      logPath: join(stateDirectory, "daemon.log"),
    },
    smokeTest: async () => {
      if (!(await waitForHealth(dependencies.client))) return { ok: false, error: new (await import("../errors.ts")).BackgroundAuthenticationError() };
      return new PiBackgroundAuthProbe(piPath).verify({ provider: selectedModel.provider, modelId: selectedModel.id, thinkingLevel: pi.getThinkingLevel() });
    },
  });
  ctx.ui.notify(installed.ok ? "Pi scheduler installed and authenticated" : errorMessage(installed.error), installed.ok ? "info" : "error");
}

/** Register context-free human scheduler commands. */
export function registerScheduleCommands(pi: ExtensionAPI, dependencies: SchedulerCommandDependencies): void {
  pi.registerCommand("schedule", {
    description: "Set up and manage durable scheduled agent tasks",
    handler: async (raw, ctx) => {
      const [subcommand = "list", id, extra] = raw.trim().split(/\s+/u);
      if (extra) { ctx.ui.notify("Schedule management accepts at most one ID", "warning"); return; }
      if (subcommand === "setup") { await setup(pi, ctx, dependencies); return; }
      if (subcommand === "health") {
        const result = await dependencies.client.health();
        ctx.ui.notify(result.ok ? `Scheduler ${result.value.status} (pid ${result.value.pid})` : errorMessage(result.error), result.ok ? "info" : "error");
        return;
      }
      if (subcommand === "add") {
        const proposed = await runJobWizard(pi, ctx);
        if (!proposed) return;
        const result = await dependencies.client.createJob(proposed);
        ctx.ui.notify(result.ok ? `Scheduled ${result.value.name} (${result.value.id})` : errorMessage(result.error), result.ok ? "info" : "error");
        return;
      }
      if (subcommand === "list") {
        const result = await dependencies.client.listJobs();
        if (!result.ok) { ctx.ui.notify(errorMessage(result.error), "error"); return; }
        const lines = result.value.map((job) => `${job.id}  ${job.status.padEnd(7)}  ${job.name}`);
        ctx.ui.notify(lines.join("\n") || "No scheduled jobs", "info");
        return;
      }
      if (subcommand === "inbox") {
        const result = await dependencies.client.listRuns({ unreadOnly: true });
        if (!result.ok) { ctx.ui.notify(errorMessage(result.error), "error"); return; }
        const terminal = result.value.filter((run) => run.status !== "queued" && run.status !== "running");
        const selected = await ctx.ui.select("Scheduled task inbox", terminal.map((run) => `${run.id}  ${run.status}`));
        if (!selected) return;
        const run = terminal.find((candidate) => selected.startsWith(candidate.id));
        if (!run) return;
        const text = run.status === "succeeded" ? run.result.assistantText : `${run.failure.tag}: ${run.failure.message}`;
        await ctx.ui.editor(`Run ${run.id}`, text);
        await dependencies.client.markRunsRead([run.id]);
        return;
      }
      if (!id) { ctx.ui.notify(`Usage: /schedule ${subcommand} <id>`, "warning"); return; }
      if (subcommand === "edit") {
        const listed = await dependencies.client.listJobs({ includeDeleted: true });
        const job = listed.ok ? listed.value.find((candidate) => candidate.id === id) : undefined;
        if (!job) { ctx.ui.notify(listed.ok ? "Scheduled job was not found" : errorMessage(listed.error), "error"); return; }
        const proposed = await runJobWizard(pi, ctx, job);
        if (!proposed) return;
        const result = await dependencies.client.updateJob(id, proposed);
        ctx.ui.notify(result.ok ? `Updated ${result.value.name}` : errorMessage(result.error), result.ok ? "info" : "error");
        return;
      }
      if (subcommand === "inspect") {
        if (id.startsWith("run_")) {
          const result = await dependencies.client.getRun(id);
          ctx.ui.notify(result.ok ? JSON.stringify(result.value, null, 2) : errorMessage(result.error), result.ok ? "info" : "error");
        } else {
          const result = await dependencies.client.listJobs({ includeDeleted: true });
          const job = result.ok ? result.value.find((candidate) => candidate.id === id) : undefined;
          ctx.ui.notify(job ? JSON.stringify(job, null, 2) : result.ok ? "Scheduled job was not found" : errorMessage(result.error), job ? "info" : "error");
        }
        return;
      }
      if (subcommand === "delete") {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Delete scheduled job", id))) return;
      }
      if (subcommand === "cancel") {
        const result = await dependencies.client.cancelRun(id);
        ctx.ui.notify(result.ok ? `Cancelled ${id}` : errorMessage(result.error), result.ok ? "info" : "error");
        return;
      }
      const action = subcommand === "pause" ? "pause" : subcommand === "resume" ? "resume" : subcommand === "run" ? "runNow" : subcommand === "delete" ? "delete" : undefined;
      if (!action) { ctx.ui.notify("Unknown /schedule subcommand", "warning"); return; }
      const result = await dependencies.client.jobAction(action, id);
      ctx.ui.notify(result.ok ? `${subcommand}: ${id}` : errorMessage(result.error), result.ok ? "info" : "error");
    },
  });
}
