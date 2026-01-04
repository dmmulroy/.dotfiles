import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dir, ".test-find-agent-md-files");

async function runScript(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn(["bun", "run", "find-agent-md-files.ts", ...args], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { stdout, stderr, exitCode };
}

describe("find-agent-md-files.ts", () => {
  beforeAll(async () => {
    // Create test directory structure
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(join(TEST_DIR, "src"), { recursive: true });
    await mkdir(join(TEST_DIR, "src", "components"), { recursive: true });

    // Root AGENTS.md with metadata
    await writeFile(
      join(TEST_DIR, "AGENTS.md"),
      `# Test Project

**Generated:** 2025-01-04T10:00:00Z
**Commit:** abc1234
**Branch:** main

Some content here.
`
    );

    // Subdirectory AGENTS.md without metadata
    await writeFile(
      join(TEST_DIR, "src", "AGENTS.md"),
      `# Src Directory

No metadata in this one.
`
    );

    // CLAUDE.md file
    await writeFile(
      join(TEST_DIR, "src", "components", "CLAUDE.md"),
      `# Components

**Generated:** 2025-01-03T09:00:00Z
**Commit:** def5678

Component docs.
`
    );
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("finds all agent files", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    expect(output.files).toHaveLength(3);
  });

  test("extracts metadata from files", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);

    // Root AGENTS.md should have full metadata
    const rootFile = output.files.find(
      (f: { path: string }) => f.path === "AGENTS.md"
    );
    expect(rootFile).toBeDefined();
    expect(rootFile.type).toBe("AGENTS");
    expect(rootFile.commit).toBe("abc1234");
    expect(rootFile.generated).toBe("2025-01-04T10:00:00Z");
    expect(rootFile.branch).toBe("main");
  });

  test("handles files without metadata", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);

    const srcFile = output.files.find(
      (f: { path: string }) => f.path === "src/AGENTS.md"
    );
    expect(srcFile).toBeDefined();
    expect(srcFile.type).toBe("AGENTS");
    expect(srcFile.commit).toBeUndefined();
  });

  test("identifies CLAUDE.md files", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);

    const claudeFile = output.files.find(
      (f: { path: string }) => f.path === "src/components/CLAUDE.md"
    );
    expect(claudeFile).toBeDefined();
    expect(claudeFile.type).toBe("CLAUDE");
    expect(claudeFile.commit).toBe("def5678");
  });

  test("sorts by depth then alphabetically", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const paths = output.files.map((f: { path: string }) => f.path);

    // Root should be first
    expect(paths[0]).toBe("AGENTS.md");
    // Then src (depth 2)
    expect(paths[1]).toBe("src/AGENTS.md");
    // Then src/components (depth 3)
    expect(paths[2]).toBe("src/components/CLAUDE.md");
  });

  test("errors on non-existent directory", async () => {
    const { stderr, exitCode } = await runScript(["./nonexistent-dir-12345"]);

    expect(exitCode).toBe(1);
    const output = JSON.parse(stderr);
    expect(output.error).toBeDefined();
  });

  test("outputs valid JSON", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();

    const output = JSON.parse(stdout);
    expect(output).toHaveProperty("root");
    expect(output).toHaveProperty("files");
    expect(Array.isArray(output.files)).toBe(true);
  });
});
