import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import type { WorktreeCommandRunner } from "./worktree-command-runner.ts";
import { GitWorktreeService } from "./worktree-service.ts";

class NodeWorktreeCommandRunner implements WorktreeCommandRunner {
  run(command: string, args: ReadonlyArray<string>, options?: ExecOptions): Promise<ExecResult> {
    return new Promise((resolveResult, reject) => {
      const child = spawn(command, [...args], {
        cwd: options?.cwd,
        signal: options?.signal,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        resolveResult({ stdout, stderr, code: code ?? -1, killed: signal !== null });
      });
    });
  }
}

test("GitWorktreeService lists, creates, and safely removes canonical worktrees", async (context) => {
  const fixture = await createCanonicalWorktreeFixture();
  context.after(async () => {
    await rm(fixture.temporaryDirectory, { recursive: true, force: true });
  });

  const service = new GitWorktreeService(new NodeWorktreeCommandRunner(), {
    createWorktreeScriptPath: join(
      process.env.HOME ?? "",
      ".agents",
      "skills",
      "worktrees",
      "scripts",
      "new-worktree.sh",
    ),
  });

  const initial = await service.listWorktrees(fixture.mainWorktree);
  if (initial._tag === "err") assert.fail(initial.error.message);
  assert.equal(initial.value.root.path, await realpath(fixture.repositoryRoot));
  assert.equal(initial.value.worktrees.length, 1);
  assert.equal(initial.value.worktrees[0]?.localDirectory, "main");
  assert.equal(initial.value.worktrees[0]?.isCurrent, true);

  const created = await service.createWorktree(fixture.mainWorktree, {
    localDirectory: "topic",
    branch: "feature/topic",
  });
  if (created._tag === "err") assert.fail(created.error.message);
  assert.equal(created.value.createdWorktree.branch, "feature/topic");
  assert.equal(created.value.createdWorktree.status._tag, "clean");
  assert.equal(await gitOutput(fixture.topicWorktree, ["rev-parse", "--abbrev-ref", "@{upstream}"]), "");

  await writeFile(join(fixture.topicWorktree, "dirty.txt"), "uncommitted\n", "utf8");
  const dirtyRemoval = await service.removeWorktree(fixture.mainWorktree, {
    localDirectory: "topic",
    branchCleanup: "keep",
  });
  assert.equal(dirtyRemoval._tag, "err");
  if (dirtyRemoval._tag === "err") assert.equal(dirtyRemoval.error._tag, "WorktreeHasChanges");

  await rm(join(fixture.topicWorktree, "dirty.txt"));
  const removed = await service.removeWorktree(fixture.mainWorktree, {
    localDirectory: "topic",
    branchCleanup: "delete-merged",
  });
  if (removed._tag === "err") assert.fail(removed.error.message);
  assert.equal(removed.value.branchCleanup._tag, "deleted");

  const finalInventory = await service.listWorktrees(fixture.mainWorktree);
  if (finalInventory._tag === "err") assert.fail(finalInventory.error.message);
  assert.deepEqual(finalInventory.value.worktrees.map((worktree) => worktree.localDirectory), ["main"]);
});

test("GitWorktreeService rejects repositories outside the canonical layout", async (context) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "pi-worktrees-standard-"));
  context.after(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });
  await runGit(temporaryDirectory, ["init", "-q", "-b", "main"]);

  const service = new GitWorktreeService(new NodeWorktreeCommandRunner(), {
    createWorktreeScriptPath: "/not-used",
  });
  const result = await service.listWorktrees(temporaryDirectory);
  if (result._tag === "ok") assert.fail("Expected a standard clone to be rejected");
  assert.equal(result.error._tag, "CanonicalWorktreeRootNotFound");
});

type CanonicalWorktreeFixture = {
  readonly temporaryDirectory: string;
  readonly repositoryRoot: string;
  readonly mainWorktree: string;
  readonly topicWorktree: string;
};

async function createCanonicalWorktreeFixture(): Promise<CanonicalWorktreeFixture> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "pi-worktrees-"));
  const source = join(temporaryDirectory, "source");
  const remote = join(temporaryDirectory, "remote.git");
  const repositoryRoot = join(temporaryDirectory, "project");
  const mainWorktree = join(repositoryRoot, "main");
  const topicWorktree = join(repositoryRoot, "topic");

  await mkdir(source);
  await runGit(source, ["init", "-q", "-b", "main"]);
  await runGit(source, ["config", "user.email", "test@example.com"]);
  await runGit(source, ["config", "user.name", "Pi Worktrees Test"]);
  await writeFile(join(source, "README.md"), "fixture\n", "utf8");
  await runGit(source, ["add", "README.md"]);
  await runGit(source, ["commit", "-qm", "Initial fixture"]);
  await runGit(temporaryDirectory, ["clone", "-q", "--bare", source, remote]);

  await mkdir(repositoryRoot);
  await runGit(repositoryRoot, ["clone", "-q", "--bare", remote, ".bare"]);
  await writeFile(join(repositoryRoot, ".git"), "gitdir: ./.bare\n", "utf8");
  await runGit(repositoryRoot, ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
  await runGit(repositoryRoot, ["config", "core.logAllRefUpdates", "true"]);
  await runGit(repositoryRoot, ["config", "worktree.useRelativePaths", "true"]);
  await runGit(repositoryRoot, ["fetch", "-q", "--prune", "origin"]);
  await runGit(repositoryRoot, ["remote", "set-head", "origin", "--auto"]);
  await runGit(repositoryRoot, ["worktree", "add", "-q", "main", "main"]);
  await runGit(mainWorktree, ["branch", "--set-upstream-to=origin/main", "main"]);

  return { temporaryDirectory, repositoryRoot, mainWorktree, topicWorktree };
}

async function runGit(cwd: string, args: ReadonlyArray<string>): Promise<void> {
  const result = await new NodeWorktreeCommandRunner().run("git", args, { cwd });
  assert.equal(result.code, 0, result.stderr);
}

async function gitOutput(cwd: string, args: ReadonlyArray<string>): Promise<string> {
  const result = await new NodeWorktreeCommandRunner().run("git", args, { cwd });
  return result.code === 0 ? result.stdout.trim() : "";
}
