#!/usr/bin/env bun
/**
 * find-agent-md-files.ts - Find all AGENTS.md and CLAUDE.md files with metadata
 *
 * Usage: bun run find-agent-md-files.ts [path]
 *
 * Output: JSON with file paths and extracted metadata
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { shouldExclude, directoryExists, outputJson, exitError } from "./lib";

interface AgentFile {
  path: string;
  type: "AGENTS" | "CLAUDE";
  commit?: string;
  generated?: string;
  branch?: string;
}

interface FindAgentsOutput {
  root: string;
  files: AgentFile[];
}

const METADATA_PATTERNS = {
  commit: /\*\*Commit:\*\*\s*`?([a-f0-9]+)`?/i,
  generated: /\*\*Generated:\*\*\s*(\S+)/i,
  branch: /\*\*Branch:\*\*\s*`?([^\s`]+)`?/i,
};

async function extractMetadata(
  filePath: string
): Promise<Omit<AgentFile, "path" | "type">> {
  const metadata: Omit<AgentFile, "path" | "type"> = {};

  try {
    const file = Bun.file(filePath);
    const content = await file.text();
    // Only check first 500 chars for metadata (it's at the top)
    const head = content.slice(0, 500);

    const commitMatch = head.match(METADATA_PATTERNS.commit);
    if (commitMatch?.[1]) metadata.commit = commitMatch[1];

    const generatedMatch = head.match(METADATA_PATTERNS.generated);
    if (generatedMatch?.[1]) metadata.generated = generatedMatch[1];

    const branchMatch = head.match(METADATA_PATTERNS.branch);
    if (branchMatch?.[1]) metadata.branch = branchMatch[1];
  } catch {
    // Can't read file, return empty metadata
  }

  return metadata;
}

async function findAgentFiles(
  dir: string,
  root: string,
  results: AgentFile[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!shouldExclude(entry.name)) {
        await findAgentFiles(join(dir, entry.name), root, results);
      }
    } else if (entry.isFile()) {
      const name = entry.name;
      if (name === "AGENTS.md" || name === "CLAUDE.md") {
        const fullPath = join(dir, name);
        const relativePath = fullPath.slice(root.length + 1) || name;
        const metadata = await extractMetadata(fullPath);

        results.push({
          path: relativePath,
          type: name === "AGENTS.md" ? "AGENTS" : "CLAUDE",
          ...metadata,
        });
      }
    }
  }
}

async function main(): Promise<void> {
  const root = process.argv[2] ?? ".";

  if (!(await directoryExists(root))) {
    exitError(`Directory not found: ${root}`);
  }

  const { resolve } = await import("node:path");
  const resolvedRoot = resolve(root);

  const files: AgentFile[] = [];
  await findAgentFiles(resolvedRoot, resolvedRoot, files);

  // Sort by path depth (root first, then alphabetically)
  files.sort((a, b) => {
    const depthA = a.path.split("/").length;
    const depthB = b.path.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.path.localeCompare(b.path);
  });

  const output: FindAgentsOutput = {
    root,
    files,
  };

  outputJson(output);
}

main().catch((err) => exitError(err.message));
