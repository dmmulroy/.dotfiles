import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { Job } from "../domain.ts";

/** Built-in tools allowed without an elevated-access confirmation. */
export const READ_ONLY_DEFAULT_TOOLS = ["read", "grep", "find", "ls"] as const;

/** Return whether a tool is in the conservative default allowlist. */
export function isReadOnlyDefaultTool(tool: string): boolean {
  return READ_ONLY_DEFAULT_TOOLS.some((candidate) => candidate === tool);
}

/** Parse a concise positive interval such as `15m`, `2h`, or `1d`. */
export function parseIntervalText(input: string): number | undefined {
  const match = input.trim().match(/^(\d+)(ms|s|m|h|d)$/u);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "ms" ? 1 : unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  const value = amount * multiplier;
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Collect a complete scheduler job through standard Pi dialogs. */
export async function runJobWizard(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  existing?: Job,
): Promise<unknown | undefined> {
  if (!ctx.hasUI || !ctx.model) return undefined;
  const name = await ctx.ui.input("Scheduled job name", existing?.name ?? "");
  if (!name?.trim()) return undefined;
  const kind = await ctx.ui.select("Schedule type", ["interval", "cron"]);
  if (!kind) return undefined;
  let schedule: { readonly kind: "interval"; readonly everyMs: number; readonly anchorAt: number } | { readonly kind: "cron"; readonly expression: string; readonly timezone: string };
  if (kind === "interval") {
    const intervalText = await ctx.ui.input("Interval", existing?.schedule.kind === "interval" ? `${existing.schedule.every}ms` : "1h");
    if (!intervalText) return undefined;
    const everyMs = parseIntervalText(intervalText);
    if (!everyMs) { ctx.ui.notify("Invalid interval (examples: 15m, 2h, 1d)", "error"); return undefined; }
    schedule = { kind: "interval", everyMs, anchorAt: Date.now() };
  } else {
    const expression = await ctx.ui.input("Five-field cron", existing?.schedule.kind === "cron" ? existing.schedule.expression : "0 9 * * 1-5");
    if (!expression) return undefined;
    const defaultTimezone = existing?.schedule.kind === "cron" ? existing.schedule.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezone = await ctx.ui.input("IANA timezone", defaultTimezone);
    if (!timezone) return undefined;
    schedule = { kind: "cron", expression, timezone };
  }
  const prompt = await ctx.ui.editor("Scheduled prompt", existing?.prompt ?? "");
  if (!prompt?.trim()) return undefined;
  const cwd = await ctx.ui.input("Working directory", existing?.cwd ?? ctx.cwd);
  if (!cwd) return undefined;
  const timeout = await ctx.ui.input("Timeout in minutes", String((existing?.execution.timeout ?? 900_000) / 60_000));
  const timeoutMinutes = Number(timeout);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) { ctx.ui.notify("Invalid timeout", "error"); return undefined; }
  const toolsText = await ctx.ui.input("Exact tool allowlist (comma-separated)", (existing?.execution.tools ?? READ_ONLY_DEFAULT_TOOLS).join(","));
  if (toolsText === undefined) return undefined;
  const tools = [...new Set(toolsText.split(",").map((tool) => tool.trim()).filter(Boolean))];
  const elevated = tools.filter((tool) => !isReadOnlyDefaultTool(tool));
  if (elevated.length > 0) {
    const approved = await ctx.ui.confirm("Elevated scheduled access", `This job can use: ${tools.join(", ")}\n\nElevated tools: ${elevated.join(", ")}`);
    if (!approved) return undefined;
  }
  const overlap = await ctx.ui.select("When an occurrence overlaps", ["skip", "queueOne"]);
  const misfire = await ctx.ui.select("After missed occurrences", ["fireOnce", "skip"]);
  if (!overlap || !misfire) return undefined;
  let provider = ctx.model.provider;
  let modelId = ctx.model.id;
  let defaultThinking = pi.getThinkingLevel();
  if (existing) {
    const binding = await ctx.ui.select("Pinned model", [
      `keep ${existing.execution.model.provider}/${existing.execution.model.modelId}`,
      `use current ${ctx.model.provider}/${ctx.model.id}`,
    ]);
    if (!binding) return undefined;
    if (binding.startsWith("keep ")) {
      provider = existing.execution.model.provider;
      modelId = existing.execution.model.modelId;
      defaultThinking = existing.execution.model.thinkingLevel;
    }
  }
  const selectedThinking = await ctx.ui.select("Thinking level", ["off", "minimal", "low", "medium", "high", "xhigh"]);
  if (!selectedThinking) return undefined;
  const thinkingLevel = selectedThinking === "off" || selectedThinking === "minimal" || selectedThinking === "low" || selectedThinking === "medium" || selectedThinking === "high" || selectedThinking === "xhigh" ? selectedThinking : defaultThinking;
  const model = { provider, modelId, thinkingLevel };
  const proposed = {
    name: name.trim(), schedule, prompt, cwd,
    execution: { timeoutMs: Math.round(timeoutMinutes * 60_000), tools, model, overlap, misfire },
    activate: true,
  };
  const approved = await ctx.ui.confirm(
    existing ? "Approve scheduled job changes" : "Activate scheduled job",
    `${name.trim()}\n${schedule.kind === "cron" ? JSON.stringify(schedule) : `every ${String(schedule.everyMs)}ms`}\n${cwd}\nmodel: ${model.provider}/${model.modelId}\ntools: ${tools.join(", ") || "none"}`,
  );
  return approved ? proposed : undefined;
}
