#!/usr/bin/env bun
/**
 * map-directory-tree.ts - Map directory tree structure respecting .gitignore
 *
 * Usage: bun run map-directory-tree.ts <path> [maxDepth]
 *
 * Output: JSON tree structure
 */

import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  shouldExclude,
  directoryExists,
  getGitignorePatterns,
  matchesGitignore,
  outputJson,
  exitError,
} from "./lib";

interface TreeNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: TreeNode[];
  size?: number;
}

interface TreeOutput {
  root: string;
  tree: TreeNode;
}

async function buildTree(
  dir: string,
  rootPath: string,
  gitignorePatterns: Set<string>,
  maxDepth: number,
  currentDepth: number = 0
): Promise<TreeNode> {
  const name = dir === rootPath ? "." : dir.split("/").pop() ?? dir;
  const relativePath = dir === rootPath ? "." : dir.slice(rootPath.length + 1);

  const node: TreeNode = {
    name,
    type: "directory",
    path: relativePath,
  };

  if (currentDepth >= maxDepth) {
    return node;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return node;
  }

  const children: TreeNode[] = [];

  // Sort entries: directories first, then files, alphabetically
  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sortedEntries) {
    // Skip excluded directories
    if (shouldExclude(entry.name)) continue;

    const entryPath = join(dir, entry.name);
    const entryRelativePath = entryPath.slice(rootPath.length + 1);

    // Skip gitignored paths
    if (matchesGitignore(entryRelativePath, gitignorePatterns)) continue;
    if (matchesGitignore(entry.name, gitignorePatterns)) continue;

    if (entry.isDirectory()) {
      const childNode = await buildTree(
        entryPath,
        rootPath,
        gitignorePatterns,
        maxDepth,
        currentDepth + 1
      );
      children.push(childNode);
    } else if (entry.isFile()) {
      let size: number | undefined;
      try {
        const stats = await stat(entryPath);
        size = stats.size;
      } catch {
        // Can't stat file
      }

      children.push({
        name: entry.name,
        type: "file",
        path: entryRelativePath,
        size,
      });
    }
  }

  if (children.length > 0) {
    node.children = children;
  }

  return node;
}

async function main(): Promise<void> {
  const root = process.argv[2];
  const maxDepth = parseInt(process.argv[3] ?? "10", 10);

  if (!root) {
    exitError("Usage: map-directory-tree.ts <path> [maxDepth]");
  }

  if (!(await directoryExists(root))) {
    exitError(`Directory not found: ${root}`);
  }

  const resolvedRoot = resolve(root);
  const gitignorePatterns = await getGitignorePatterns(resolvedRoot);

  const tree = await buildTree(
    resolvedRoot,
    resolvedRoot,
    gitignorePatterns,
    maxDepth
  );

  const output: TreeOutput = {
    root,
    tree,
  };

  outputJson(output);
}

main().catch((err) => exitError(err.message));
