import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { IWorktreeService } from "./worktree-service.ts";
import { showWorktreeManagerOverlay } from "./worktree-manager-overlay.ts";
import type {
  BranchCleanupOutcome,
  CreateWorktreeInput,
  RemoveWorktreeOutcome,
  WorktreeRecord,
} from "./worktree-domain.ts";

/** Dependencies required by the interactive `/worktrees` command. */
export type WorktreeCommandDependencies = {
  readonly worktrees: IWorktreeService;
};

/** Run the interactive worktree manager until the user closes it. */
export async function runWorktreesCommand(
  ctx: ExtensionCommandContext,
  dependencies: WorktreeCommandDependencies,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/worktrees requires Pi's interactive TUI mode", "error");
    return;
  }

  while (true) {
    const inventoryResult = await dependencies.worktrees.listWorktrees(ctx.cwd);
    if (inventoryResult._tag === "err") {
      ctx.ui.notify(inventoryResult.error.message, "error");
      return;
    }

    const action = await showWorktreeManagerOverlay(ctx, inventoryResult.value);
    switch (action._tag) {
      case "close":
        return;
      case "refresh":
        continue;
      case "fetch": {
        ctx.ui.setStatus("worktrees", ctx.ui.theme.fg("accent", "worktrees:fetching"));
        const fetchResult = await dependencies.worktrees.fetchWorktrees(ctx.cwd);
        ctx.ui.setStatus("worktrees", undefined);
        if (fetchResult._tag === "err") ctx.ui.notify(fetchResult.error.message, "error");
        else ctx.ui.notify(`Fetched origin for ${fetchResult.value.root.name}`, "info");
        continue;
      }
      case "create":
        await runCreateWorktreeDialog(ctx, dependencies.worktrees);
        continue;
      case "remove":
        await runRemoveWorktreeDialog(ctx, dependencies.worktrees, action.worktree);
        continue;
      default:
        return casesHandled(action);
    }
  }
}

async function runCreateWorktreeDialog(ctx: ExtensionCommandContext, worktrees: IWorktreeService): Promise<void> {
  const branchInput = await ctx.ui.input("Create worktree — branch", "dillon/topic");
  const branch = branchInput?.trim();
  if (!branch) return;

  const suggestedDirectory = suggestLocalDirectory(branch);
  const directoryInput = await ctx.ui.input("Local directory", suggestedDirectory);
  if (directoryInput === undefined) return;
  const localDirectory = directoryInput.trim() || suggestedDirectory;

  const baseInput = await ctx.ui.input("Base revision", "blank = remote default branch");
  if (baseInput === undefined) return;
  const base = baseInput.trim();
  const input: CreateWorktreeInput = {
    branch,
    localDirectory,
    ...(base.length === 0 ? {} : { base }),
  };

  const confirmed = await ctx.ui.confirm(
    "Create linked worktree?",
    `${localDirectory} → ${branch}${base.length === 0 ? "" : ` from ${base}`}`,
  );
  if (!confirmed) return;

  ctx.ui.setStatus("worktrees", ctx.ui.theme.fg("accent", "worktrees:creating"));
  const result = await worktrees.createWorktree(ctx.cwd, input);
  ctx.ui.setStatus("worktrees", undefined);
  if (result._tag === "err") {
    ctx.ui.notify(result.error.message, "error");
    return;
  }

  ctx.ui.notify(
    `Created ${result.value.createdWorktree.path}\nCurrent Pi session remains in ${ctx.cwd}`,
    "info",
  );
}

async function runRemoveWorktreeDialog(
  ctx: ExtensionCommandContext,
  worktrees: IWorktreeService,
  target: WorktreeRecord,
): Promise<void> {
  if (target.isCurrent) {
    ctx.ui.notify(`Current worktree removal blocked for ${target.path}`, "warning");
    return;
  }
  if (target.status._tag === "dirty") {
    ctx.ui.notify(
      `Worktree has ${target.status.changedFileCount} uncommitted change(s) at ${target.path}; commit or stash them first.`,
      "warning",
    );
    return;
  }
  if (target.lockedReason !== undefined) {
    ctx.ui.notify(`Worktree is locked: ${target.lockedReason || target.path}`, "warning");
    return;
  }

  const choices = target.branch === undefined
    ? ["Remove worktree", "Cancel"]
    : ["Remove worktree only", "Remove worktree and merged local branch", "Cancel"];
  const choice = await ctx.ui.select(`Remove ${target.localDirectory}?`, choices);
  if (choice === undefined || choice === "Cancel") return;

  const branchCleanup = choice === "Remove worktree and merged local branch" ? "delete-merged" : "keep";
  const confirmed = await ctx.ui.confirm(
    "Confirm worktree removal",
    `${target.path}${branchCleanup === "delete-merged" && target.branch !== undefined ? `\nDelete merged branch ${target.branch}` : ""}`,
  );
  if (!confirmed) return;

  ctx.ui.setStatus("worktrees", ctx.ui.theme.fg("accent", "worktrees:removing"));
  const result = await worktrees.removeWorktree(ctx.cwd, {
    localDirectory: target.localDirectory,
    branchCleanup,
  });
  ctx.ui.setStatus("worktrees", undefined);
  if (result._tag === "err") {
    ctx.ui.notify(result.error.message, "error");
    return;
  }

  const notification = formatRemoveWorktreeOutcome(result.value);
  ctx.ui.notify(notification.message, notification.level);
}

function suggestLocalDirectory(branch: string): string {
  const finalSegment = branch.split("/").filter(Boolean).at(-1) ?? "topic";
  const suggestion = finalSegment.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return suggestion.length > 0 && suggestion !== "." && suggestion !== ".." ? suggestion : "topic";
}

function formatRemoveWorktreeOutcome(outcome: RemoveWorktreeOutcome): {
  readonly message: string;
  readonly level: "info" | "warning";
} {
  const branchLine = formatBranchCleanup(outcome.branchCleanup);
  return {
    message: `Removed ${outcome.removedPath}${branchLine.message}`,
    level: branchLine.level,
  };
}

function formatBranchCleanup(outcome: BranchCleanupOutcome): {
  readonly message: string;
  readonly level: "info" | "warning";
} {
  switch (outcome._tag) {
    case "kept":
      return { message: "", level: "info" };
    case "deleted":
      return { message: `\nDeleted merged branch ${outcome.branch}`, level: "info" };
    case "retained":
      return { message: `\nBranch ${outcome.branch} was retained: ${outcome.reason}`, level: "warning" };
    default:
      return casesHandled(outcome);
  }
}

function casesHandled(unexpectedCase: never): never {
  throw new Error(`Unhandled worktree state: ${String(unexpectedCase)}`);
}
