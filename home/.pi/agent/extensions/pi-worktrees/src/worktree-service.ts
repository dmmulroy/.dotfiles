import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import { countGitStatusChanges, parseGitWorktreePorcelain, type ParsedGitWorktree } from "./git-worktree-output.ts";
import type { WorktreeCommandRunner } from "./worktree-command-runner.ts";
import {
  CanonicalWorktreeRootNotFound,
  CurrentWorktreeRemovalBlocked,
  GitWorktreeCommandFailed,
  InvalidWorktreeInput,
  LockedWorktreeRemovalBlocked,
  WorktreeHasChanges,
  WorktreeNotFound,
  type CreateWorktreeInput,
  type CreateWorktreeOutcome,
  type RemoveWorktreeInput,
  type RemoveWorktreeOutcome,
  type WorktreeError,
  type WorktreeInventory,
  type WorktreeRecord,
  type WorktreeResult,
  type WorktreeRoot,
  type WorktreeStatus,
  worktreeFailure,
  worktreeSuccess,
} from "./worktree-domain.ts";

/** Operations available to the interactive worktree manager. */
export interface IWorktreeService {
  /** Discover the canonical root and list every linked checkout. */
  listWorktrees(cwd: string, signal?: AbortSignal): Promise<WorktreeResult<WorktreeInventory>>;

  /** Fetch and prune the canonical root's origin remote. */
  fetchWorktrees(cwd: string, signal?: AbortSignal): Promise<WorktreeResult<WorktreeInventory>>;

