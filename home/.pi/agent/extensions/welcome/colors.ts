// ANSI escape codes for colors
// Catppuccin-macchiato leaning palette (fallbacks for welcome/aux UI)

export interface AnsiColors {
  getBgAnsi(r: number, g: number, b: number): string;
  getFgAnsi(r: number, g: number, b: number): string;
  getFgAnsi256(code: number): string;
  reset: string;
}

export const ansi: AnsiColors = {
  getBgAnsi: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
  getFgAnsi: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  getFgAnsi256: (code) => `\x1b[38;5;${code}m`,
  reset: "\x1b[0m",
};

// Convert hex to RGB tuple
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Catppuccin-macchiato-ish colors (used when theme context isn't available)
const THEME = {
  // Status line colors
  sep: "#6e738d",                     // macOverlay0
  model: "#f5bde6",                   // macPink
  path: "#8bd5ca",                    // macTeal
  gitClean: "#a6da95",                // macGreen
  gitDirty: "#eed49f",                // macYellow
  context: "#8aadf4",                 // macBlue
  spend: "#f5a97f",                   // macPeach
  staged: "#a6da95",
  unstaged: "#eed49f",
  untracked: "#91d7e3",               // macSky
  output: "#f5bde6",
  cost: "#eed49f",
  subagents: "#f5a97f",

  // UI colors
  accent: "#8aadf4",                  // macBlue
  border: "#8aadf4",                  // macBlue
  warning: "#eed49f",                 // macYellow
  error: "#ed8796",                   // macRed
  text: "",                           // Default terminal color

  // Thinking level colors
  thinkingOff: "#5b6078",             // macSurface2
  thinkingMinimal: "#6e738d",         // macOverlay0
  thinkingLow: "#8aadf4",             // macBlue
  thinkingMedium: "#8bd5ca",          // macTeal
  thinkingHigh: "#c6a0f6",            // macMauve
  thinkingXhigh: "#ed8796",           // macRed
};

// Color name to ANSI code mapping
type ColorName = 
  | "sep" | "model" | "path" | "gitClean" | "gitDirty" 
  | "context" | "spend" | "staged" | "unstaged" | "untracked"
  | "output" | "cost" | "subagents" | "accent" | "border"
  | "warning" | "error" | "text"
  | "thinkingOff" | "thinkingMinimal" | "thinkingLow" 
  | "thinkingMedium" | "thinkingHigh" | "thinkingXhigh";

function getAnsiCode(color: ColorName): string {
  const value = THEME[color as keyof typeof THEME];
  
  if (value === undefined || value === "") {
    return ""; // No color, use terminal default
  }
  
  if (typeof value === "number") {
    return ansi.getFgAnsi256(value);
  }
  
  if (typeof value === "string" && value.startsWith("#")) {
    const [r, g, b] = hexToRgb(value);
    return ansi.getFgAnsi(r, g, b);
  }
  
  return "";
}

// Helper to apply foreground color only (no reset - caller manages reset)
export function fgOnly(color: ColorName, text: string): string {
  const code = getAnsiCode(color);
  return code ? `${code}${text}` : text;
}

// Get raw ANSI foreground ANSI code for a color
export function getFgAnsiCode(color: ColorName): string {
  return getAnsiCode(color);
}


