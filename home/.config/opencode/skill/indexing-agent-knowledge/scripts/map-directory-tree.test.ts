import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dir, ".test-map-directory-tree");

async function runScript(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn(["bun", "run", "map-directory-tree.ts", ...args], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { stdout, stderr, exitCode };
}

describe("map-directory-tree.ts", () => {
  beforeAll(async () => {
    // Create test directory structure
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(join(TEST_DIR, "src"), { recursive: true });
    await mkdir(join(TEST_DIR, "src", "components"), { recursive: true });
    await mkdir(join(TEST_DIR, "node_modules"), { recursive: true });
    await mkdir(join(TEST_DIR, "ignored-dir"), { recursive: true });

    // Create files
    await writeFile(join(TEST_DIR, "README.md"), "# Test\n");
    await writeFile(join(TEST_DIR, "src", "index.ts"), "export {};\n");
    await writeFile(
      join(TEST_DIR, "src", "components", "Button.tsx"),
      "export const Button = () => null;\n"
    );
    await writeFile(
      join(TEST_DIR, "node_modules", "package.json"),
      '{"name": "test"}\n'
    );
    await writeFile(
      join(TEST_DIR, "ignored-dir", "secret.txt"),
      "secret\n"
    );

    // Create .gitignore
    await writeFile(join(TEST_DIR, ".gitignore"), "ignored-dir/\n*.log\n");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("outputs valid JSON with tree structure", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();

    const output = JSON.parse(stdout);
    expect(output).toHaveProperty("root");
    expect(output).toHaveProperty("tree");
    expect(output.tree).toHaveProperty("name");
    expect(output.tree).toHaveProperty("type", "directory");
    expect(output.tree).toHaveProperty("path", ".");
  });

  test("includes files with size", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const readme = output.tree.children?.find(
      (c: { name: string }) => c.name === "README.md"
    );

    expect(readme).toBeDefined();
    expect(readme.type).toBe("file");
    expect(readme.size).toBeGreaterThan(0);
  });

  test("builds nested tree structure", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const src = output.tree.children?.find(
      (c: { name: string }) => c.name === "src"
    );

    expect(src).toBeDefined();
    expect(src.type).toBe("directory");
    expect(src.children).toBeDefined();

    const components = src.children?.find(
      (c: { name: string }) => c.name === "components"
    );
    expect(components).toBeDefined();
    expect(components.children).toBeDefined();

    const button = components.children?.find(
      (c: { name: string }) => c.name === "Button.tsx"
    );
    expect(button).toBeDefined();
    expect(button.type).toBe("file");
  });

  test("excludes node_modules", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const nodeModules = output.tree.children?.find(
      (c: { name: string }) => c.name === "node_modules"
    );

    expect(nodeModules).toBeUndefined();
  });

  test("respects .gitignore patterns", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const ignoredDir = output.tree.children?.find(
      (c: { name: string }) => c.name === "ignored-dir"
    );

    expect(ignoredDir).toBeUndefined();
  });

  test("respects maxDepth parameter", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR, "1"]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const src = output.tree.children?.find(
      (c: { name: string }) => c.name === "src"
    );

    // src should exist but have no children at depth 1
    expect(src).toBeDefined();
    expect(src.children).toBeUndefined();
  });

  test("sorts directories before files", async () => {
    const { stdout, exitCode } = await runScript([TEST_DIR]);

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const children = output.tree.children ?? [];
    const firstDir = children.findIndex(
      (c: { type: string }) => c.type === "directory"
    );
    const firstFile = children.findIndex(
      (c: { type: string }) => c.type === "file"
    );

    // Directories should come before files
    if (firstDir !== -1 && firstFile !== -1) {
      expect(firstDir).toBeLessThan(firstFile);
    }
  });

  test("errors on missing path argument", async () => {
    const { stderr, exitCode } = await runScript([]);

    expect(exitCode).toBe(1);
    const output = JSON.parse(stderr);
    expect(output.error).toContain("Usage");
  });

  test("errors on non-existent directory", async () => {
    const { stderr, exitCode } = await runScript(["./nonexistent-dir-12345"]);

    expect(exitCode).toBe(1);
    const output = JSON.parse(stderr);
    expect(output.error).toContain("not found");
  });
});
