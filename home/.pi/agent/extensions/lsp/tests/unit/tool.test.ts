import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeToolPath, toProtocolPosition, validateOperationInput } from "../../tool.js";
import { createTempDir } from "../helpers.js";

describe("lsp tool validation", () => {
  test("all operations require filePath, line, and character", () => {
    const invalidHover = validateOperationInput({ operation: "hover" } as never);
    expect(invalidHover.ok).toBe(false);

    const invalidWorkspace = validateOperationInput({
      operation: "workspaceSymbol",
      filePath: "src/index.ts",
    } as never);
    expect(invalidWorkspace.ok).toBe(false);

    const valid = validateOperationInput({
      operation: "hover",
      filePath: "src/index.ts",
      line: 10,
      character: 4,
    } as never);
    expect(valid.ok).toBe(true);
  });

  test("1-based coordinates convert to 0-based", () => {
    const position = toProtocolPosition(3, 5);
    expect(position).toEqual({ line: 2, character: 4 });
  });

  test("path policy reports missing files with File not found", () => {
    const workspace = createTempDir();
    const missing = join(workspace, "src", "missing.ts");

    expect(() =>
      normalizeToolPath(missing, {
        cwd: workspace,
        boundaryRoots: [workspace],
        allowExternalPaths: false,
        requireReadableFile: true,
      })
    ).toThrow("File not found:");
  });

  test("path policy strips one leading @ and enforces boundary", () => {
    const workspace = createTempDir();
    const sourceDir = join(workspace, "src");
    const filePath = join(sourceDir, "index.ts");

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(filePath, "export const x = 1;", "utf8");

    const normalized = normalizeToolPath(`@${filePath}`, {
      cwd: workspace,
      boundaryRoots: [workspace],
      allowExternalPaths: false,
      requireReadableFile: true,
    });

    expect(normalized.realPath).toBe(realpathSync(filePath));

    expect(() =>
      normalizeToolPath("@/etc/hosts", {
        cwd: workspace,
        boundaryRoots: [workspace],
        allowExternalPaths: false,
        requireReadableFile: true,
      })
    ).toThrow();
  });
});
