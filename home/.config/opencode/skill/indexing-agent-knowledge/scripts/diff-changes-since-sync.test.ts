import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dir, ".test-diff-changes-since-sync");

async function runScript(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn(["bun", "run", "diff-changes-since-sync.ts", ...args], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { stdout, stderr, exitCode };
}

async function git(args: string[], cwd: string): Promise<string> {
  const proc = spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return new Response(proc.stdout).text();
}

describe("diff-changes-since-sync.ts", () => {
  let baseCommit: string;

  beforeAll(async () => {
    // Create test git repo
    await mkdir(TEST_DIR, { recursive: true });
    await git(["init"], TEST_DIR);
    await git(["config", "user.email", "test@test.com"], TEST_DIR);
    await git(["config", "user.name", "Test"], TEST_DIR);

    // Create initial commit
    await writeFile(join(TEST_DIR, "README.md"), "# Test\n");
    await git(["add", "."], TEST_DIR);
    await git(["commit", "-m", "Initial commit"], TEST_DIR);

    // Save base commit
    baseCommit = (await git(["rev-parse", "--short", "HEAD"], TEST_DIR)).trim();

    // Make some changes
    await mkdir(join(TEST_DIR, "src"), { recursive: true });
    await writeFile(join(TEST_DIR, "src", "index.ts"), "export const x = 1;\n");
    await writeFile(join(TEST_DIR, "README.md"), "# Test\n\nUpdated.\n");
    await git(["add", "."], TEST_DIR);
    await git(["commit", "-m", "Add src and update readme"], TEST_DIR);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("outputs valid JSON with expected structure", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR, baseCommit]);

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();

    const output = JSON.parse(stdout);
    expect(output).toHaveProperty("root");
    expect(output).toHaveProperty("baseCommit");
    expect(output).toHaveProperty("headCommit");
    expect(output).toHaveProperty("summary");
    expect(output).toHaveProperty("byDirectory");
  });

  test("includes summary with correct counts", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR, baseCommit]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    expect(output.summary.filesChanged).toBe(2); // README.md + src/index.ts
    expect(output.summary.commitCount).toBe(1);
    expect(output.summary.insertions).toBeGreaterThan(0);
  });

  test("groups changes by directory", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR, baseCommit]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const dirs = output.byDirectory.map((d: { path: string }) => d.path);

    expect(dirs).toContain("."); // README.md at root
    expect(dirs).toContain("src"); // src/index.ts
  });

  test("includes file status", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR, baseCommit]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const rootDir = output.byDirectory.find(
      (d: { path: string }) => d.path === "."
    );
    const srcDir = output.byDirectory.find(
      (d: { path: string }) => d.path === "src"
    );

    // README.md was modified
    const readme = rootDir?.files.find(
      (f: { path: string }) => f.path === "README.md"
    );
    expect(readme?.status).toBe("modified");

    // src/index.ts was added
    const index = srcDir?.files.find(
      (f: { path: string }) => f.path === "src/index.ts"
    );
    expect(index?.status).toBe("added");
  });

  test("errors on missing arguments", async () => {
    const { stderr, exitCode } = await runScript([]);

    expect(exitCode).toBe(1);
    const output = JSON.parse(stderr);
    expect(output.error).toContain("Usage");
  });

  test("errors on non-existent directory", async () => {
    const { stderr, exitCode } = await runScript([
      "./nonexistent-dir-12345",
      "abc123",
    ]);

    expect(exitCode).toBe(1);
    const output = JSON.parse(stderr);
    expect(output.error).toContain("not found");
  });

  test("errors on invalid commit", async () => {
    const { stderr, exitCode } = await runScript([
      TEST_DIR,
      "nonexistent-commit-12345",
    ]);

    expect(exitCode).toBe(1);
    const output = JSON.parse(stderr);
    expect(output.error).toContain("not found");
  });
});
