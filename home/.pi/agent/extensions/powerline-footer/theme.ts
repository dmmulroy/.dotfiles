/**
 * Static theme helpers for powerline-footer.
 *
 * Colors are resolved in order:
 * 1. Extension-provided preset colors
 * 2. Built-in defaults
 *
 * No file-based runtime overrides.
 */

import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
import type { ColorScheme, ColorValue, SemanticColor } from "./types.js";

const DEFAULT_COLORS = Object.freeze({
  pi: "#c6a0f6",
  model: "customMessageLabel",
  path: "#8bd5ca",
  vcs: "#f5bde6",
  vcsDirty: "#eed49f",
  vcsClean: "#a6da95",
  thinking: "muted",
  thinkingHigh: "thinkingHigh",
  context: "dim",
  contextWarn: "warning",
  contextError: "error",
  cost: "warning",
  tokens: "muted",
  separator: "borderMuted",
  border: "borderAccent",
}) satisfies Required<ColorScheme>;

export function resolveColor(semantic: SemanticColor, presetColors?: ColorScheme): ColorValue {
  return presetColors?.[semantic] ?? DEFAULT_COLORS[semantic];
}

function isHexColor(color: ColorValue): color is `#${string}` {
  return typeof color === "string" && color.startsWith("#");
}

function hexToAnsi(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function applyColor(theme: Theme, color: ColorValue, text: string): string {
  if (isHexColor(color)) {
    return `${hexToAnsi(color)}${text}\x1b[0m`;
  }
  return theme.fg(color as ThemeColor, text);
}

export function fg(theme: Theme, semantic: SemanticColor, text: string, presetColors?: ColorScheme): string {
  const color = resolveColor(semantic, presetColors);
  return applyColor(theme, color, text);
}

export function getDefaultColors(): Required<ColorScheme> {
  return DEFAULT_COLORS;
}
