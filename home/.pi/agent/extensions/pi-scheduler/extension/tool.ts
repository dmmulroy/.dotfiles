import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import type { SchedulerClient } from "../client.ts";
import { READ_ONLY_DEFAULT_TOOLS, isReadOnlyDefaultTool, parseIntervalText } from "./ui.ts";

const ScheduledTaskSchema = Type.Object({
  action: StringEnum(["create", "list", "pause", "resume", "delete", "run_now", "get_run"] as const),
  id: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String()),
  scheduleKind: Type.Optional(StringEnum(["interval", "cron"] as const)),
  interval: Type.Optional(Type.String()),
  cron: Type.Optional(Type.String()),
  timezone: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
  timeoutMinutes: Type.Optional(Type.Number()),
  tools: Type.Optional(Type.Array(Type.String())),
});

/** Flat provider-compatible scheduler tool input. */
export type ScheduledTaskToolInput = Static<typeof ScheduledTaskSchema>;

function text(value: string, details: unknown = {}): { content: Array<{ type: "text"; text: string }>; details: unknown } {
  return { content: [{ type: "text", text: value }], details };
}

function mutation(action: ScheduledTaskToolInput["action"]): boolean {
  return action !== "list" && action !== "get_run";
}

/** Register the optional model-callable scheduler tool. */
export function registerScheduledTaskTool(pi: ExtensionAPI, client: SchedulerClient): void {
  pi.registerTool({
    name: "scheduled_task",
    label: "Scheduled Task",
    description: "Create or manage durable recurring Pi tasks. Mutations always require interactive user approval.",
    parameters: ScheduledTaskSchema,
    async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
      if (mutation(input.action) && !ctx.hasUI) return text("ApprovalRequiredError: Interactive approval is required");
      if (input.action === "list") {
        const result = await client.listJobs();
        return result.ok
          ? text(result.value.map((job) => `${job.id} ${job.status} ${job.name}`).join("\n") || "No scheduled jobs", { jobs: result.value })
          : text(`${result.error._tag}: ${result.error.message}`);
      }
      if (input.action === "get_run") {
        if (!input.id) return text("InvalidInputError: id is required");
        const result = await client.getRun(input.id);
        if (!result.ok) return text(`${result.error._tag}: ${result.error.message}`);
        return result.value.status === "succeeded"
          ? text(result.value.result.assistantText, { runId: result.value.id, status: result.value.status })
          : text(`${result.value.status}: ${"failure" in result.value ? result.value.failure.message : "Run is not complete"}`, { runId: result.value.id, status: result.value.status });
      }
      if (input.action === "create") {
        if (!ctx.model || !input.name || !input.prompt || !input.scheduleKind) return text("InvalidInputError: name, prompt, and scheduleKind are required");
        const tools = input.tools ?? [...READ_ONLY_DEFAULT_TOOLS];
        const elevated = tools.filter((tool) => !isReadOnlyDefaultTool(tool));
        const intervalMs = input.interval ? parseIntervalText(input.interval) : undefined;
        if (input.scheduleKind === "interval" && !intervalMs) return text("InvalidInputError: a positive interval such as 15m is required");
        if (input.scheduleKind === "cron" && !input.cron) return text("InvalidInputError: cron is required");
        const schedule = input.scheduleKind === "interval"
          ? { kind: "interval", everyMs: intervalMs, anchorAt: Date.now() }
          : { kind: "cron", expression: input.cron, timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
        const proposal = {
          name: input.name,
          prompt: input.prompt,
          schedule,
          cwd: input.cwd ?? ctx.cwd,
          execution: {
            timeoutMs: Math.round((input.timeoutMinutes ?? 15) * 60_000),
            tools,
            model: { provider: ctx.model.provider, modelId: ctx.model.id, thinkingLevel: pi.getThinkingLevel() },
            overlap: "skip",
            misfire: "fireOnce",
          },
          activate: true,
        };
        const warning = elevated.length > 0 ? `\nElevated tools: ${elevated.join(", ")}` : "";
        const approved = await ctx.ui.confirm("Activate scheduled task", `${input.name}\nTools: ${tools.join(", ")}${warning}`);
        if (!approved) return text("The user rejected the scheduled task; no mutation was made");
        const result = await client.createJob(proposal);
        return result.ok ? text(`Created ${result.value.id}`, { jobId: result.value.id }) : text(`${result.error._tag}: ${result.error.message}`);
      }
      if (!input.id) return text("InvalidInputError: id is required");
      const approved = await ctx.ui.confirm(`${input.action} scheduled task`, input.id);
      if (!approved) return text("The user rejected the scheduler mutation; no mutation was made");
      const action = input.action === "run_now" ? "runNow" : input.action;
      const result = await client.jobAction(action, input.id);
      return result.ok ? text(`${input.action}: ${input.id}`) : text(`${result.error._tag}: ${result.error.message}`);
    },
  });
}
