export interface AnsiStyleOptions {
  fullReset?: boolean;
}

function wrap(text: string, open: string, close: string): string {
  return `${open}${text}${close}`;
}

export function ansiBold(text: string, options: AnsiStyleOptions = {}): string {
  return wrap(text, "\x1b[1m", options.fullReset ? "\x1b[0m" : "\x1b[22m");
}

export function ansiDim(text: string, options: AnsiStyleOptions = {}): string {
  return wrap(text, "\x1b[2m", options.fullReset ? "\x1b[0m" : "\x1b[22m");
}

export function ansiColor(text: string, colorCode: number, options: AnsiStyleOptions = { fullReset: true }): string {
  return wrap(text, `\x1b[${colorCode}m`, options.fullReset ? "\x1b[0m" : "\x1b[39m");
}
