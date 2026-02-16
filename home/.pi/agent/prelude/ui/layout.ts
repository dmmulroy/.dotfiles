import { visibleWidth } from "@mariozechner/pi-tui";

export function truncateAnsiToWidth(str: string, width: number, ellipsis = "…"): string {
  const maxWidth = Math.max(0, width - visibleWidth(ellipsis));
  let truncated = "";
  let currentWidth = 0;
  let inEscape = false;

  for (const char of str) {
    if (char === "\x1b") inEscape = true;

    if (inEscape) {
      truncated += char;
      if (char === "m") inEscape = false;
      continue;
    }

    if (currentWidth < maxWidth) {
      truncated += char;
      currentWidth++;
      continue;
    }

    break;
  }

  if (visibleWidth(str) > width) return truncated + ellipsis;
  return truncated;
}

export function fitAnsiToWidth(str: string, width: number): string {
  const visLen = visibleWidth(str);
  if (visLen > width) return truncateAnsiToWidth(str, width);
  return str + " ".repeat(width - visLen);
}

export function centerAnsiText(text: string, width: number): string {
  const visLen = visibleWidth(text);
  if (visLen > width) return truncateAnsiToWidth(text, width);
  if (visLen === width) return text;

  const leftPad = Math.floor((width - visLen) / 2);
  const rightPad = width - visLen - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

export function padRightVisible(text: string, width: number): string {
  const len = visibleWidth(text);
  return text + " ".repeat(Math.max(0, width - len));
}
