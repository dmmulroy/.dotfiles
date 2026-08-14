import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runWorktreesCommand } from "./worktree-command.ts";
import { PiWorktreeCommandRunner } from "./worktree-command-runner.ts";
import { GitWorktreeService } from "./worktree-service.ts";

/** Register the interactive Git worktree manager. */
export default function piWorktreesExtension(pi: ExtensionAPI): void {
  const commands = new PiWorktreeCommandRunner(pi);
  const worktrees = new GitWorktreeService(commands, {
    createWorktreeScriptPath: join(
      homedir(),
      ".agents",
      "skills",
      "worktrees",
      "scripts",
      "new-worktree.sh",
    ),
  });

  pi.registerCommand("worktrees", {
    description: "List, create, fetch, and safely remove linked Git worktrees",
    handler: async (_args, ctx) => {
      await runWorktreesCommand(ctx, { worktrees });
    },
  });
}
