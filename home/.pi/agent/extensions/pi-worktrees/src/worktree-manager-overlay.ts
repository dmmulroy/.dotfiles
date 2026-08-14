import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import type { WorktreeInventory, WorktreeRecord } from "./worktree-domain.ts";

/** User intent returned by the interactive worktree manager. */
export type WorktreeManagerAction =
  | { readonly _tag: "close" }
  | { readonly _tag: "refresh" }
  | { readonly _tag: "fetch" }
  | { readonly _tag: "create" }
  | { readonly _tag: "remove"; readonly worktree: WorktreeRecord };

/** Show the keyboard-driven worktree manager over the current Pi transcript. */
export async function showWorktreeManagerOverlay(
  ctx: ExtensionContext,
  inventory: WorktreeInventory,
): Promise<WorktreeManagerAction> {
  return ctx.ui.custom<WorktreeManagerAction>(
    (tui, theme, _keybindings, done) => new WorktreeManagerOverlay(tui, theme, inventory, done),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "90%",
        maxHeight: "82%",
        minWidth: 72,
      },
    },
  );
}

class WorktreeManagerOverlay {
  private selectedIndex = 0;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly inventory: WorktreeInventory,
    private readonly done: (action: WorktreeManagerAction) => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.done({ _tag: "close" });
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.moveSelection(1);
      return;
    }
    if (data === "a") {
      this.done({ _tag: "create" });
      return;
    }
    if (data === "d") {
      const selected = this.getSelectedWorktree();
      if (selected !== undefined) this.done({ _tag: "remove", worktree: selected });
      return;
    }
    if (data === "f") {
      this.done({ _tag: "fetch" });
      return;
    }
    if (data === "r") {
      this.done({ _tag: "refresh" });
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(20, width - 2);
    const bodyHeight = this.getBodyHeight();
    const body = innerWidth < 60
      ? this.renderWorktreeList(innerWidth, bodyHeight).map((line) => frameLine(this.theme, line, innerWidth))
      : this.renderTwoColumnBody(innerWidth, bodyHeight);

    return [
      topBorder(this.theme, innerWidth),
      frameLine(this.theme, this.renderHeader(innerWidth), innerWidth),
      divider(this.theme, innerWidth),
      ...body,
      divider(this.theme, innerWidth),
      frameLine(this.theme, this.theme.fg("dim", "↑↓ move • a add • d remove • f fetch • r refresh • esc close"), innerWidth),
      bottomBorder(this.theme, innerWidth),
    ];
  }

  invalidate(): void {}

  private renderTwoColumnBody(innerWidth: number, bodyHeight: number): string[] {
    const listWidth = Math.floor((innerWidth - 1) * 0.58);
    const detailWidth = innerWidth - listWidth - 1;
    const separator = this.theme.fg("borderMuted", "│");
    return combineColumns(
      this.renderWorktreeList(listWidth, bodyHeight),
      this.renderSelectedDetails(detailWidth, bodyHeight),
      listWidth,
      detailWidth,
      separator,
    ).map((line) => frameLine(this.theme, line, innerWidth));
  }

  private renderHeader(width: number): string {
    const title = this.theme.fg("accent", this.theme.bold(`Worktrees — ${this.inventory.root.name}`));
    const count = this.theme.fg("muted", `${this.inventory.worktrees.length} linked`);
    const gap = Math.max(1, width - visibleWidth(title) - visibleWidth(count));
    return `${title}${" ".repeat(gap)}${count}`;
  }

  private renderWorktreeList(width: number, height: number): string[] {
    if (this.inventory.worktrees.length === 0) {
      return padLines([this.theme.fg("dim", "No linked worktrees")], height);
    }

    this.selectedIndex = clamp(this.selectedIndex, 0, this.inventory.worktrees.length - 1);
    const start = Math.max(
      0,
      Math.min(this.selectedIndex - Math.floor(height / 2), Math.max(0, this.inventory.worktrees.length - height)),
    );
    const end = Math.min(this.inventory.worktrees.length, start + height);
    const lines: string[] = [];

    for (let index = start; index < end; index += 1) {
      const worktree = this.inventory.worktrees[index];
      if (worktree === undefined) continue;
      const selected = index === this.selectedIndex;
      const cursor = selected ? "›" : " ";
      const current = worktree.isCurrent ? "●" : " ";
      const branch = worktree.branch ?? "(detached)";
      const status = formatWorktreeStatus(worktree);
      const row = `${cursor} ${current} ${worktree.localDirectory}  ${branch}  ${status}`;
      lines.push(selected ? this.theme.fg("accent", this.theme.bold(fitLine(row, width))) : fitLine(row, width));
    }

    return padLines(lines, height);
  }

  private renderSelectedDetails(width: number, height: number): string[] {
    const worktree = this.getSelectedWorktree();
    if (worktree === undefined) return padLines([this.theme.fg("dim", "No worktree selected")], height);

    const lines = [
      this.theme.fg("accent", this.theme.bold(worktree.localDirectory)),
      "",
      `${this.theme.fg("muted", "Branch:")} ${worktree.branch ?? "(detached HEAD)"}`,
      `${this.theme.fg("muted", "HEAD:")} ${worktree.head.slice(0, 12)}`,
      `${this.theme.fg("muted", "Status:")} ${formatWorktreeStatus(worktree)}`,
      `${this.theme.fg("muted", "Current:")} ${worktree.isCurrent ? "yes" : "no"}`,
    ];

    if (worktree.lockedReason !== undefined) {
      lines.push(`${this.theme.fg("warning", "Locked:")} ${worktree.lockedReason || "yes"}`);
    }
    if (worktree.prunableReason !== undefined) {
      lines.push(`${this.theme.fg("warning", "Prunable:")} ${worktree.prunableReason || "yes"}`);
    }
    lines.push("", this.theme.fg("muted", "Path:"), ...wrapPlainText(worktree.path, width));
    return padLines(lines.map((line) => truncateToWidth(line, width)), height);
  }

  private moveSelection(delta: number): void {
    if (this.inventory.worktrees.length === 0) return;
    this.selectedIndex = clamp(this.selectedIndex + delta, 0, this.inventory.worktrees.length - 1);
    this.tui.requestRender();
  }

  private getSelectedWorktree(): WorktreeRecord | undefined {
    return this.inventory.worktrees[this.selectedIndex];
  }

  private getBodyHeight(): number {
    const rows = this.tui.terminal.rows ?? 30;
    return clamp(Math.floor(rows * 0.62), 8, 30);
  }
}

