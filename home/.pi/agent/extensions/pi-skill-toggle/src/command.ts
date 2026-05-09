import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SkillInventory } from "./inventory/loader.ts";
import type { SkillTogglePlanner } from "./apply/planner.ts";
import type { SkillChangeWriter } from "./apply/writer.ts";
import { showSkillToggleUi } from "./ui/overlay.ts";
import type { ApplyResult } from "./types.ts";

export interface ToggleSkillsCommandDeps {
  inventory: SkillInventory;
  planner: SkillTogglePlanner;
  writer: SkillChangeWriter;
}

export async function runToggleSkillsCommand(ctx: ExtensionCommandContext, deps: ToggleSkillsCommandDeps): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("/toggle-skills requires interactive mode", "error");
    return;
  }

  let skills;
  try {
    skills = await deps.inventory.load(ctx.cwd);
  } catch (error) {
    ctx.ui.notify(`Pi Skill Toggle failed to scan skills: ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }

  if (skills.length === 0) {
    ctx.ui.notify("Pi Skill Toggle: no skills found in user or project skill directories", "info");
    return;
  }

  const result = await showSkillToggleUi(ctx, skills);
  if (result.action !== "apply") return;

  let changes;
  try {
    changes = await deps.planner.plan(skills, result.drafts);
  } catch (error) {
    ctx.ui.notify(`Pi Skill Toggle failed to plan changes: ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }

  if (changes.length === 0) {
    ctx.ui.notify("Pi Skill Toggle: no changes to apply", "info");
    return;
  }

  const applied = await deps.writer.apply(changes);
  ctx.ui.notify(formatApplyResult(applied), applied.errors.length > 0 ? "warning" : "info");

  if (applied.applied.length > 0) {
    await ctx.reload();
  }
}

function formatApplyResult(result: ApplyResult): string {
  const lines = [`Pi Skill Toggle applied ${result.applied.length} change${result.applied.length === 1 ? "" : "s"}.`];
  for (const change of result.applied.slice(0, 6)) {
    lines.push(`- ${change.skill.name}: ${change.from} → ${change.to}`);
  }
  if (result.applied.length > 6) {
    lines.push(`- … ${result.applied.length - 6} more`);
  }
  if (result.errors.length > 0) {
    lines.push(`Errors/skipped: ${result.errors.length}`);
    for (const error of result.errors.slice(0, 4)) {
      lines.push(`- ${error.message}`);
    }
  }
  if (result.applied.length > 0) {
    lines.push("Reloaded skills, prompts, extensions, and themes.");
  }
  return lines.join("\n");
}
