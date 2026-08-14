import {
  InvalidWorktreeOutput,
  type WorktreeResult,
  worktreeFailure,
  worktreeSuccess,
} from "./worktree-domain.ts";

/** A worktree record parsed before filesystem status is loaded. */
export type ParsedGitWorktree = {
  readonly path: string;
  readonly head: string;
  readonly branch?: string;
  readonly isBare: boolean;
  readonly isDetached: boolean;
  readonly lockedReason?: string;
  readonly prunableReason?: string;
};

type WorktreeDraft = {
  path?: string;
  head?: string;
  branch?: string;
  isBare: boolean;
  isDetached: boolean;
  lockedReason?: string;
  prunableReason?: string;
};

/** Parse `git worktree list --porcelain -z` without losing unusual path characters. */
export function parseGitWorktreePorcelain(
  output: string,
): WorktreeResult<ReadonlyArray<ParsedGitWorktree>, InvalidWorktreeOutput> {
  const records: ParsedGitWorktree[] = [];
  let draft = makeDraft();

  for (const field of output.split("\0")) {
    if (field === "") {
      if (draft.path !== undefined || draft.head !== undefined) {
        const completed = completeDraft(draft);
        if (completed._tag === "err") return completed;
        records.push(completed.value);
        draft = makeDraft();
      }
      continue;
    }

    if (field.startsWith("worktree ")) {
      draft.path = field.slice("worktree ".length);
    } else if (field.startsWith("HEAD ")) {
      draft.head = field.slice("HEAD ".length);
    } else if (field.startsWith("branch refs/heads/")) {
      draft.branch = field.slice("branch refs/heads/".length);
    } else if (field === "bare") {
      draft.isBare = true;
    } else if (field === "detached") {
      draft.isDetached = true;
    } else if (field === "locked" || field.startsWith("locked ")) {
      draft.lockedReason = field.slice("locked".length).trim();
    } else if (field === "prunable" || field.startsWith("prunable ")) {
      draft.prunableReason = field.slice("prunable".length).trim();
    }
  }

  if (draft.path !== undefined || draft.head !== undefined) {
    const completed = completeDraft(draft);
    if (completed._tag === "err") return completed;
    records.push(completed.value);
  }

  return worktreeSuccess(records);
}

/** Count changed entries in `git status --porcelain=v1` output. */
export function countGitStatusChanges(output: string): number {
  if (output.length === 0) return 0;
  return output.split("\n").filter((line) => line.length > 0).length;
}

function makeDraft(): WorktreeDraft {
  return { isBare: false, isDetached: false };
}

function completeDraft(draft: WorktreeDraft): WorktreeResult<ParsedGitWorktree, InvalidWorktreeOutput> {
  if (draft.path === undefined || draft.path.length === 0) {
    return worktreeFailure(new InvalidWorktreeOutput("record is missing its worktree path"));
  }
  if (!draft.isBare && (draft.head === undefined || draft.head.length === 0)) {
    return worktreeFailure(new InvalidWorktreeOutput(`record for ${draft.path} is missing HEAD`));
  }

  const record: ParsedGitWorktree = {
    path: draft.path,
    head: draft.head ?? "",
    isBare: draft.isBare,
    isDetached: draft.isDetached,
    ...(draft.branch === undefined ? {} : { branch: draft.branch }),
    ...(draft.lockedReason === undefined ? {} : { lockedReason: draft.lockedReason }),
    ...(draft.prunableReason === undefined ? {} : { prunableReason: draft.prunableReason }),
  };
  return worktreeSuccess(record);
}
