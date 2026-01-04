#!/usr/bin/env bun
/**
 * diff-changes-since-sync.ts - Get structured diff data since last AGENTS.md sync
 *
 * Usage: bun run diff-changes-since-sync.ts <path> <commit>
 *
 * Output: JSON with changes grouped by directory
 */

import { resolve } from "node:path";
import { git, directoryExists, outputJson, exitError } from "./lib";

interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  insertions: number;
  deletions: number;
}

interface DirectoryChanges {
  path: string;
  files: FileChange[];
}

interface DiffOutput {
  root: string;
  baseCommit: string;
  headCommit: string;
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    commitCount: number;
  };
  byDirectory: DirectoryChanges[];
}

function parseStatus(status: string): FileChange["status"] {
  switch (status) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
    case "R100":
      return "renamed";
    default:
      return "modified";
  }
}

async function main(): Promise<void> {
  const root = process.argv[2];
  const baseCommit = process.argv[3];

  if (!root || !baseCommit) {
    exitError("Usage: diff-changes-since-sync.ts <path> <commit>");
  }

  if (!(await directoryExists(root))) {
    exitError(`Directory not found: ${root}`);
  }

  const resolvedRoot = resolve(root);

  // Get current HEAD commit
  const { stdout: headCommit, exitCode: headExitCode } = await git(
    ["rev-parse", "--short", "HEAD"],
    resolvedRoot
  );
  if (headExitCode !== 0) {
    exitError("Not a git repository or git not available");
  }

  // Verify base commit exists
  const { exitCode: verifyExitCode } = await git(
    ["cat-file", "-t", baseCommit],
    resolvedRoot
  );
  if (verifyExitCode !== 0) {
    exitError(`Commit not found: ${baseCommit}`);
  }

  // Get commit count
  const { stdout: commitCountStr } = await git(
    ["rev-list", "--count", `${baseCommit}..HEAD`],
    resolvedRoot
  );
  const commitCount = parseInt(commitCountStr, 10) || 0;

  // Get diff stats with --numstat for insertions/deletions
  const { stdout: numstatOutput } = await git(
    ["diff", "--numstat", `${baseCommit}..HEAD`],
    resolvedRoot
  );

  // Get file statuses
  const { stdout: nameStatusOutput } = await git(
    ["diff", "--name-status", `${baseCommit}..HEAD`],
    resolvedRoot
  );

  // Parse numstat (insertions, deletions, path)
  const numstatMap = new Map<string, { insertions: number; deletions: number }>();
  for (const line of numstatOutput.split("\n")) {
    if (!line.trim()) continue;
    const [ins, del, path] = line.split("\t");
    if (path) {
      numstatMap.set(path, {
        insertions: ins === "-" ? 0 : parseInt(ins, 10) || 0,
        deletions: del === "-" ? 0 : parseInt(del, 10) || 0,
      });
    }
  }

  // Parse name-status
  const fileChanges: FileChange[] = [];
  for (const line of nameStatusOutput.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0];
    // For renames, path is in parts[2], otherwise parts[1]
    const path = status?.startsWith("R") ? parts[2] : parts[1];
    if (!path) continue;

    const stats = numstatMap.get(path) ?? { insertions: 0, deletions: 0 };
    fileChanges.push({
      path,
      status: parseStatus(status ?? "M"),
      insertions: stats.insertions,
      deletions: stats.deletions,
    });
  }

  // Group by directory
  const dirMap = new Map<string, FileChange[]>();
  for (const change of fileChanges) {
    const dir = change.path.includes("/")
      ? change.path.substring(0, change.path.lastIndexOf("/"))
      : ".";
    if (!dirMap.has(dir)) {
      dirMap.set(dir, []);
    }
    dirMap.get(dir)?.push(change);
  }

  // Sort directories by path
  const byDirectory: DirectoryChanges[] = [...dirMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, files]) => ({ path, files }));

  // Calculate summary
  const summary = {
    filesChanged: fileChanges.length,
    insertions: fileChanges.reduce((sum, f) => sum + f.insertions, 0),
    deletions: fileChanges.reduce((sum, f) => sum + f.deletions, 0),
    commitCount,
  };

  const output: DiffOutput = {
    root,
    baseCommit,
    headCommit,
    summary,
    byDirectory,
  };

  outputJson(output);
}

main().catch((err) => exitError(err.message));
