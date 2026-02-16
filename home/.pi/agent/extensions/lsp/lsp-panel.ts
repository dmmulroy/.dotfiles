import type { Component, TUI } from "@mariozechner/pi-tui";
import { Key, matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import type { LspPanelRow, LspPanelSnapshot } from "./types.js";
import { ansiBold, ansiColor, ansiDim } from "../../prelude/ui/ansi.js";
import { borderLine, contentLine, emptyLine } from "../../prelude/ui/box.js";
import { padRightVisible, truncateAnsiToWidth } from "../../prelude/ui/layout.js";

interface LspPanelCallbacks {
  onClose: () => void;
  onRefresh: () => Promise<LspPanelSnapshot>;
}

function rowState(row: LspPanelRow): "disabled" | "broken" | "spawning" | "connected" | "idle" {
  if (row.disabled) return "disabled";
  if (row.broken) return "broken";
  if (row.spawningRoots.length > 0) return "spawning";
  if (row.connectedRoots.length > 0) return "connected";
  return "idle";
}

function stateColor(state: ReturnType<typeof rowState>): number {
  switch (state) {
    case "broken":
      return 31;
    case "spawning":
      return 33;
    case "connected":
      return 32;
    case "disabled":
      return 90;
    case "idle":
    default:
      return 36;
  }
}

function colorStateBadge(state: ReturnType<typeof rowState>): string {
  const label = state.toUpperCase();
  return ansiColor(`[${label}]`, stateColor(state), { fullReset: true });
}

export class LspPanelComponent implements Component {
  private tui: TUI;
  private callbacks: LspPanelCallbacks;
  private snapshot: LspPanelSnapshot;
  private selectedIndex = 0;
  private expanded = false;
  private filterMode = false;
  private filterQuery = "";
  private showHelp = false;
  private refreshing = false;
  private error?: string;

  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(tui: TUI, snapshot: LspPanelSnapshot, callbacks: LspPanelCallbacks) {
    this.tui = tui;
    this.snapshot = snapshot;
    this.callbacks = callbacks;
  }

  private invalidateAndRender(): void {
    this.invalidate();
    this.tui.requestRender();
  }

  private getFilteredRows(): LspPanelRow[] {
    const query = this.filterQuery.trim().toLowerCase();
    if (!query) {
      return this.snapshot.rows;
    }

    return this.snapshot.rows.filter((row) => {
      const haystack = [
        row.serverId,
        row.source,
        ...row.extensions,
        ...row.connectedRoots,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  private clampSelection(rows: LspPanelRow[]): void {
    if (rows.length === 0) {
      this.selectedIndex = 0;
      return;
    }

    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, rows.length - 1));
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) {
      return;
    }

    this.refreshing = true;
    this.error = undefined;
    this.invalidateAndRender();

    try {
      this.snapshot = await this.callbacks.onRefresh();
      this.clampSelection(this.getFilteredRows());
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.refreshing = false;
      this.invalidateAndRender();
    }
  }

  updateSnapshot(snapshot: LspPanelSnapshot): void {
    this.snapshot = snapshot;
    this.clampSelection(this.getFilteredRows());
    this.invalidate();
  }

  handleInput(data: string): void {
    if (this.filterMode) {
      if (matchesKey(data, Key.escape)) {
        this.filterMode = false;
        this.invalidateAndRender();
        return;
      }

      if (matchesKey(data, Key.enter)) {
        this.filterMode = false;
        this.invalidateAndRender();
        return;
      }

      if (matchesKey(data, Key.backspace)) {
        this.filterQuery = this.filterQuery.slice(0, -1);
        this.clampSelection(this.getFilteredRows());
        this.invalidateAndRender();
        return;
      }

      if (data.length === 1) {
        this.filterQuery += data;
        this.clampSelection(this.getFilteredRows());
        this.invalidateAndRender();
        return;
      }

      return;
    }

    const rows = this.getFilteredRows();

    if (matchesKey(data, Key.escape)) {
      this.callbacks.onClose();
      return;
    }

    if (data === "q") {
      this.callbacks.onClose();
      return;
    }

    if (matchesKey(data, Key.up) || data === "k") {
      if (rows.length > 0) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.invalidateAndRender();
      }
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      if (rows.length > 0) {
        this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
        this.invalidateAndRender();
      }
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.expanded = !this.expanded;
      this.invalidateAndRender();
      return;
    }

    if (data === "/") {
      this.filterMode = true;
      this.invalidateAndRender();
      return;
    }

    if (data === "?" ) {
      this.showHelp = !this.showHelp;
      this.invalidateAndRender();
      return;
    }

    if (data === "g") {
      this.selectedIndex = 0;
      this.invalidateAndRender();
      return;
    }

    if (data === "G") {
      this.selectedIndex = Math.max(0, rows.length - 1);
      this.invalidateAndRender();
      return;
    }

    if (data === "r" || matchesKey(data, Key.ctrl("r"))) {
      void this.refresh();
      return;
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const boxWidth = Math.max(40, width - 2);
    const contentWidth = Math.max(1, boxWidth - 4);
    const border = (text: string) => ansiDim(text, { fullReset: true });

    const add = (line: string) => {
      lines.push(padRightVisible(line, width));
    };

    const rows = this.getFilteredRows();
    this.clampSelection(rows);

    add(borderLine(boxWidth, "╭", "╮", border));

    const title = ansiBold("LSP Status", { fullReset: true });
    const totals = `${this.snapshot.totals.configured} configured · ${this.snapshot.totals.connected} connected · ${this.snapshot.totals.spawning} spawning · ${this.snapshot.totals.broken} broken · ${this.snapshot.totals.disabled} disabled`;
    add(contentLine(truncateAnsiToWidth(`${title} ${ansiDim(totals, { fullReset: true })}`, contentWidth), boxWidth, border));

    const filterLabel = this.filterMode
      ? ansiColor(`filter: ${this.filterQuery || ""}_`, 36, { fullReset: true })
      : this.filterQuery
        ? ansiColor(`filter: ${this.filterQuery}`, 36, { fullReset: true })
        : ansiDim("filter: (press /)", { fullReset: true });

    const statusParts: string[] = [filterLabel];
    if (this.refreshing) {
      statusParts.push(ansiColor("refreshing…", 33, { fullReset: true }));
    }
    if (this.error) {
      statusParts.push(ansiColor(`error: ${this.error}`, 31, { fullReset: true }));
    }

    add(contentLine(truncateAnsiToWidth(statusParts.join(" · "), contentWidth), boxWidth, border));
    add(borderLine(boxWidth, "├", "┤", border));

    if (this.snapshot.rows.length === 0) {
      add(contentLine(ansiDim("no servers configured", { fullReset: true }), boxWidth, border));
    } else if (rows.length === 0) {
      add(contentLine(ansiDim("no rows match filter", { fullReset: true }), boxWidth, border));
    } else {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const selected = index === this.selectedIndex;
        const state = rowState(row);

        const stateBadge = colorStateBadge(state);
        const diagnostics = row.diagnostics
          ? `E${row.diagnostics.error}/W${row.diagnostics.warning}/I${row.diagnostics.info}/H${row.diagnostics.hint}`
          : "no diagnostics";

        const details = `${row.serverId} ${stateBadge} ${ansiDim(`roots:${row.connectedRoots.length} diag:${diagnostics}`, { fullReset: true })}`;
        let rendered = truncateAnsiToWidth(details, contentWidth - 2);
        rendered = selected
          ? `\x1b[7m ${rendered}${" ".repeat(Math.max(0, contentWidth - 1 - visibleWidth(rendered)))}\x1b[27m`
          : ` ${rendered}`;

        add(contentLine(rendered, boxWidth, border, 1));

        if (selected && this.expanded) {
          const expandedLines = [
            `source: ${row.source}`,
            `extensions: ${row.extensions.join(", ") || "(none)"}`,
            `configured roots: ${row.configuredRoots.join(", ") || "(none)"}`,
            `connected roots: ${row.connectedRoots.join(", ") || "(none)"}`,
            `spawning roots: ${row.spawningRoots.join(", ") || "(none)"}`,
            row.broken
              ? `broken: attempts=${row.broken.attempts} retryAt=${new Date(row.broken.retryAt).toLocaleTimeString()}`
              : "broken: no",
          ];

          for (const expandedLine of expandedLines) {
            add(contentLine(`   ${truncateAnsiToWidth(ansiDim(expandedLine, { fullReset: true }), contentWidth - 3)}`, boxWidth, border, 1));
          }
        }
      }
    }

    add(borderLine(boxWidth, "├", "┤", border));

    if (this.showHelp) {
      const helpLines = [
        "↑/↓ or j/k move · Enter expand",
        "/ filter · Esc close filter/modal · q close",
        "Ctrl+R or r refresh · g/G first/last",
        "? toggle help",
      ];
      for (const helpLine of helpLines) {
        add(contentLine(truncateAnsiToWidth(ansiDim(helpLine, { fullReset: true }), contentWidth), boxWidth, border));
      }
    } else {
      add(contentLine(
        truncateAnsiToWidth(
          ansiDim("↑/↓ j/k move · Enter expand · / filter · r refresh · ? help · q close", { fullReset: true }),
          contentWidth,
        ),
        boxWidth,
        border,
      ));
    }

    add(borderLine(boxWidth, "╰", "╯", border));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}
