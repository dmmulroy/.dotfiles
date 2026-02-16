import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export function createTempDir(prefix = "pi-lsp-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

export function withTempHome<T>(homeDir: string, fn: () => T): T {
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return fn();
  } finally {
    process.env.HOME = previousHome;
  }
}

export async function withTempHomeAsync<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return await fn();
  } finally {
    process.env.HOME = previousHome;
  }
}

export function createGlobalConfig(homeDir: string, config: unknown): string {
  const path = join(homeDir, ".pi", "agent", "lsp.json");
  writeJson(path, config);
  return path;
}

export function createProjectConfig(workspaceDir: string, config: unknown): string {
  const path = join(workspaceDir, ".pi", "lsp.json");
  writeJson(path, config);
  return path;
}

export function fixturePath(relativePath: string): string {
  return resolve(import.meta.dir, "fixtures", relativePath);
}

export function createSymlink(linkPath: string, targetPath: string): void {
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(targetPath, linkPath);
}
