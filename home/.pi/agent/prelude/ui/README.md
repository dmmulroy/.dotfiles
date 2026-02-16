# UI helpers

Reusable ANSI/TUI helpers for local extensions.

## Modules

- `ansi.ts`
  - `ansiBold(text, { fullReset? })`
  - `ansiDim(text, { fullReset? })`
  - `ansiColor(text, colorCode, { fullReset? })`
- `layout.ts`
  - `truncateAnsiToWidth(str, width, ellipsis?)`
  - `fitAnsiToWidth(str, width)`
  - `centerAnsiText(text, width)`
  - `padRightVisible(text, width)`
- `box.ts`
  - `borderLine(boxWidth, left, right, border, horizontal?)`
  - `contentLine(content, boxWidth, border, leftPad?)`
  - `emptyLine(boxWidth, border)`
