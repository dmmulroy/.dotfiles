import type { ExtensionAPI, ReadonlyFooterDataProvider, Theme } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { visibleWidth } from "@mariozechner/pi-tui";
import type { ColorScheme, SegmentContext, StatusLineSegmentId, StatusLineSegmentOptions } from "./types.js";
import { getSeparator } from "./separators.js";
import { renderSegment } from "./segments.js";
import { getVcsStatus, invalidateVcsStatus, invalidateVcsBranch } from "./vcs-status.js";
import { fg, getDefaultColors } from "./theme.js";
import { isBracketStatusLine, shouldHideExtensionStatus } from "../../prelude/extension-status.js";

const STATIC_SEGMENTS: StatusLineSegmentId[] = [
  "pi",
  "path",
  "vcs",
  "model",
  "context_pct",
];

const STATIC_SEGMENT_OPTIONS: StatusLineSegmentOptions = {
  model: { showThinkingLevel: true },
  path: { mode: "full" },
  vcs: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true },
};

const STATIC_SEPARATOR = getSeparator("powerline-thin");
const STATIC_COLORS: ColorScheme = getDefaultColors();
const EMPTY_STATUSES = new Map<string, string>();
const VCS_REFRESH_DELAYS = [0, 120, 320, 700, 1400] as const;

type ThinkingBorderColor =
  | "thinkingOff"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh"
  | "thinkingXhigh";

const THINKING_BORDER_COLORS: Record<string, ThinkingBorderColor> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
};

interface SessionUsageSnapshot {
  processedEvents: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  lastAssistant?: AssistantMessage;
  thinkingLevel: string;
}

function createUsageSnapshot(): SessionUsageSnapshot {
  return {
    processedEvents: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    lastAssistant: undefined,
    thinkingLevel: "off",
  };
}

function getBorderColorForThinkingLevel(level: string): ThinkingBorderColor {
  return THINKING_BORDER_COLORS[level] ?? "thinkingOff";
}

function renderSegmentWithWidth(
  segId: StatusLineSegmentId,
  ctx: SegmentContext,
): { content: string; width: number; visible: boolean; } {
  const rendered = renderSegment(segId, ctx);
  if (!rendered.visible || !rendered.content) {
    return { content: "", width: 0, visible: false };
  }
  return { content: rendered.content, width: visibleWidth(rendered.content), visible: true };
}

const IMAGE_TOKEN_HIGHLIGHT_RE = /\[Image\s+\d+]/g;

function highlightImageTokenChips(line: string, theme: Theme): string {
  return line.replace(IMAGE_TOKEN_HIGHLIGHT_RE, (token) =>
    theme.bg("selectedBg", theme.fg("accent", token)),
  );
}

function buildContentFromParts(parts: string[], ctx: SegmentContext): string {
  if (parts.length === 0) return "";
  const sep = fg(ctx.theme, "separator", STATIC_SEPARATOR.left, ctx.colors);
  return " " + parts.join(` ${sep} `) + " ";
}

function computeResponsiveLayout(
  ctx: SegmentContext,
  availableWidth: number,
): { topContent: string; secondaryContent: string; } {
  const sepWidth = visibleWidth(STATIC_SEPARATOR.left) + 2;

  const renderedSegments: { content: string; width: number; }[] = [];
  for (const segId of STATIC_SEGMENTS) {
    const { content, width, visible } = renderSegmentWithWidth(segId, ctx);
    if (visible) renderedSegments.push({ content, width });
  }

  if (renderedSegments.length === 0) {
    return { topContent: "", secondaryContent: "" };
  }

  const baseOverhead = 2;
  let currentWidth = baseOverhead;
  const topSegments: string[] = [];
  const overflowSegments: { content: string; width: number; }[] = [];
  let overflow = false;

  for (const seg of renderedSegments) {
    const neededWidth = seg.width + (topSegments.length > 0 ? sepWidth : 0);

    if (!overflow && currentWidth + neededWidth <= availableWidth) {
      topSegments.push(seg.content);
      currentWidth += neededWidth;
    } else {
      overflow = true;
      overflowSegments.push(seg);
    }
  }

  let secondaryWidth = baseOverhead;
  const secondarySegments: string[] = [];

  for (const seg of overflowSegments) {
    const neededWidth = seg.width + (secondarySegments.length > 0 ? sepWidth : 0);
    if (secondaryWidth + neededWidth <= availableWidth) {
      secondarySegments.push(seg.content);
      secondaryWidth += neededWidth;
    } else {
      break;
    }
  }

  return {
    topContent: buildContentFromParts(topSegments, ctx),
    secondaryContent: buildContentFromParts(secondarySegments, ctx),
  };
}

