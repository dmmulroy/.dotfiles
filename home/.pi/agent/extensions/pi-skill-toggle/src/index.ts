import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AtomicSkillChangeWriter } from "./apply/writer.ts";
import { DefaultSkillTogglePlanner } from "./apply/planner.ts";
import { DefaultSkillLocator } from "./discovery/skill-locator.ts";
import { MinimalFrontmatterPatcher } from "./frontmatter/patcher.ts";
import { SimpleFrontmatterCodec } from "./frontmatter/parser.ts";
import { DefaultSkillInventory } from "./inventory/loader.ts";
import { NodeFileSystem } from "./ports/fs.ts";
import { runToggleSkillsCommand } from "./command.ts";

export default function piSkillToggle(pi: ExtensionAPI) {
  const fs = new NodeFileSystem();
  const codec = new SimpleFrontmatterCodec();
  const patcher = new MinimalFrontmatterPatcher();
  const locator = new DefaultSkillLocator(fs);
  const inventory = new DefaultSkillInventory(locator, fs, codec);
  const planner = new DefaultSkillTogglePlanner(fs, codec, patcher);
  const writer = new AtomicSkillChangeWriter(fs);

  pi.registerCommand("toggle-skills", {
    description: "Toggle whether skills are agent-invocable or manual-only",
    handler: async (_args, ctx) => {
      await runToggleSkillsCommand(ctx, { inventory, planner, writer });
    },
  });
}