function formatWorktreeStatus(worktree: WorktreeRecord): string {
  if (worktree.status._tag === "clean") return "clean";
  if (worktree.status._tag === "dirty") return `${worktree.status.changedFileCount} changed`;
  return "status unavailable";
}

function fitLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, Math.max(0, width));
  return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}

function frameLine(theme: Theme, content: string, innerWidth: number): string {
  return `${theme.fg("borderAccent", "│")}${fitLine(content, innerWidth)}${theme.fg("borderAccent", "│")}`;
}

function topBorder(theme: Theme, innerWidth: number): string {
  return theme.fg("borderAccent", `┌${"─".repeat(innerWidth)}┐`);
}

function divider(theme: Theme, innerWidth: number): string {
  return theme.fg("borderMuted", `├${"─".repeat(innerWidth)}┤`);
}

function bottomBorder(theme: Theme, innerWidth: number): string {
  return theme.fg("borderAccent", `└${"─".repeat(innerWidth)}┘`);
}

function combineColumns(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
  leftWidth: number,
  rightWidth: number,
  separator: string,
): string[] {
  const rows = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let index = 0; index < rows; index += 1) {
    lines.push(`${fitLine(left[index] ?? "", leftWidth)}${separator}${fitLine(right[index] ?? "", rightWidth)}`);
  }
  return lines;
}

function padLines(lines: ReadonlyArray<string>, height: number): string[] {
  const padded = [...lines];
  while (padded.length < height) padded.push("");
  return padded.slice(0, height);
}

function wrapPlainText(text: string, width: number): string[] {
  if (width <= 1) return [truncateToWidth(text, 1)];
  const lines: string[] = [];
  for (let offset = 0; offset < text.length; offset += width) {
    lines.push(text.slice(offset, offset + width));
  }
  return lines.length === 0 ? [""] : lines;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
