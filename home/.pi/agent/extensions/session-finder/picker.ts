// Telescope-style picker overlay: results (best match nearest the prompt),
// prompt at the bottom, preview on the right (or above on narrow terminals).

import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Focusable,
  Input,
  type TUI,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { CurrentSessionSearch } from "./current-search.ts";
import type { SessionDocKind } from "./extract.ts";
import type { SessionIndexClient } from "./index-client.ts";
import type { IndexProgress, SessionDocPreview, SessionSearchHit, SessionSearchResponse } from "./index-store.ts";
import type { MatchRange } from "./query.ts";

export type SessionFinderScope = "current" | "all";

export interface SessionFinderSelection {
  scope: SessionFinderScope;
  hit: SessionSearchHit;
}

const ROLE_FILTERS: Array<{ label: string; kinds: SessionDocKind[] }> = [
  { label: "all", kinds: [] },
  { label: "user", kinds: ["user"] },
  { label: "llm", kinds: ["assistant"] },
  { label: "tools", kinds: ["toolCall", "toolResult"] },
];

const RESULT_LIMIT = 300;
const PREVIEW_TEXT_WINDOW = 60_000;

export interface SessionFinderPickerOptions {
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  scope: SessionFinderScope;
  current: CurrentSessionSearch | undefined;
  index: SessionIndexClient;
  initialQuery: string;
  /** Overlay height as a fraction of terminal rows. */
  heightRatio: number;
  done: (selection: SessionFinderSelection | undefined) => void;
}

