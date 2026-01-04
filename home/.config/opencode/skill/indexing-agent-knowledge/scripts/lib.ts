/**
 * Shared utilities for intent-capture scripts
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "bun";

/**
 * Check if path should be excluded (node_modules, .git, etc.)
 */
export function shouldExclude(name: string): boolean {
  const EXCLUDE = new Set([
    "node_modules",
    ".git",
    "venv",
    ".venv",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".cache",
    "coverage",
    ".nyc_output",
    "target",
    "vendor",
  ]);
  return EXCLUDE.has(name) || name.startsWith(".");
}

/**
 * Check if directory exists
 */
export async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get gitignore patterns for a directory
 */
export async function getGitignorePatterns(root: string): Promise<Set<string>> {
  const patterns = new Set<string>();
  try {
    const gitignorePath = join(root, ".gitignore");
    const file = Bun.file(gitignorePath);
    const content = await file.text();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        patterns.add(trimmed);
      }
    }
  } catch {
    // No .gitignore or can't read it
  }
  return patterns;
}

/**
 * Check if path matches any gitignore pattern (simple glob matching)
 */
export function matchesGitignore(path: string, patterns: Set<string>): boolean {
  for (const pattern of patterns) {
    // Handle trailing slash (directory pattern)
    const cleanPattern = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;

    // Exact match
    if (path === cleanPattern) {
      return true;
    }

    // Directory prefix match
    if (path.startsWith(cleanPattern + "/")) {
      return true;
    }

    // Handle * wildcards
    if (cleanPattern.includes("*")) {
      const regex = new RegExp(
        "^" + cleanPattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      if (regex.test(path) || regex.test(path.split("/").pop() ?? "")) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Run a git command and return stdout
 */
export async function git(
  args: string[],
  cwd: string
): Promise<{ stdout: string; exitCode: number }> {
  const proc = spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  return { stdout: stdout.trim(), exitCode };
}

/**
 * Output JSON to stdout
 */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Exit with error
 */
export function exitError(message: string): never {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}
