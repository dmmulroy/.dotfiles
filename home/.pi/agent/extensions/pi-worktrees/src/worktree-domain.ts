/** A successful value or an expected worktree-management failure. */
export type WorktreeResult<T, E extends WorktreeError = WorktreeError> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

/** Return a successful worktree result. */
export function worktreeSuccess<T>(value: T): WorktreeResult<T, never> {
  return { _tag: "ok", value };
}

/** Return an expected worktree failure. */
export function worktreeFailure<E extends WorktreeError>(error: E): WorktreeResult<never, E> {
  return { _tag: "err", error };
}

/** The canonical bare-repository root shared by linked worktrees. */
export type WorktreeRoot = {
  readonly path: string;
  readonly commonDirectory: string;
  readonly name: string;
};

/** The working-tree status shown by the manager. */
export type WorktreeStatus =
  | { readonly _tag: "clean" }
  | { readonly _tag: "dirty"; readonly changedFileCount: number }
  | { readonly _tag: "unavailable"; readonly reason: string };

/** One linked checkout registered in a Git worktree repository. */
export type WorktreeRecord = {
  readonly path: string;
  readonly localDirectory: string;
  readonly head: string;
  readonly branch?: string;
  readonly isBare: boolean;
  readonly isDetached: boolean;
  readonly isCurrent: boolean;
  readonly lockedReason?: string;
  readonly prunableReason?: string;
  readonly status: WorktreeStatus;
};

/** A canonical root and its linked worktree checkouts. */
export type WorktreeInventory = {
  readonly root: WorktreeRoot;
  readonly worktrees: ReadonlyArray<WorktreeRecord>;
};

/** Values required to create or reuse a linked worktree. */
export type CreateWorktreeInput = {
  readonly localDirectory: string;
  readonly branch: string;
  readonly base?: string;
};

/** The observable result of creating a linked worktree. */
export type CreateWorktreeOutcome = {
  readonly inventory: WorktreeInventory;
  readonly createdWorktree: WorktreeRecord;
};

/** Policy controls for safely removing a linked worktree. */
export type RemoveWorktreeInput = {
  readonly localDirectory: string;
  readonly branchCleanup: "keep" | "delete-merged";
};

/** Whether branch cleanup completed after a linked checkout was removed. */
export type BranchCleanupOutcome =
  | { readonly _tag: "kept" }
  | { readonly _tag: "deleted"; readonly branch: string }
  | { readonly _tag: "retained"; readonly branch: string; readonly reason: string };

/** The observable result of safely removing a linked worktree. */
export type RemoveWorktreeOutcome = {
  readonly removedPath: string;
  readonly branchCleanup: BranchCleanupOutcome;
};

/** Expected failures produced while managing Git worktrees. */
export type WorktreeError =
  | CanonicalWorktreeRootNotFound
  | GitWorktreeCommandFailed
  | InvalidWorktreeOutput
  | InvalidWorktreeInput
  | WorktreeNotFound
  | WorktreeHasChanges
  | CurrentWorktreeRemovalBlocked
  | LockedWorktreeRemovalBlocked;

/** The current directory does not belong to the canonical `.bare` layout. */
export class CanonicalWorktreeRootNotFound extends Error {
  readonly _tag = "CanonicalWorktreeRootNotFound" as const;

  constructor(readonly cwd: string, override readonly cause?: unknown) {
    super(`Canonical worktree root not found from ${cwd}; run /skill:worktrees for setup guidance.`);
  }
}

/** A Git or bundled worktree-helper command exited unsuccessfully. */
export class GitWorktreeCommandFailed extends Error {
  readonly _tag = "GitWorktreeCommandFailed" as const;

  constructor(
    readonly operation: "discover" | "list" | "status" | "fetch" | "create" | "remove" | "delete-branch",
    readonly stderr: string,
    readonly exitCode: number,
    override readonly cause?: unknown,
  ) {
    super(`Git worktree command failed during ${operation}: ${stderr.trim() || `exit ${exitCode}`}`);
  }
}

/** Git emitted malformed worktree porcelain output. */
export class InvalidWorktreeOutput extends Error {
  readonly _tag = "InvalidWorktreeOutput" as const;

  constructor(readonly reason: string) {
    super(`Invalid Git worktree output: ${reason}`);
  }
}

/** A user or tool supplied an invalid worktree argument. */
export class InvalidWorktreeInput extends Error {
  readonly _tag = "InvalidWorktreeInput" as const;

  constructor(readonly field: "localDirectory" | "branch", readonly value: string, readonly reason: string) {
    super(`Invalid worktree ${field}: ${reason}: ${value}`);
  }
}

/** The requested linked worktree is not registered under the canonical root. */
export class WorktreeNotFound extends Error {
  readonly _tag = "WorktreeNotFound" as const;

  constructor(readonly localDirectory: string) {
    super(`Worktree not found under the canonical root: ${localDirectory}`);
  }
}

/** A linked worktree still has staged, unstaged, or untracked changes. */
export class WorktreeHasChanges extends Error {
  readonly _tag = "WorktreeHasChanges" as const;

  constructor(readonly path: string, readonly changedFileCount: number) {
    super(`Worktree has uncommitted changes at ${path}: ${changedFileCount} changed file(s); commit or stash them first.`);
  }
}

/** The requested checkout contains the current Pi working directory. */
export class CurrentWorktreeRemovalBlocked extends Error {
  readonly _tag = "CurrentWorktreeRemovalBlocked" as const;

  constructor(readonly path: string) {
    super(`Current worktree removal blocked for ${path}; start Pi from another worktree first.`);
  }
}

/** Git has locked the requested linked worktree. */
export class LockedWorktreeRemovalBlocked extends Error {
  readonly _tag = "LockedWorktreeRemovalBlocked" as const;

  constructor(readonly path: string, readonly reason: string) {
    super(`Locked worktree removal blocked for ${path}: ${reason || "Git reports the worktree as locked"}`);
  }
}