function relativeAge(ts: number): string {
  if (!ts) return "";
  const seconds = Math.max(0, (Date.now() - ts) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d`;
  if (seconds < 86400 * 365) return `${Math.floor(seconds / (86400 * 30))}mo`;
  return `${Math.floor(seconds / (86400 * 365))}y`;
}

function projectName(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts.at(-1) ?? cwd;
}

function highlight(text: string, ranges: MatchRange[], style: (s: string) => string): string {
  if (ranges.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const s = Math.max(start, cursor);
    out += text.slice(cursor, s) + style(text.slice(s, end));
    cursor = end;
  }
  return out + text.slice(cursor);
}

export class SessionFinderPicker implements Component, Focusable {
  private readonly input = new Input({ prompt: "› " });
  private scope: SessionFinderScope;
  private roleIndex = 0;
  private hits: SessionSearchHit[] = [];
  private response: SessionSearchResponse | undefined;
  private selected = 0;
  private listScroll = 0;
  private preview: SessionDocPreview | undefined;
  private previewDocKey: string | undefined;
  private previewScroll = 0;
  private previewLinesCache: { key: string; width: number; lines: string[]; firstMatchLine: number } | undefined;
  private searchSeq = 0;
  private previewSeq = 0;
  private searching = false;
  /** A query changed while a worker search was running; run again when it returns. */
  private searchAgain = false;
  private error: string | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private readonly unsubscribeProgress: () => void;
  private progress: IndexProgress;
  private _focused = false;

  private readonly options: SessionFinderPickerOptions;

  constructor(options: SessionFinderPickerOptions) {
    this.options = options;
    if (options.initialQuery) {
      // setValue keeps the cursor at 0; Input's paste path inserts at the cursor and leaves it at the end.
      this.input.handleInput(`\x1b[200~${options.initialQuery}\x1b[201~`);
    }
    this.scope = options.current ? options.scope : "all";
    this.progress = options.index.progress;
    this.unsubscribeProgress = options.index.onProgress((progress) => {
      const finishedIndexing = this.progress.phase !== "idle" && progress.phase === "idle";
      this.progress = progress;
      // Re-run the query when indexing finishes so new docs show up.
      if (finishedIndexing && this.scope === "all") this.runSearch();
      this.options.tui.requestRender();
    });
    this.runSearch();
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }

  dispose(): void {
    this.unsubscribeProgress();
    if (this.debounce) clearTimeout(this.debounce);
  }

  invalidate(): void {
    this.previewLinesCache = undefined;
    this.input.invalidate();
  }

  // ── search ──────────────────────────────────────────────────────────────

  private get roleKinds(): SessionDocKind[] {
    return ROLE_FILTERS[this.roleIndex]!.kinds;
  }

  private scheduleSearch(): void {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.scope === "current") {
      this.runSearch();
      return;
    }
    this.debounce = setTimeout(() => this.runSearch(), 90);
  }

  private runSearch(): void {
    const seq = ++this.searchSeq;
    const query = this.input.getValue();
    if (this.scope === "current" && this.options.current) {
      this.applyResponse(this.options.current.search(query, this.roleKinds, RESULT_LIMIT));
      return;
    }
    // One worker search at a time: typing fast must not queue up stale searches.
    if (this.searching) {
      this.searchAgain = true;
      return;
    }
    this.searching = true;
    const finish = () => {
      this.searching = false;
      if (this.searchAgain) {
        this.searchAgain = false;
        this.runSearch();
      }
    };
    this.options.index
      .search({ query, roleFilter: this.roleKinds, limit: RESULT_LIMIT })
      .then((response) => {
        const stale = seq !== this.searchSeq || this.searchAgain;
        if (!stale) {
          this.error = undefined;
          this.applyResponse(response);
        }
        finish();
      })
      .catch((error: unknown) => {
        if (seq === this.searchSeq && !this.searchAgain) {
          this.error = error instanceof Error ? error.message : String(error);
          this.options.tui.requestRender();
        }
        finish();
      });
    this.options.tui.requestRender();
  }

  private applyResponse(response: SessionSearchResponse): void {
    this.response = response;
    this.hits = response.hits;
    this.selected = 0;
    this.listScroll = 0;
    this.loadPreview();
    this.options.tui.requestRender();
  }

  private hitKey(hit: SessionSearchHit): string {
    return `${this.scope}:${hit.docId}`;
  }

  private loadPreview(): void {
    const hit = this.hits[this.selected];
    if (!hit) {
      this.preview = undefined;
      this.previewDocKey = undefined;
      return;
    }
    const key = this.hitKey(hit);
    const query = this.input.getValue();
    const seq = ++this.previewSeq;
    const apply = (preview: SessionDocPreview | undefined) => {
      if (seq !== this.previewSeq) return;
      this.preview = preview;
      this.previewDocKey = key;
      this.previewLinesCache = undefined;
      this.previewScroll = -1; // jump to first match on next render
      this.options.tui.requestRender();
    };
    if (this.scope === "current" && this.options.current) {
      apply(this.options.current.preview(hit.docId, query));
      return;
    }
    this.options.index.preview(hit.docId, query).then(apply, () => apply(undefined));
  }

  // ── input ───────────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const kb = this.options.keybindings;
    if (kb.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c")) {
      this.options.done(undefined);
      return;
    }
    if (kb.matches(data, "tui.select.confirm")) {
      const hit = this.hits[this.selected];
      if (hit) this.options.done({ scope: this.scope, hit });
      return;
    }
    // Results are drawn bottom-up (best match next to the prompt), so "up" moves to the next result.
    if (kb.matches(data, "tui.select.up") || matchesKey(data, "ctrl+p") || matchesKey(data, "ctrl+k")) {
      this.moveSelection(1);
      return;
    }
    if (kb.matches(data, "tui.select.down") || matchesKey(data, "ctrl+n") || matchesKey(data, "ctrl+j")) {
      this.moveSelection(-1);
      return;
    }
    if (kb.matches(data, "tui.select.pageUp")) {
      this.moveSelection(this.listHeight());
      return;
    }
    if (kb.matches(data, "tui.select.pageDown")) {
      this.moveSelection(-this.listHeight());
      return;
    }
    if (matchesKey(data, "ctrl+u")) {
      this.scrollPreview(-Math.max(1, Math.floor(this.previewHeight() / 2)));
      return;
    }
    if (matchesKey(data, "ctrl+d")) {
      this.scrollPreview(Math.max(1, Math.floor(this.previewHeight() / 2)));
      return;
    }
    if (matchesKey(data, "tab")) {
      this.roleIndex = (this.roleIndex + 1) % ROLE_FILTERS.length;
      this.runSearch();
      return;
    }
    if (matchesKey(data, "shift+tab")) {
      this.roleIndex = (this.roleIndex - 1 + ROLE_FILTERS.length) % ROLE_FILTERS.length;
      this.runSearch();
      return;
    }
    if (matchesKey(data, "ctrl+s")) {
      if (!this.options.current) return;
      this.scope = this.scope === "current" ? "all" : "current";
      this.preview = undefined;
      this.runSearch();
      return;
    }
    const before = this.input.getValue();
    this.input.handleInput(data);
    if (this.input.getValue() !== before) this.scheduleSearch();
    this.options.tui.requestRender();
  }

  private moveSelection(delta: number): void {
    if (this.hits.length === 0) return;
    const next = Math.max(0, Math.min(this.hits.length - 1, this.selected + delta));
    if (next === this.selected) return;
    this.selected = next;
    this.loadPreview();
    this.options.tui.requestRender();
  }

  private scrollPreview(delta: number): void {
    const cache = this.previewLinesCache;
    if (!cache) return;
    const max = Math.max(0, cache.lines.length - this.previewHeight());
    this.previewScroll = Math.max(0, Math.min(max, Math.max(0, this.previewScroll) + delta));
    this.options.tui.requestRender();
  }

  // ── layout ──────────────────────────────────────────────────────────────

  private totalHeight(): number {
    return Math.max(14, Math.floor(this.options.tui.terminal.rows * this.options.heightRatio));
  }

  private isWide(width: number): boolean {
    return width >= 110;
  }

  private lastWidth = 120;

  private layout(width: number) {
    const height = this.totalHeight();
    const promptHeight = 3;
    if (this.isWide(width)) {
      const leftWidth = Math.floor(width * 0.48);
      return {
        wide: true,
        leftWidth,
        rightWidth: width - leftWidth,
        resultsHeight: height - promptHeight,
        promptHeight,
        previewHeight: height,
        height,
      };
    }
    const previewHeight = Math.max(6, Math.floor(height * 0.45));
    return {
      wide: false,
      leftWidth: width,
      rightWidth: width,
      resultsHeight: height - previewHeight - promptHeight,
      promptHeight,
      previewHeight,
      height,
    };
  }

  private listHeight(): number {
    return Math.max(1, this.layout(this.lastWidth).resultsHeight - 2);
  }

  private previewHeight(): number {
    return Math.max(1, this.layout(this.lastWidth).previewHeight - 2);
  }

  // ── rendering ───────────────────────────────────────────────────────────

  private box(title: string, footer: string, content: string[], width: number, height: number, accent: boolean): string[] {
    const theme = this.options.theme;
    const border = (s: string) => theme.fg(accent ? "borderAccent" : "border", s);
    const inner = Math.max(1, width - 2);
    const titled = (left: string, right: string, text: string) => {
      const label = text ? ` ${text} ` : "";
      const labelText = truncateToWidth(label, Math.max(0, inner - 2), "…");
      const fill = Math.max(0, inner - 1 - visibleWidth(labelText));
      return border(left + "─") + theme.fg(accent ? "accent" : "muted", labelText) + border("─".repeat(fill) + right);
    };
    const lines = [titled("╭", "╮", title)];
    const bodyHeight = Math.max(0, height - 2);
    for (let i = 0; i < bodyHeight; i++) {
      const line = content[i] ?? "";
      lines.push(border("│") + " " + truncateToWidth(line, inner - 2, "…", true) + " " + border("│"));
    }
    lines.push(titled("╰", "╯", footer));
    return lines;
  }

  private kindBadge(hit: { kind: SessionDocKind; tool?: string }): string {
    const theme = this.options.theme;
    switch (hit.kind) {
      case "user":
        return theme.fg("accent", "user");
      case "assistant":
        return theme.fg("success", "llm ");
      case "toolCall":
        return theme.fg("warning", `⚙ ${hit.tool ?? "tool"}`);
      case "toolResult":
        return theme.fg("muted", `↳ ${hit.tool ?? "tool"}`);
    }
  }

  private renderResults(width: number, height: number): string[] {
    const theme = this.options.theme;
    const bodyHeight = Math.max(1, height - 2);
    const inner = Math.max(1, width - 4);
    if (this.selected < this.listScroll) this.listScroll = this.selected;
    if (this.selected >= this.listScroll + bodyHeight) this.listScroll = this.selected - bodyHeight + 1;

    const rows: string[] = [];
    for (let row = 0; row < bodyHeight; row++) {
      const index = this.listScroll + row;
      const hit = this.hits[index];
      if (!hit) {
        rows.push("");
        continue;
      }
      const isSelected = index === this.selected;
      const metaParts = [relativeAge(hit.ts)];
      if (this.scope === "all") metaParts.unshift(projectName(hit.cwd));
      else if (this.options.current && !this.options.current.isOnBranch(hit.entryId)) metaParts.unshift("⑂");
      const meta = theme.fg("dim", metaParts.filter(Boolean).join(" · "));
      const badge = this.kindBadge(hit);
      const marker = isSelected ? theme.fg("accent", "▶") : " ";
      // Tool call text starts with "<tool>: "; the badge already names the tool.
      let snippetText = hit.snippet;
      let snippetRanges = hit.snippetRanges;
      const toolPrefix = hit.kind === "toolCall" && hit.tool ? `${hit.tool}: ` : "";
      if (toolPrefix && snippetText.startsWith(toolPrefix)) {
        snippetText = snippetText.slice(toolPrefix.length);
        snippetRanges = snippetRanges
          .map(([s, e]) => [Math.max(0, s - toolPrefix.length), e - toolPrefix.length] as MatchRange)
          .filter(([, e]) => e > 0);
      }
      const snippet = highlight(snippetText, snippetRanges, (s) => theme.bold(theme.fg("accent", s)));
      const left = `${marker} ${badge} `;
      const available = inner - visibleWidth(left) - visibleWidth(meta) - 1;
      const body = truncateToWidth(snippet, Math.max(4, available), "…", true);
      let line = `${left}${body} ${meta}`;
      if (isSelected) {
        // truncateToWidth emits full resets (\x1b[0m) before its ellipsis; re-open the background after each.
        const bgOpen = theme.bg("selectedBg", "").replace("\x1b[49m", "");
        line = theme.bg("selectedBg", truncateToWidth(line, inner, "", true).replaceAll("\x1b[0m", `\x1b[0m${bgOpen}`));
      }
      rows.push(line);
    }
    // Best match nearest the prompt: draw bottom-up.
    rows.reverse();

    let footer = `${this.hits.length}${this.response?.truncated ? "+" : ""} results`;
    if (this.searching) footer = "searching…";
    if (this.error) footer = `error: ${this.error}`;
    return this.box("Results", footer, rows, width, height, false);
  }

  private renderPrompt(width: number): string[] {
    const theme = this.options.theme;
    const scopeLabel = this.scope === "current" ? "current session" : "all sessions";
    const title = `Find in ${scopeLabel}`;
    const roles = ROLE_FILTERS.map((f, i) => (i === this.roleIndex ? `[${f.label}]` : f.label)).join(" ");
    let status = roles;
    if (this.scope === "all" && this.progress.phase !== "idle") {
      status += this.progress.phase === "scanning" ? " · scanning…" : ` · indexing ${this.progress.filesDone}/${this.progress.filesTotal}`;
    }
    const inner = Math.max(1, width - 4);
    const inputLine = this.input.render(inner)[0] ?? "";
    return this.box(title, status, [inputLine], width, 3, true);
  }

  private buildPreviewLines(width: number): { lines: string[]; firstMatchLine: number } {
    const theme = this.options.theme;
    const hit = this.hits[this.selected];
    const preview = this.preview;
    if (!hit || !preview || this.previewDocKey !== this.hitKey(hit)) return { lines: [theme.fg("dim", hit ? "loading…" : "no results")], firstMatchLine: 0 };

    const lines: string[] = [];
    const when = hit.ts ? new Date(hit.ts).toLocaleString() : "";
    lines.push(`${this.kindBadge(hit)} ${theme.fg("dim", when)}`);
    if (this.scope === "all") {
      if (hit.sessionTitle) lines.push(theme.fg("text", truncateToWidth(hit.sessionTitle, width)));
      lines.push(theme.fg("dim", truncateToWidth(hit.cwd, width)));
    }
    const contextLine = (n: { kind: SessionDocKind; tool?: string; text: string }) =>
      theme.fg("dim", truncateToWidth(`${n.kind === "user" ? "user" : n.kind === "assistant" ? "llm" : n.tool ?? "tool"}: ${n.text.replace(/\s+/g, " ")}`, width, "…"));
    for (const n of preview.before) lines.push(contextLine(n));
    lines.push(theme.fg("borderMuted", "─".repeat(Math.max(1, width))));

    // Cap huge tool output to a window around the first match.
    let text = preview.text;
    let ranges = preview.ranges;
    let prefix = "";
    if (text.length > PREVIEW_TEXT_WINDOW) {
      const anchor = ranges[0]?.[0] ?? 0;
      const start = Math.max(0, anchor - PREVIEW_TEXT_WINDOW / 4);
      const end = Math.min(text.length, start + PREVIEW_TEXT_WINDOW);
      text = text.slice(start, end);
      ranges = ranges.filter(([s, e]) => s >= start && e <= end).map(([s, e]) => [s - start, e - start] as MatchRange);
      prefix = start > 0 ? theme.fg("dim", `… ${start} characters above`) : "";
    }
    if (prefix) lines.push(prefix);
    // Logical line and column of the first match, to scroll the preview to it.
    const firstStart = ranges[0]?.[0];
    const matchLineIndex = firstStart === undefined ? -1 : text.slice(0, firstStart).split("\n").length - 1;
    const matchColumn = firstStart === undefined ? 0 : firstStart - (text.lastIndexOf("\n", firstStart - 1) + 1);
    let firstMatchLine = lines.length;
    const displayLines = highlight(text, ranges, (s) => theme.bold(theme.fg("warning", s))).split("\n");
    for (let i = 0; i < displayLines.length; i++) {
      const wrapped = wrapTextWithAnsi(displayLines[i]!, width);
      if (i === matchLineIndex) firstMatchLine = lines.length + Math.min(Math.max(0, wrapped.length - 1), Math.floor(matchColumn / Math.max(1, width)));
      lines.push(...(wrapped.length > 0 ? wrapped : [""]));
    }
    if (preview.after.length > 0) {
      lines.push(theme.fg("borderMuted", "─".repeat(Math.max(1, width))));
      for (const n of preview.after) lines.push(contextLine(n));
    }
    return { lines, firstMatchLine };
  }

  private renderPreview(width: number, height: number): string[] {
    const inner = Math.max(1, width - 4);
    const bodyHeight = Math.max(1, height - 2);
    const hit = this.hits[this.selected];
    const key = `${hit ? this.hitKey(hit) : "none"}:${this.previewDocKey ?? ""}:${this.preview ? "loaded" : "empty"}`;
    if (!this.previewLinesCache || this.previewLinesCache.key !== key || this.previewLinesCache.width !== inner) {
      const built = this.buildPreviewLines(inner);
      this.previewLinesCache = { key, width: inner, ...built };
    }
    const cache = this.previewLinesCache;
    const max = Math.max(0, cache.lines.length - bodyHeight);
    if (this.previewScroll < 0) this.previewScroll = Math.min(max, Math.max(0, cache.firstMatchLine - 3));
    this.previewScroll = Math.min(this.previewScroll, max);
    const body = cache.lines.slice(this.previewScroll, this.previewScroll + bodyHeight);
    const position = cache.lines.length > bodyHeight ? `${this.previewScroll + 1}-${Math.min(cache.lines.length, this.previewScroll + bodyHeight)}/${cache.lines.length}` : "";
    const title = hit ? (this.scope === "all" ? projectName(hit.cwd) : "Preview") : "Preview";
    const footer = [position, "C-u/C-d scroll", this.options.current ? "C-s scope" : "", "Tab role", "↵ open"].filter(Boolean).join(" · ");
    return this.box(title, footer, body, width, height, false);
  }

  render(width: number): string[] {
    this.lastWidth = width;
    const layout = this.layout(width);
    const results = this.renderResults(layout.leftWidth, layout.resultsHeight);
    const prompt = this.renderPrompt(layout.leftWidth);
    const preview = this.renderPreview(layout.rightWidth, layout.previewHeight);
    if (!layout.wide) return [...preview, ...results, ...prompt];
    const left = [...results, ...prompt];
    const lines: string[] = [];
    for (let i = 0; i < layout.height; i++) {
      const l = truncateToWidth(left[i] ?? "", layout.leftWidth, "", true);
      const r = truncateToWidth(preview[i] ?? "", layout.rightWidth, "", true);
      lines.push(l + r);
    }
    return lines;
  }
}