function mightChangeVcsBranch(cmd: string): boolean {
  const vcsBranchPatterns = [
    /\bgit\s+(checkout|switch|branch\s+-[dDmM]|merge|rebase|pull|reset|worktree)/,
    /\bgit\s+stash\s+(pop|apply)/,
    /\bjj\s+(new|edit|next|prev|describe|split|squash|abandon|undo|restore|rebase|git\s+push|op\s+restore)\b/,
    /\bjj\s+bookmark\s+(create|set|move|delete|forget)\b/,
    /\bjj\s+branch\b/,
  ];
  return vcsBranchPatterns.some((p) => p.test(cmd));
}

export default function powerlineFooter(pi: ExtensionAPI) {
  let sessionStartTime = Date.now();
  let currentCtx: any = null;
  let footerDataRef: ReadonlyFooterDataProvider | null = null;
  let getThinkingLevelFn: (() => string) | null = null;
  let tuiRef: any = null;

  let usageSnapshot = createUsageSnapshot();

  let lastLayoutWidth = 0;
  let lastLayoutResult: { topContent: string; secondaryContent: string; } | null = null;
  let lastLayoutTimestamp = 0;

  let pendingRenderTimers: ReturnType<typeof setTimeout>[] = [];

  const clearPendingRenderTimers = () => {
    for (const timer of pendingRenderTimers) {
      clearTimeout(timer);
    }
    pendingRenderTimers = [];
  };

  const scheduleVcsRefreshRenders = () => {
    clearPendingRenderTimers();
    if (!tuiRef) return;

    for (const delay of VCS_REFRESH_DELAYS) {
      const timer = setTimeout(() => tuiRef?.requestRender(), delay);
      pendingRenderTimers.push(timer);
    }
  };

  const resetSessionDerivedState = () => {
    usageSnapshot = createUsageSnapshot();
    lastLayoutResult = null;
  };

  const updateUsageSnapshot = (ctx: any) => {
    const sessionEvents = ctx?.sessionManager?.getBranch?.() ?? [];

    if (usageSnapshot.processedEvents > sessionEvents.length) {
      usageSnapshot = createUsageSnapshot();
    }

    for (let i = usageSnapshot.processedEvents; i < sessionEvents.length; i++) {
      const event = sessionEvents[i];

      if (event?.type === "thinking_level_change" && typeof event.thinkingLevel === "string") {
        usageSnapshot.thinkingLevel = event.thinkingLevel;
        continue;
      }

      if (event?.type !== "message" || event.message?.role !== "assistant") {
        continue;
      }

      const assistantMessage = event.message as AssistantMessage;
      if (assistantMessage.stopReason === "error" || assistantMessage.stopReason === "aborted") {
        continue;
      }

      const usage = assistantMessage.usage;
      usageSnapshot.input += usage?.input ?? 0;
      usageSnapshot.output += usage?.output ?? 0;
      usageSnapshot.cacheRead += usage?.cacheRead ?? 0;
      usageSnapshot.cacheWrite += usage?.cacheWrite ?? 0;
      usageSnapshot.cost += usage?.cost?.total ?? 0;
      usageSnapshot.lastAssistant = assistantMessage;
    }

    usageSnapshot.processedEvents = sessionEvents.length;
  };

  const resolveThinkingLevel = (ctx: any): string => {
    updateUsageSnapshot(ctx);
    return usageSnapshot.thinkingLevel || getThinkingLevelFn?.() || "off";
  };

  pi.on("session_start", async (_event, ctx) => {
    sessionStartTime = Date.now();
    currentCtx = ctx;

    resetSessionDerivedState();
    invalidateVcsStatus();
    invalidateVcsBranch();

    getThinkingLevelFn = typeof ctx.getThinkingLevel === "function"
      ? () => ctx.getThinkingLevel()
      : null;

    if (ctx.hasUI) {
      setupCustomEditor(ctx);
      scheduleVcsRefreshRenders();
    }
  });

  pi.on("session_switch", async (_event, ctx) => {
    currentCtx = ctx;
    resetSessionDerivedState();

    invalidateVcsStatus();
    invalidateVcsBranch();

    getThinkingLevelFn = typeof ctx.getThinkingLevel === "function"
      ? () => ctx.getThinkingLevel()
      : null;

    scheduleVcsRefreshRenders();
  });

  pi.on("tool_result", async (event) => {
    let shouldRefresh = false;

    if (event.toolName === "write" || event.toolName === "edit") {
      invalidateVcsStatus();
      shouldRefresh = true;
    }

    if (event.toolName === "bash" && event.input?.command) {
      const cmd = String(event.input.command);
      if (mightChangeVcsBranch(cmd)) {
        invalidateVcsStatus();
        invalidateVcsBranch();
        shouldRefresh = true;
      }
    }

    if (shouldRefresh) {
      scheduleVcsRefreshRenders();
    }
  });

  pi.on("user_bash", async (event) => {
    if (!mightChangeVcsBranch(event.command)) return;

    invalidateVcsStatus();
    invalidateVcsBranch();
    scheduleVcsRefreshRenders();
  });

  function buildSegmentContext(ctx: any, theme: Theme): SegmentContext {
    updateUsageSnapshot(ctx);

    const lastAssistant = usageSnapshot.lastAssistant;
    const contextTokens = lastAssistant
      ? (lastAssistant.usage?.input ?? 0)
      + (lastAssistant.usage?.output ?? 0)
      + (lastAssistant.usage?.cacheRead ?? 0)
      + (lastAssistant.usage?.cacheWrite ?? 0)
      : 0;

    const contextWindow = ctx.model?.contextWindow || 0;
    const contextPercent = contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0;

    const providerVcsBranch = footerDataRef?.getGitBranch() ?? null;
    const vcsStatus = getVcsStatus(providerVcsBranch);

    const usingSubscription = ctx.model
      ? ctx.modelRegistry?.isUsingOAuth?.(ctx.model) ?? false
      : false;

    return {
      model: ctx.model,
      thinkingLevel: usageSnapshot.thinkingLevel || getThinkingLevelFn?.() || "off",
      sessionId: ctx.sessionManager?.getSessionId?.(),
      usageStats: {
        input: usageSnapshot.input,
        output: usageSnapshot.output,
        cacheRead: usageSnapshot.cacheRead,
        cacheWrite: usageSnapshot.cacheWrite,
        cost: usageSnapshot.cost,
      },
      contextPercent,
      contextWindow,
      autoCompactEnabled: ctx.settingsManager?.getCompactionSettings?.()?.enabled ?? true,
      usingSubscription,
      sessionStartTime,
      vcs: vcsStatus,
      extensionStatuses: footerDataRef?.getExtensionStatuses() ?? EMPTY_STATUSES,
      options: STATIC_SEGMENT_OPTIONS,
      theme,
      colors: STATIC_COLORS,
    };
  }

  function getResponsiveLayout(width: number, theme: Theme): { topContent: string; secondaryContent: string; } {
    if (!currentCtx) {
      return { topContent: "", secondaryContent: "" };
    }

    const now = Date.now();
    if (lastLayoutResult && lastLayoutWidth === width && now - lastLayoutTimestamp < 50) {
      return lastLayoutResult;
    }

    const segmentCtx = buildSegmentContext(currentCtx, theme);

    // Rounded top border reserves 4 chars: "╭─" + "─╮"
    const topBarAvailable = Math.max(1, width - 4);

    lastLayoutWidth = width;
    lastLayoutResult = computeResponsiveLayout(segmentCtx, topBarAvailable);
    lastLayoutTimestamp = now;

    return lastLayoutResult;
  }

  function setupCustomEditor(ctx: any) {
    import("@mariozechner/pi-coding-agent").then(({ CustomEditor }) => {
      let currentEditor: any = null;
      let autocompleteFixed = false;

      const editorFactory = (tui: any, editorTheme: any, keybindings: any) => {
        const editor = new CustomEditor(tui, editorTheme, keybindings);
        currentEditor = editor;

        const originalHandleInput = editor.handleInput.bind(editor);
        editor.handleInput = (data: string) => {
          if (!autocompleteFixed && !(editor as any).autocompleteProvider) {
            autocompleteFixed = true;
            ctx.ui.setEditorComponent(editorFactory);
            currentEditor?.handleInput(data);
            return;
          }
          originalHandleInput(data);
        };

        const originalRender = editor.render.bind(editor);

        editor.render = (width: number): string[] => {
          if (width < 10) {
            return originalRender(width);
          }

          const thinkingLevel = resolveThinkingLevel(currentCtx);
          const borderColor = getBorderColorForThinkingLevel(thinkingLevel);
          const bc = (s: string) => ctx.ui.theme.fg(borderColor, s);

          const topLeft = bc("╭─");
          const topRight = bc("─╮");
          const bottomLeft = bc("╰─");
          const bottomRight = bc("─╯");
          const vertical = bc("│");

          const contentWidth = Math.max(1, width - 6);
          const lines = originalRender(contentWidth);

          if (lines.length === 0 || !currentCtx) return lines;

          let bottomBorderIndex = lines.length - 1;
          for (let i = lines.length - 1; i >= 1; i--) {
            const stripped = lines[i]?.replace(/\x1b\[[0-9;]*m/g, "") || "";
            if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
              bottomBorderIndex = i;
              break;
            }
          }

          const result: string[] = [];

          const layout = getResponsiveLayout(width, ctx.ui.theme);
          const statusContent = layout.topContent;
          const statusWidth = visibleWidth(statusContent);
          const topFillWidth = width - 4;
          const fillWidth = Math.max(0, topFillWidth - statusWidth);

          result.push(topLeft + statusContent + bc("─".repeat(fillWidth)) + topRight);

          for (let i = 1; i < bottomBorderIndex; i++) {
            const rawLine = lines[i] || "";
            const line = highlightImageTokenChips(rawLine, ctx.ui.theme);
            const lineWidth = visibleWidth(rawLine);
            const padding = " ".repeat(Math.max(0, contentWidth - lineWidth));

            const isLastContent = i === bottomBorderIndex - 1;
            if (isLastContent) {
              result.push(`${bottomLeft} ${line}${padding} ${bottomRight}`);
            } else {
              result.push(`${vertical}  ${line}${padding}  ${vertical}`);
            }
          }

          if (bottomBorderIndex === 1) {
            const padding = " ".repeat(contentWidth);
            result.push(`${bottomLeft} ${padding} ${bottomRight}`);
          }

          for (let i = bottomBorderIndex + 1; i < lines.length; i++) {
            result.push(lines[i] || "");
          }

          return result;
        };

        return editor;
      };

      ctx.ui.setEditorComponent(editorFactory);

      ctx.ui.setFooter((tui: any, _theme: Theme, footerData: ReadonlyFooterDataProvider) => {
        footerDataRef = footerData;
        tuiRef = tui;
        scheduleVcsRefreshRenders();

        const unsub = footerData.onBranchChange(() => {
          invalidateVcsBranch();
          scheduleVcsRefreshRenders();
        });

        return {
          dispose() {
            unsub();
            if (footerDataRef === footerData) {
              footerDataRef = null;
              tuiRef = null;
              clearPendingRenderTimers();
            }
          },
          invalidate() { },
          render(): string[] {
            return [];
          },
        };
      });

      ctx.ui.setWidget("powerline-secondary", (_tui: any, theme: Theme) => {
        return {
          dispose() { },
          invalidate() { },
          render(width: number): string[] {
            if (!currentCtx) return [];

            const layout = getResponsiveLayout(width, theme);
            if (layout.secondaryContent) return [layout.secondaryContent];

            return [];
          },
        };
      }, { placement: "belowEditor" });

      ctx.ui.setWidget("powerline-status", () => {
        return {
          dispose() { },
          invalidate() { },
          render(width: number): string[] {
            if (!currentCtx || !footerDataRef) return [];

            const statuses = footerDataRef.getExtensionStatuses();
            if (!statuses || statuses.size === 0) return [];

            const notifications: string[] = [];
            for (const [statusKey, value] of statuses.entries()) {
              if (!value || shouldHideExtensionStatus(statusKey, value)) continue;
              if (isBracketStatusLine(value)) {
                const lineContent = ` ${value}`;
                const contentWidth = visibleWidth(lineContent);
                if (contentWidth <= width) {
                  notifications.push(lineContent);
                }
              }
            }

            return notifications;
          },
        };
      }, { placement: "aboveEditor" });
    }).catch(() => {
      // Ignore editor setup failures.
    });
  }
}
