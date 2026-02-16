export interface IconSet {
  pi: string;
  model: string;
  folder: string;
  jj: string;
  vcs: string;
  tokens: string;
  context: string;
  cost: string;
  time: string;
  agents: string;
  cache: string;
  input: string;
  output: string;
  host: string;
  session: string;
  auto: string;
  warning: string;
}

// Separator characters
export const SEP_DOT = " · ";

// Thinking level display text (plain text only)
export const THINKING_TEXT_UNICODE: Record<string, string> = {
  off: "off",
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
  xhigh: "xhigh",
};

// Keep same labels for Nerd Fonts (no icon prefixes)
export const THINKING_TEXT_NERD: Record<string, string> = {
  ...THINKING_TEXT_UNICODE,
};

// Get thinking text based on font support
export function getThinkingText(level: string): string | undefined {
  if (hasNerdFonts()) {
    return THINKING_TEXT_NERD[level];
  }
  return THINKING_TEXT_UNICODE[level];
}

// Nerd Font icons (aligned with jj-starship defaults)
export const NERD_ICONS: IconSet = {
  pi: "\uE22C",
  model: "\uEC19",
  folder: "\uF115",
  jj: "󱗆",
  vcs: "",
  tokens: "\uE26B",
  context: "󰀁",
  cost: "\uF155",
  time: "\uF017",
  agents: "\uF0C0",
  cache: "\uF1C0",
  input: "\uF090",
  output: "\uF08B",
  host: "\uF109",
  session: "\uF550",
  auto: "\u{F0068}",
  warning: "\uF071",
};

// ASCII/Unicode fallback icons
export const ASCII_ICONS: IconSet = {
  pi: "π",
  model: "◈",
  folder: "📁",
  jj: "jj",
  vcs: "git",
  tokens: "⊛",
  context: "▣",
  cost: "$",
  time: "◷",
  agents: "AG",
  cache: "cache",
  input: "in:",
  output: "out:",
  host: "host",
  session: "id",
  auto: "⚡",
  warning: "⚠",
};

// Separator characters
export interface SeparatorChars {
  powerlineLeft: string;
  powerlineRight: string;
  powerlineThinLeft: string;
  powerlineThinRight: string;
  slash: string;
  pipe: string;
  block: string;
  space: string;
  asciiLeft: string;
  asciiRight: string;
  dot: string;
}

export const NERD_SEPARATORS: SeparatorChars = {
  powerlineLeft: "\uE0B0",
  powerlineRight: "\uE0B2",
  powerlineThinLeft: "\uE0B1",
  powerlineThinRight: "\uE0B3",
  slash: "/",
  pipe: "|",
  block: "█",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: "·",
};

export const ASCII_SEPARATORS: SeparatorChars = {
  powerlineLeft: ">",
  powerlineRight: "<",
  powerlineThinLeft: "|",
  powerlineThinRight: "|",
  slash: "/",
  pipe: "|",
  block: "#",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: ".",
};

// Detect Nerd Font support (check TERM or specific env var)
export function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === "1") return true;
  if (process.env.POWERLINE_NERD_FONTS === "0") return false;

  if (process.env.GHOSTTY_RESOURCES_DIR) return true;

  const term = (process.env.TERM_PROGRAM || "").toLowerCase();
  const nerdTerms = ["iterm", "wezterm", "kitty", "ghostty", "alacritty"];
  return nerdTerms.some((t) => term.includes(t));
}

export function getIcons(): IconSet {
  return hasNerdFonts() ? NERD_ICONS : ASCII_ICONS;
}

export function getSeparatorChars(): SeparatorChars {
  return hasNerdFonts() ? NERD_SEPARATORS : ASCII_SEPARATORS;
}
