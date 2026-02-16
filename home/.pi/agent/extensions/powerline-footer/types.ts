import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";

// Theme color - either a pi theme color name or a custom hex color
export type ColorValue = ThemeColor | `#${string}`;

// Semantic color names for segments
export type SemanticColor =
  | "pi"
  | "model"
  | "path"
  | "vcs"
  | "vcsDirty"
  | "vcsClean"
  | "thinking"
  | "thinkingHigh"
  | "context"
  | "contextWarn"
  | "contextError"
  | "cost"
  | "tokens"
  | "separator"
  | "border";

// Color scheme mapping semantic names to actual colors
export type ColorScheme = Partial<Record<SemanticColor, ColorValue>>;

// Segment identifiers
export type StatusLineSegmentId =
  | "pi"
  | "model"
  | "path"
  | "vcs"
  | "subagents"
  | "token_in"
  | "token_out"
  | "token_total"
  | "cost"
  | "context_pct"
  | "context_total"
  | "time_spent"
  | "time"
  | "session"
  | "hostname"
  | "cache_read"
  | "cache_write"
  | "thinking"
  | "extension_statuses";

// Separator styles
export type StatusLineSeparatorStyle =
  | "powerline"
  | "powerline-thin"
  | "slash"
  | "pipe"
  | "block"
  | "none"
  | "ascii"
  | "dot"
  | "chevron"
  | "star";

// Per-segment options
export interface StatusLineSegmentOptions {
  model?: { showThinkingLevel?: boolean };
  path?: {
    mode?: "basename" | "abbreviated" | "full";
    maxLength?: number;
  };
  vcs?: { showBranch?: boolean; showStaged?: boolean; showUnstaged?: boolean; showUntracked?: boolean };
  time?: { format?: "12h" | "24h"; showSeconds?: boolean };
}

// Separator definition
export interface SeparatorDef {
  left: string;
  right: string;
  endCaps?: {
    left: string;
    right: string;
    useBgAsFg: boolean;
  };
}

export type VcsType = "git" | "jj" | null;

// VCS status data
export interface VcsStatus {
  vcsType: VcsType;
  branch: string | null;
  /** JJ change id, shortened for display (e.g. 8 chars) */
  jjChangeId?: string;
  /** Prefix length within jjChangeId to highlight (jj log-style) */
  jjChangeIdPrefixLength?: number;
  staged: number;
  unstaged: number;
  untracked: number;
}

// Usage statistics
export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

// Context passed to segment render functions
export interface SegmentContext {
  // From pi-mono
  model: { id: string; name?: string; reasoning?: boolean; contextWindow?: number } | undefined;
  thinkingLevel: string;
  sessionId: string | undefined;

  // Computed
  usageStats: UsageStats;
  contextPercent: number;
  contextWindow: number;
  autoCompactEnabled: boolean;
  usingSubscription: boolean;
  sessionStartTime: number;

  // VCS
  vcs: VcsStatus;

  // Extension statuses
  extensionStatuses: ReadonlyMap<string, string>;

  // Options
  options: StatusLineSegmentOptions;

  // Theming
  theme: Theme;
  colors: ColorScheme;
}

// Rendered segment output
export interface RenderedSegment {
  content: string;
  visible: boolean;
}

// Segment definition
export interface StatusLineSegment {
  id: StatusLineSegmentId;
  render(ctx: SegmentContext): RenderedSegment;
}
