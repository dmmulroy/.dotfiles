export function shouldHideExtensionStatus(statusKey: string, value: string): boolean {
  const normalizedKey = statusKey.toLowerCase();
  const normalizedValue = value.trimStart().toLowerCase();
  return normalizedKey.includes("mcp") || normalizedValue.startsWith("mcp:");
}

export function isBracketStatusLine(value: string): boolean {
  return value.trimStart().startsWith("[");
}
