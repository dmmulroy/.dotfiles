import { visibleWidth } from "@mariozechner/pi-tui";

export type BorderStyler = (s: string) => string;

export function borderLine(boxWidth: number, left: string, right: string, border: BorderStyler, horizontal = "─"): string {
  return border(left + horizontal.repeat(Math.max(0, boxWidth - 2)) + right);
}

export function contentLine(
  content: string,
  boxWidth: number,
  border: BorderStyler,
  leftPad = 2,
): string {
  const paddedContent = " ".repeat(leftPad) + content;
  const contentLen = visibleWidth(paddedContent);
  const rightPad = Math.max(0, boxWidth - contentLen - 2);
  return border("│") + paddedContent + " ".repeat(rightPad) + border("│");
}

export function emptyLine(boxWidth: number, border: BorderStyler): string {
  return border("│") + " ".repeat(Math.max(0, boxWidth - 2)) + border("│");
}