  /** Create or reuse a branch through the worktree skill's bundled helper. */
  createWorktree(
    cwd: string,
    input: CreateWorktreeInput,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<CreateWorktreeOutcome>>;

  /** Remove a clean non-current checkout and optionally its merged branch. */
  removeWorktree(
    cwd: string,
    input: RemoveWorktreeInput,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<RemoveWorktreeOutcome>>;
}

/** Configuration locating the executable bundled with the generic worktree skill. */
export type GitWorktreeServiceOptions = {
  readonly createWorktreeScriptPath: string;
};

/** Implements canonical worktree policy through argument-safe Git commands. */
export class GitWorktreeService implements IWorktreeService {
  constructor(
    private readonly commands: WorktreeCommandRunner,
    private readonly options: GitWorktreeServiceOptions,
  ) {}

  /** Discover the canonical root and list every linked checkout. */
  async listWorktrees(cwd: string, signal?: AbortSignal): Promise<WorktreeResult<WorktreeInventory>> {
    const rootResult = await this.discoverWorktreeRoot(cwd, signal);
    if (rootResult._tag === "err") return rootResult;
    const root = rootResult.value;

    const listResult = await this.runGit(
      "list",
      ["-C", root.path, "worktree", "list", "--porcelain", "-z"],
      cwd,
      signal,
    );
    if (listResult._tag === "err") return listResult;

    const parsedResult = parseGitWorktreePorcelain(listResult.value.stdout);
    if (parsedResult._tag === "err") return parsedResult;

    const currentPath = await resolveExistingPath(cwd);
    const linkedRecords = parsedResult.value.filter((record) => !record.isBare);
    const worktrees = await Promise.all(
      linkedRecords.map((record) => this.loadWorktreeRecord(root, currentPath, record, signal)),
    );

    return worktreeSuccess({ root, worktrees });
  }

  /** Fetch and prune the canonical root's origin remote. */
  async fetchWorktrees(cwd: string, signal?: AbortSignal): Promise<WorktreeResult<WorktreeInventory>> {
    const rootResult = await this.discoverWorktreeRoot(cwd, signal);
    if (rootResult._tag === "err") return rootResult;

    const fetchResult = await this.runGit(
      "fetch",
      ["-C", rootResult.value.path, "fetch", "--prune", "origin"],
      cwd,
      signal,
    );
    if (fetchResult._tag === "err") return fetchResult;
    return this.listWorktrees(cwd, signal);
  }

  /** Create or reuse a branch through the worktree skill's bundled helper. */
  async createWorktree(
    cwd: string,
    input: CreateWorktreeInput,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<CreateWorktreeOutcome>> {
    const inputFailure = parseCreateWorktreeInput(input);
    if (inputFailure !== undefined) return worktreeFailure(inputFailure);

    const args = [input.localDirectory, input.branch, ...(input.base === undefined ? [] : [input.base])];
    const createResult = await this.runCommand(
      "create",
      this.options.createWorktreeScriptPath,
      args,
      cwd,
      signal,
    );
    if (createResult._tag === "err") return createResult;

    const inventoryResult = await this.listWorktrees(cwd, signal);
    if (inventoryResult._tag === "err") return inventoryResult;
    const createdWorktree = inventoryResult.value.worktrees.find(
      (worktree) => worktree.localDirectory === input.localDirectory,
    );
    if (createdWorktree === undefined) {
      return worktreeFailure(new WorktreeNotFound(input.localDirectory));
    }

    return worktreeSuccess({ inventory: inventoryResult.value, createdWorktree });
  }

  /** Remove a clean non-current checkout and optionally its merged branch. */
  async removeWorktree(
    cwd: string,
    input: RemoveWorktreeInput,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<RemoveWorktreeOutcome>> {
    const inputFailure = parseLocalDirectory(input.localDirectory);
    if (inputFailure !== undefined) return worktreeFailure(inputFailure);

    const inventoryResult = await this.listWorktrees(cwd, signal);
    if (inventoryResult._tag === "err") return inventoryResult;
    const target = inventoryResult.value.worktrees.find(
      (worktree) => worktree.localDirectory === input.localDirectory,
    );
    if (target === undefined) return worktreeFailure(new WorktreeNotFound(input.localDirectory));
    if (target.isCurrent) return worktreeFailure(new CurrentWorktreeRemovalBlocked(target.path));
    if (target.lockedReason !== undefined) {
      return worktreeFailure(new LockedWorktreeRemovalBlocked(target.path, target.lockedReason));
    }
    if (target.status._tag === "dirty") {
      return worktreeFailure(new WorktreeHasChanges(target.path, target.status.changedFileCount));
    }
    if (target.status._tag === "unavailable") {
      return worktreeFailure(new GitWorktreeCommandFailed("status", target.status.reason, 1));
    }

    const removeResult = await this.runGit(
      "remove",
      ["-C", inventoryResult.value.root.path, "worktree", "remove", input.localDirectory],
      cwd,
      signal,
    );
    if (removeResult._tag === "err") return removeResult;

    if (input.branchCleanup === "keep" || target.branch === undefined) {
      return worktreeSuccess({ removedPath: target.path, branchCleanup: { _tag: "kept" } });
    }

    const deleteResult = await this.runGit(
      "delete-branch",
      ["-C", inventoryResult.value.root.path, "branch", "-d", target.branch],
      cwd,
      signal,
    );
    if (deleteResult._tag === "err") {
      return worktreeSuccess({
        removedPath: target.path,
        branchCleanup: {
          _tag: "retained",
          branch: target.branch,
          reason: deleteResult.error.message,
        },
      });
    }

    return worktreeSuccess({
      removedPath: target.path,
      branchCleanup: { _tag: "deleted", branch: target.branch },
    });
  }

  private async discoverWorktreeRoot(
    cwd: string,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<WorktreeRoot, CanonicalWorktreeRootNotFound | GitWorktreeCommandFailed>> {
    const commonResult = await this.runGit(
      "discover",
      ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      cwd,
      signal,
    );
    if (commonResult._tag === "err") {
      return worktreeFailure(new CanonicalWorktreeRootNotFound(cwd, commonResult.error));
    }

    const commonDirectory = resolve(commonResult.value.stdout.trim());
    if (!isAbsolute(commonDirectory) || basename(commonDirectory) !== ".bare") {
      return worktreeFailure(new CanonicalWorktreeRootNotFound(cwd));
    }

    const rootPath = dirname(commonDirectory);
    const bareResult = await this.runGit(
      "discover",
      ["-C", rootPath, "rev-parse", "--is-bare-repository"],
      cwd,
      signal,
    );
    if (bareResult._tag === "err" || bareResult.value.stdout.trim() !== "true") {
      return worktreeFailure(new CanonicalWorktreeRootNotFound(cwd, bareResult._tag === "err" ? bareResult.error : undefined));
    }

    return worktreeSuccess({ path: rootPath, commonDirectory, name: basename(rootPath) });
  }

  private async loadWorktreeRecord(
    root: WorktreeRoot,
    currentPath: string,
    parsed: ParsedGitWorktree,
    signal?: AbortSignal,
  ): Promise<WorktreeRecord> {
    const status = await this.loadWorktreeStatus(parsed.path, signal);
    const linkedPath = await resolveExistingPath(parsed.path);
    const relativePath = relative(root.path, parsed.path);
    const localDirectory = relativePath.length > 0 && !relativePath.startsWith(`..${sep}`) ? relativePath : basename(parsed.path);

    return {
      path: parsed.path,
      localDirectory,
      head: parsed.head,
      isBare: false,
      isDetached: parsed.isDetached,
      isCurrent: currentPath === linkedPath || currentPath.startsWith(`${linkedPath}${sep}`),
      status,
      ...(parsed.branch === undefined ? {} : { branch: parsed.branch }),
      ...(parsed.lockedReason === undefined ? {} : { lockedReason: parsed.lockedReason }),
      ...(parsed.prunableReason === undefined ? {} : { prunableReason: parsed.prunableReason }),
    };
  }

  private async loadWorktreeStatus(path: string, signal?: AbortSignal): Promise<WorktreeStatus> {
    const statusResult = await this.runGit(
      "status",
      ["-C", path, "status", "--porcelain=v1", "--untracked-files=normal"],
      path,
      signal,
    );
    if (statusResult._tag === "err") {
      return { _tag: "unavailable", reason: statusResult.error.message };
    }

    const changedFileCount = countGitStatusChanges(statusResult.value.stdout);
    return changedFileCount === 0 ? { _tag: "clean" } : { _tag: "dirty", changedFileCount };
  }

  private runGit(
    operation: GitWorktreeCommandFailed["operation"],
    args: ReadonlyArray<string>,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<ExecResult, GitWorktreeCommandFailed>> {
    return this.runCommand(operation, "git", args, cwd, signal);
  }

  private async runCommand(
    operation: GitWorktreeCommandFailed["operation"],
    command: string,
    args: ReadonlyArray<string>,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<WorktreeResult<ExecResult, GitWorktreeCommandFailed>> {
    const options: ExecOptions = { cwd, ...(signal === undefined ? {} : { signal }) };
    try {
      const result = await this.commands.run(command, args, options);
      if (result.code !== 0) {
        return worktreeFailure(new GitWorktreeCommandFailed(operation, result.stderr || result.stdout, result.code));
      }
      return worktreeSuccess(result);
    } catch (cause) {
      return worktreeFailure(new GitWorktreeCommandFailed(operation, String(cause), -1, cause));
    }
  }
}

function parseCreateWorktreeInput(input: CreateWorktreeInput): InvalidWorktreeInput | undefined {
  const localDirectoryFailure = parseLocalDirectory(input.localDirectory);
  if (localDirectoryFailure !== undefined) return localDirectoryFailure;
  if (input.branch.trim().length === 0 || input.branch.startsWith("-")) {
    return new InvalidWorktreeInput("branch", input.branch, "branch must be non-empty and cannot start with '-' ");
  }
  return undefined;
}

function parseLocalDirectory(localDirectory: string): InvalidWorktreeInput | undefined {
  if (
    localDirectory.length === 0 ||
    localDirectory === "." ||
    localDirectory === ".." ||
    localDirectory.includes("/") ||
    localDirectory.includes("\\")
  ) {
    return new InvalidWorktreeInput(
      "localDirectory",
      localDirectory,
      "directory must name one direct child of the canonical root",
    );
  }
  return undefined;
}

async function resolveExistingPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}
