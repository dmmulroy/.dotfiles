import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LspRuntime } from "../../runtime.js";
import { registerLspHooks } from "../../hooks.js";
import {
  createGlobalConfig,
  createTempDir,
  fixturePath,
  withTempHomeAsync,
} from "../helpers.js";

const mockServerScript = fixturePath("mock-lsp-server.mjs");

class FakePi {
  handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();

  on(event: string, handler: (event: any, ctx: any) => Promise<any> | any) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  async emit(event: string, payload: any, ctx: any): Promise<any[]> {
    const handlers = this.handlers.get(event) ?? [];
    const results: any[] = [];
    for (const handler of handlers) {
      results.push(await handler(payload, ctx));
    }
    return results;
  }
}

const runtimes: LspRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes) {
    await runtime.shutdownAll();
  }
  runtimes.length = 0;
});

function setup(homeDir: string, diagnosticsWaitTimeoutMs = 120, diagDelayMs = 20) {
  const workspace = createTempDir();
  mkdirSync(join(workspace, "src"), { recursive: true });
  const filePath = join(workspace, "src", "index.ts");
  writeFileSync(filePath, "export const value = 1;", "utf8");
  writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");

  createGlobalConfig(homeDir, {
    security: {
      projectConfigPolicy: "always",
    },
    timing: {
      requestTimeoutMs: 200,
      initializeTimeoutMs: 200,
      diagnosticsWaitTimeoutMs,
    },
    lsp: {
      typescript: {
        disabled: true,
      },
      ts: {
        command: [process.execPath, mockServerScript],
        env: {
          MOCK_LSP_DIAG_DELAY_MS: String(diagDelayMs),
        },
        extensions: [".ts"],
        roots: ["tsconfig.json"],
      },
    },
  });

  return { workspace, filePath };
}

describe("lsp hooks integration", () => {
  test("write/edit append diagnostics summary", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const { workspace, filePath } = setup(homeDir);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const pi = new FakePi();
      registerLspHooks(pi as any, runtime);

      const [result] = await pi.emit(
        "tool_result",
        {
          toolName: "write",
          input: { path: filePath, content: "export const value = 2;" },
          content: [{ type: "text", text: "Wrote file" }],
          details: undefined,
          isError: false,
        },
        { cwd: workspace },
      );

      expect(result?.content?.[0]?.text).toContain("LSP diagnostics summary");
      expect(result?.content?.[0]?.text).toContain("Mock warning");
    });
  });

  test("append keeps non-text content parts", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const { workspace, filePath } = setup(homeDir);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const pi = new FakePi();
      registerLspHooks(pi as any, runtime);

      const [result] = await pi.emit(
        "tool_result",
        {
          toolName: "write",
          input: { path: filePath, content: "export const value = 2;" },
          content: [
            { type: "text", text: "Wrote file" },
            { type: "image", mimeType: "image/png", data: "AAAA" },
          ],
          details: undefined,
          isError: false,
        },
        { cwd: workspace },
      );

      expect(result?.content?.length).toBe(2);
      expect(result?.content?.[1]?.type).toBe("image");
      expect(result?.content?.[0]?.text).toContain("LSP diagnostics summary");
    });
  });

  test("write/edit diagnostics are skipped when tool failed", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const { workspace, filePath } = setup(homeDir);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const pi = new FakePi();
      registerLspHooks(pi as any, runtime);

      const [result] = await pi.emit(
        "tool_result",
        {
          toolName: "edit",
          input: { path: filePath, oldText: "value = 1", newText: "value = 2" },
          content: [{ type: "text", text: "Edit failed" }],
          details: undefined,
          isError: true,
        },
        { cwd: workspace },
      );

      expect(result).toBeUndefined();
    });
  });

  test("read warm path does not block", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const { workspace, filePath } = setup(homeDir);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const pi = new FakePi();
      registerLspHooks(pi as any, runtime);

      const start = Date.now();
      const [result] = await pi.emit(
        "tool_result",
        {
          toolName: "read",
          input: { path: filePath },
          content: [{ type: "text", text: "file content" }],
          details: undefined,
          isError: false,
        },
        { cwd: workspace },
      );
      const duration = Date.now() - start;

      expect(result).toBeUndefined();
      expect(duration).toBeLessThan(80);
    });
  });

  test("timeout still returns best-effort summary", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const { workspace, filePath } = setup(homeDir, 20, 200);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const pi = new FakePi();
      registerLspHooks(pi as any, runtime);

      const [result] = await pi.emit(
        "tool_result",
        {
          toolName: "edit",
          input: { path: filePath, oldText: "value = 1", newText: "value = 2" },
          content: [{ type: "text", text: "Edited file" }],
          details: undefined,
          isError: false,
        },
        { cwd: workspace },
      );

      expect(result?.content?.[0]?.text).toContain("timed out waiting for fresh diagnostics");
    });
  });
});
