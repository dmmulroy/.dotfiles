import assert from "node:assert/strict";
import test from "node:test";
import { countGitStatusChanges, parseGitWorktreePorcelain } from "./git-worktree-output.ts";

test("parseGitWorktreePorcelain parses bare, linked, detached, and locked records", () => {
  const output = [
    "worktree /repo/.bare",
    "bare",
    "",
    "worktree /repo/main",
    "HEAD abc123",
    "branch refs/heads/main",
    "",
    "worktree /repo/review",
    "HEAD def456",
    "detached",
    "locked review in progress",
    "",
    "",
  ].join("\0");

  const result = parseGitWorktreePorcelain(output);
  if (result._tag === "err") assert.fail(result.error.message);
  assert.deepEqual(result.value, [
    {
      path: "/repo/.bare",
      head: "",
      isBare: true,
      isDetached: false,
    },
    {
      path: "/repo/main",
      head: "abc123",
      branch: "main",
      isBare: false,
      isDetached: false,
    },
    {
      path: "/repo/review",
      head: "def456",
      isBare: false,
      isDetached: true,
      lockedReason: "review in progress",
    },
  ]);
});

test("parseGitWorktreePorcelain rejects linked records without HEAD", () => {
  const result = parseGitWorktreePorcelain("worktree /repo/topic\0branch refs/heads/topic\0\0");
  if (result._tag === "ok") assert.fail("Expected malformed output to fail parsing");
  assert.equal(result.error._tag, "InvalidWorktreeOutput");
});

test("countGitStatusChanges counts staged, unstaged, and untracked entries", () => {
  assert.equal(countGitStatusChanges(" M src/a.ts\nA  src/b.ts\n?? src/c.ts\n"), 3);
  assert.equal(countGitStatusChanges(""), 0);
});
