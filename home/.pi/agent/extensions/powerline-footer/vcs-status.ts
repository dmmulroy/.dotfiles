import { spawn } from "node:child_process";
import type { VcsStatus, VcsType } from "./types.js";

interface CachedVcsStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  timestamp: number;
}

interface CachedBranch {
  vcsType: VcsType;
  branch: string | null;
  jjChangeId?: string;
  jjChangeIdPrefixLength?: number;
  timestamp: number;
}

const JJ_TEMPLATE =
  'bookmarks.map(|b| b.name()).join(" ") ++ "\\n" ++ change_id.short(8) ++ "\\n" ++ change_id.shortest(1)';

const CACHE_TTL_MS = 1000;
const BRANCH_TTL_MS = 500;

let cachedStatus: CachedVcsStatus | null = null;
let cachedBranch: CachedBranch | null = null;

let pendingStatusFetch: Promise<void> | null = null;
let pendingBranchFetch: Promise<void> | null = null;

let statusInvalidationCounter = 0;
let branchInvalidationCounter = 0;

function parseGitStatusOutput(output: string): { staged: number; unstaged: number; untracked: number } {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of output.split("\n")) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];

    if (x === "?" && y === "?") {
      untracked++;
      continue;
    }

    if (x && x !== " " && x !== "?") staged++;
    if (y && y !== " ") unstaged++;
  }

  return { staged, unstaged, untracked };
}

function runCommand(command: string, args: string[], timeoutMs = 320): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let resolved = false;

    const finish = (result: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      finish(code === 0 ? stdout.trim() : null);
    });

    proc.on("error", () => {
      finish(null);
    });

    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(null);
    }, timeoutMs);
  });
}

async function fetchJjInfo(): Promise<{
  branch: string | null;
  jjChangeId?: string;
  jjChangeIdPrefixLength?: number;
} | null> {
  const root = await runCommand("jj", ["root"], 420);
  if (root === null) return null;

  const out = await runCommand("jj", ["log", "-r", "@", "--no-graph", "-T", JJ_TEMPLATE], 650);
  if (out === null) {
    return {
      branch: null,
      jjChangeId: "@",
      jjChangeIdPrefixLength: 1,
    };
  }

  const lines = out.replace(/\r\n/g, "\n").split("\n");
  const bookmarkLine = (lines[0] ?? "").trim();
  const shortChangeId = (lines[1] ?? "").trim();
  const shortestPrefix = (lines[2] ?? "").trim();

  const bookmark = bookmarkLine.split(/\s+/).filter(Boolean)[0] || null;

  if (!shortChangeId) {
    return {
      branch: bookmark,
      jjChangeId: undefined,
      jjChangeIdPrefixLength: undefined,
    };
  }

  const shortestPrefixLen = shortestPrefix.length > 0 ? shortestPrefix.length : shortChangeId.length;
  const prefixLen = Math.max(1, Math.min(shortChangeId.length, shortestPrefixLen));

  return {
    branch: bookmark,
    jjChangeId: shortChangeId,
    jjChangeIdPrefixLength: prefixLen,
  };
}

async function fetchGitBranch(): Promise<string | null> {
  const branch = await runCommand("git", ["branch", "--show-current"]);
  if (branch === null) return null;
  if (branch) return branch;

  const sha = await runCommand("git", ["rev-parse", "--short", "HEAD"]);
  return sha ? `${sha} (detached)` : "detached";
}

async function fetchPreferredBranch(): Promise<{
  vcsType: VcsType;
  branch: string | null;
  jjChangeId?: string;
  jjChangeIdPrefixLength?: number;
}> {
  const jjInfo = await fetchJjInfo();
  if (jjInfo !== null) {
    return {
      vcsType: "jj",
      branch: jjInfo.branch,
      jjChangeId: jjInfo.jjChangeId,
      jjChangeIdPrefixLength: jjInfo.jjChangeIdPrefixLength,
    };
  }

  const gitBranch = await fetchGitBranch();
  if (gitBranch !== null) {
    return { vcsType: "git", branch: gitBranch };
  }

  return { vcsType: null, branch: null };
}

async function fetchGitStatus(): Promise<{ staged: number; unstaged: number; untracked: number } | null> {
  const output = await runCommand("git", ["status", "--porcelain"], 500);
  if (output === null) return null;
  return parseGitStatusOutput(output);
}

function getCurrentBranch(providerBranch: string | null): {
  vcsType: VcsType;
  branch: string | null;
  jjChangeId?: string;
  jjChangeIdPrefixLength?: number;
} {
  const now = Date.now();

  if (cachedBranch && now - cachedBranch.timestamp < BRANCH_TTL_MS) {
    return {
      vcsType: cachedBranch.vcsType,
      branch: cachedBranch.branch,
      jjChangeId: cachedBranch.jjChangeId,
      jjChangeIdPrefixLength: cachedBranch.jjChangeIdPrefixLength,
    };
  }

  if (!pendingBranchFetch) {
    const fetchId = branchInvalidationCounter;
    pendingBranchFetch = fetchPreferredBranch().then((result) => {
      if (fetchId === branchInvalidationCounter) {
        cachedBranch = {
          vcsType: result.vcsType,
          branch: result.branch,
          jjChangeId: result.jjChangeId,
          jjChangeIdPrefixLength: result.jjChangeIdPrefixLength,
          timestamp: Date.now(),
        };
      }
      pendingBranchFetch = null;
    });
  }

  if (cachedBranch) {
    return {
      vcsType: cachedBranch.vcsType,
      branch: cachedBranch.branch,
      jjChangeId: cachedBranch.jjChangeId,
      jjChangeIdPrefixLength: cachedBranch.jjChangeIdPrefixLength,
    };
  }

  return { vcsType: providerBranch ? "git" : null, branch: providerBranch };
}

export function getVcsStatus(providerBranch: string | null): VcsStatus {
  const now = Date.now();
  const current = getCurrentBranch(providerBranch);

  if (current.vcsType !== "git") {
    return {
      vcsType: current.vcsType,
      branch: current.branch,
      jjChangeId: current.jjChangeId,
      jjChangeIdPrefixLength: current.jjChangeIdPrefixLength,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    };
  }

  if (cachedStatus && now - cachedStatus.timestamp < CACHE_TTL_MS) {
    return {
      vcsType: "git",
      branch: current.branch,
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
    };
  }

  if (!pendingStatusFetch) {
    const fetchId = statusInvalidationCounter;
    pendingStatusFetch = fetchGitStatus().then((result) => {
      if (fetchId === statusInvalidationCounter) {
        cachedStatus = result
          ? { staged: result.staged, unstaged: result.unstaged, untracked: result.untracked, timestamp: Date.now() }
          : { staged: 0, unstaged: 0, untracked: 0, timestamp: Date.now() };
      }
      pendingStatusFetch = null;
    });
  }

  if (cachedStatus) {
    return {
      vcsType: "git",
      branch: current.branch,
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
    };
  }

  return {
    vcsType: "git",
    branch: current.branch,
    staged: 0,
    unstaged: 0,
    untracked: 0,
  };
}

export function invalidateVcsStatus(): void {
  cachedStatus = null;
  statusInvalidationCounter++;
}

export function invalidateVcsBranch(): void {
  cachedBranch = null;
  branchInvalidationCounter++;
}
