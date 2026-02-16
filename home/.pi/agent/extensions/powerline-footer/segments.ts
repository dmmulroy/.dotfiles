import { hostname as osHostname } from "node:os";
import { basename } from "node:path";
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { shouldHideExtensionStatus } from "../../prelude/extension-status.js";
import { getModelDisplayName } from "../../prelude/model.js";
import { getHomeDir, toHomeRelativePath } from "../../prelude/environment.js";
import type { RenderedSegment, SegmentContext, SemanticColor, StatusLineSegment, StatusLineSegmentId } from "./types.js";
import { fg, applyColor } from "./theme.js";
import { getIcons, SEP_DOT, getThinkingText } from "./icons.js";

// Helper to apply semantic color from context
function color(ctx: SegmentContext, semantic: SemanticColor, text: string): string {
  return fg(ctx.theme, semantic, text, ctx.colors);
}

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

// Match lualine branch/bookmark formatting: user/team-123 -> user/team-123
function truncateBranchName(branch: string | null | undefined): string {
  if (!branch) return "";
  const match = branch.match(/^(\w+)\/(\w+)-(\d+)/);
  if (!match) return branch;
  return `${match[1]}/${match[2]}-${match[3]}`;
}

function formatJjChangeId(ctx: SegmentContext, changeId: string, prefixLen = 1): string {
  const safePrefixLen = Math.max(1, Math.min(prefixLen, changeId.length));
  const prefix = changeId.slice(0, safePrefixLen);
  const rest = changeId.slice(safePrefixLen);

  if (!rest) {
    return color(ctx, "vcs", prefix);
  }

  return `${color(ctx, "vcs", prefix)}${ctx.theme.fg("dim", rest)}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

const PI_ICON_COLOR = "#f5a97f" as const;

const piSegment: StatusLineSegment = {
  id: "pi",
  render(ctx) {
    const icons = getIcons();
    if (!icons.pi) return { content: "", visible: false };
    return { content: applyColor(ctx.theme, PI_ICON_COLOR, `${icons.pi} `), visible: true };
  },
};

const modelSegment: StatusLineSegment = {
  id: "model",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    let modelName = getModelDisplayName(ctx.model, "no-model");
    if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }

    let content = withIcon(icons.model, modelName);

    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        const thinkingText = getThinkingText(level);
        if (thinkingText) {
          const levelColor = THINKING_COLORS[level] ?? "thinkingOff";
          content += `${SEP_DOT}${ctx.theme.fg(levelColor, thinkingText)}`;
        }
      }
    }

    return { content: color(ctx, "model", content), visible: true };
  },
};

const pathSegment: StatusLineSegment = {
  id: "path",
  render(ctx) {
    const opts = ctx.options.path ?? {};
    const mode = opts.mode ?? "basename";

    let pwd = process.cwd();
    const home = getHomeDir();

    if (mode === "basename") {
      pwd = basename(pwd) || pwd;
    } else {
      // Match lualine-like human formatting: home-relative with ~ prefix
      pwd = toHomeRelativePath(pwd, home);

      if (mode === "abbreviated") {
        const maxLen = opts.maxLength ?? 40;
        if (pwd.length > maxLen) {
          pwd = `…${pwd.slice(-(maxLen - 1))}`;
        }
      }
    }

    return { content: color(ctx, "path", pwd), visible: true };
  },
};

const VCS_ICON_COLOR = "#8aadf4" as const;

const vcsSegment: StatusLineSegment = {
  id: "vcs",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.vcs ?? {};
    const { branch, staged, unstaged, untracked, vcsType, jjChangeId, jjChangeIdPrefixLength } = ctx.vcs;
    const truncatedBranch = truncateBranchName(branch) || branch;

    const iconPrefix = (icon: string): string => {
      if (!icon) return "";
      return `${applyColor(ctx.theme, VCS_ICON_COLOR, icon)} `;
    };

    if (vcsType === "jj") {
      if (!truncatedBranch && !jjChangeId) return { content: "", visible: false };

      const pieces: string[] = [];
      if (jjChangeId) {
        pieces.push(formatJjChangeId(ctx, jjChangeId, jjChangeIdPrefixLength ?? jjChangeId.length));
      }
      if (truncatedBranch) {
        pieces.push(color(ctx, "vcsClean", `(${truncatedBranch})`));
      }

      return {
        content: `${iconPrefix(icons.jj)}${pieces.join(" ")}`.trim(),
        visible: true,
      };
    }

    const vcsStatus = (staged > 0 || unstaged > 0 || untracked > 0)
      ? { staged, unstaged, untracked }
      : null;

    if (!truncatedBranch && !vcsStatus) return { content: "", visible: false };

    const isDirty = !!vcsStatus && (vcsStatus.staged > 0 || vcsStatus.unstaged > 0 || vcsStatus.untracked > 0);
    const showBranch = opts.showBranch !== false;
    const branchColor: SemanticColor = isDirty ? "vcsDirty" : "vcs";

    let content = "";
    if (showBranch && truncatedBranch) {
      content = `${iconPrefix(icons.vcs)}${color(ctx, branchColor, truncatedBranch)}`.trim();
    }

    if (vcsStatus) {
      const indicators: string[] = [];
      if (opts.showUnstaged !== false && vcsStatus.unstaged > 0) {
        indicators.push(applyColor(ctx.theme, "warning", `*${vcsStatus.unstaged}`));
      }
      if (opts.showStaged !== false && vcsStatus.staged > 0) {
        indicators.push(applyColor(ctx.theme, "success", `+${vcsStatus.staged}`));
      }
      if (opts.showUntracked !== false && vcsStatus.untracked > 0) {
        indicators.push(applyColor(ctx.theme, "muted", `?${vcsStatus.untracked}`));
      }
      if (indicators.length > 0) {
        const indicatorText = indicators.join(" ");
        if (!content) {
          content = `${iconPrefix(icons.vcs)}${indicatorText}`.trim();
        } else {
          content += ` ${indicatorText}`;
        }
      }
    }

    if (!content) return { content: "", visible: false };
    return { content, visible: true };
  },
};

const THINKING_COLORS: Record<string, ThemeColor> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
};

const thinkingSegment: StatusLineSegment = {
  id: "thinking",
  render(ctx) {
    const level = ctx.thinkingLevel || "off";
    const levelColor = THINKING_COLORS[level] ?? "thinkingOff";
    const thinkingText = getThinkingText(level) ?? "off";

    return {
      content: ctx.theme.fg(levelColor, `think:${thinkingText}`),
      visible: true,
    };
  },
};

const subagentsSegment: StatusLineSegment = {
  id: "subagents",
  render() {
    return { content: "", visible: false };
  },
};

const tokenInSegment: StatusLineSegment = {
  id: "token_in",
  render(ctx) {
    const icons = getIcons();
    const { input } = ctx.usageStats;
    if (!input) return { content: "", visible: false };

    return { content: color(ctx, "tokens", withIcon(icons.input, formatTokens(input))), visible: true };
  },
};

const tokenOutSegment: StatusLineSegment = {
  id: "token_out",
  render(ctx) {
    const icons = getIcons();
    const { output } = ctx.usageStats;
    if (!output) return { content: "", visible: false };

    return { content: color(ctx, "tokens", withIcon(icons.output, formatTokens(output))), visible: true };
  },
};

const tokenTotalSegment: StatusLineSegment = {
  id: "token_total",
  render(ctx) {
    const icons = getIcons();
    const { input, output, cacheRead, cacheWrite } = ctx.usageStats;
    const total = input + output + cacheRead + cacheWrite;
    if (!total) return { content: "", visible: false };

    return { content: color(ctx, "tokens", withIcon(icons.tokens, formatTokens(total))), visible: true };
  },
};

const costSegment: StatusLineSegment = {
  id: "cost",
  render(ctx) {
    const { cost } = ctx.usageStats;

    // Subscription sessions often report $0.00; hide instead of showing "(sub)".
    if (!cost || ctx.usingSubscription) return { content: "", visible: false };

    return { content: color(ctx, "cost", `$${cost.toFixed(2)}`), visible: true };
  },
};

const CONTEXT_YELLOW = "#eed49f" as const; // Catppuccin Macchiato Yellow
const CONTEXT_ORANGE = "#f5a97f" as const; // Catppuccin Macchiato Peach
const CONTEXT_RED = "#ed8796" as const;    // Catppuccin Macchiato Red

const contextPctSegment: StatusLineSegment = {
  id: "context_pct",
  render(ctx) {
    const icons = getIcons();
    const pct = ctx.contextPercent;
    const window = ctx.contextWindow;

    const autoIcon = ctx.autoCompactEnabled && icons.auto ? ` ${icons.auto}` : "";
    const displayPct = Number(pct.toFixed(1));
    const text = `${displayPct.toFixed(1)}%/${formatTokens(window)}${autoIcon}`;

    let coloredText: string;
    let coloredContextIcon: string;

    if (displayPct >= 70) {
      coloredText = applyColor(ctx.theme, CONTEXT_RED, text);
      coloredContextIcon = icons.context ? applyColor(ctx.theme, CONTEXT_RED, icons.context) : "";
    } else if (displayPct >= 60) {
      coloredText = applyColor(ctx.theme, CONTEXT_ORANGE, text);
      coloredContextIcon = icons.context ? applyColor(ctx.theme, CONTEXT_ORANGE, icons.context) : "";
    } else if (displayPct >= 50) {
      coloredText = applyColor(ctx.theme, CONTEXT_YELLOW, text);
      coloredContextIcon = icons.context ? applyColor(ctx.theme, CONTEXT_YELLOW, icons.context) : "";
    } else {
      coloredText = color(ctx, "context", text);
      coloredContextIcon = icons.context ? color(ctx, "context", icons.context) : "";
    }

    const content = coloredContextIcon ? `${coloredContextIcon} ${coloredText}` : coloredText;
    return { content, visible: true };
  },
};

const contextTotalSegment: StatusLineSegment = {
  id: "context_total",
  render(ctx) {
    const icons = getIcons();
    const window = ctx.contextWindow;
    if (!window) return { content: "", visible: false };

    return {
      content: color(ctx, "context", withIcon(icons.context, formatTokens(window))),
      visible: true,
    };
  },
};

const timeSpentSegment: StatusLineSegment = {
  id: "time_spent",
  render(ctx) {
    const icons = getIcons();
    const elapsed = Date.now() - ctx.sessionStartTime;
    if (elapsed < 1000) return { content: "", visible: false };

    return { content: withIcon(icons.time, formatDuration(elapsed)), visible: true };
  },
};

const timeSegment: StatusLineSegment = {
  id: "time",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.time ?? {};
    const now = new Date();

    let hours = now.getHours();
    let suffix = "";
    if (opts.format === "12h") {
      suffix = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
    }

    const mins = now.getMinutes().toString().padStart(2, "0");
    let timeStr = `${hours}:${mins}`;
    if (opts.showSeconds) {
      timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
    }
    timeStr += suffix;

    return { content: withIcon(icons.time, timeStr), visible: true };
  },
};

const sessionSegment: StatusLineSegment = {
  id: "session",
  render(ctx) {
    const icons = getIcons();
    const sessionId = ctx.sessionId;
    const display = sessionId?.slice(0, 8) || "new";

    return { content: withIcon(icons.session, display), visible: true };
  },
};

const hostnameSegment: StatusLineSegment = {
  id: "hostname",
  render() {
    const icons = getIcons();
    const name = osHostname().split(".")[0];
    return { content: withIcon(icons.host, name), visible: true };
  },
};

const cacheReadSegment: StatusLineSegment = {
  id: "cache_read",
  render(ctx) {
    const icons = getIcons();
    const { cacheRead } = ctx.usageStats;
    if (!cacheRead) return { content: "", visible: false };

    const parts = [icons.cache, icons.input, formatTokens(cacheRead)].filter(Boolean);
    return { content: color(ctx, "tokens", parts.join(" ")), visible: true };
  },
};

const cacheWriteSegment: StatusLineSegment = {
  id: "cache_write",
  render(ctx) {
    const icons = getIcons();
    const { cacheWrite } = ctx.usageStats;
    if (!cacheWrite) return { content: "", visible: false };

    const parts = [icons.cache, icons.output, formatTokens(cacheWrite)].filter(Boolean);
    return { content: color(ctx, "tokens", parts.join(" ")), visible: true };
  },
};

const extensionStatusesSegment: StatusLineSegment = {
  id: "extension_statuses",
  render(ctx) {
    const statuses = ctx.extensionStatuses;
    if (!statuses || statuses.size === 0) return { content: "", visible: false };

    const parts: string[] = [];
    for (const [statusKey, value] of statuses.entries()) {
      if (!value || shouldHideExtensionStatus(statusKey, value)) continue;
      if (!value.trimStart().startsWith("[")) {
        parts.push(value);
      }
    }

    if (parts.length === 0) return { content: "", visible: false };

    return { content: parts.join(` ${SEP_DOT} `), visible: true };
  },
};

export const SEGMENTS: Record<StatusLineSegmentId, StatusLineSegment> = {
  pi: piSegment,
  model: modelSegment,
  path: pathSegment,
  vcs: vcsSegment,
  thinking: thinkingSegment,
  subagents: subagentsSegment,
  token_in: tokenInSegment,
  token_out: tokenOutSegment,
  token_total: tokenTotalSegment,
  cost: costSegment,
  context_pct: contextPctSegment,
  context_total: contextTotalSegment,
  time_spent: timeSpentSegment,
  time: timeSegment,
  session: sessionSegment,
  hostname: hostnameSegment,
  cache_read: cacheReadSegment,
  cache_write: cacheWriteSegment,
  extension_statuses: extensionStatusesSegment,
};

export function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment {
  const segment = SEGMENTS[id];
  if (!segment) {
    return { content: "", visible: false };
  }
  return segment.render(ctx);
}
