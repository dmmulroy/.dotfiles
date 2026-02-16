export function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "";
}

export function toHomeRelativePath(path: string, homeDir: string = getHomeDir()): string {
  if (!homeDir) return path;
  if (!path.startsWith(homeDir)) return path;
  return `~${path.slice(homeDir.length)}`;
}
