import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LspRuntime } from "../../runtime.js";
import {
  createGlobalConfig,
  createTempDir,
  withTempHomeAsync,
  fixturePath,
} from "../helpers.js";

const mockServerScript = fixturePath("mock-lsp-server.mjs");

const runtimes: LspRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes) {
    await runtime.shutdownAll();
  }
  runtimes.length = 0;
});

function setupWorkspace(homeDir: string) {
  const workspace = createTempDir();
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "src", "index.ts"), "export const value = 1;", "utf8");
  writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");

  createGlobalConfig(homeDir, {
    security: {
      projectConfigPolicy: "always",
    },
    timing: {
      requestTimeoutMs: 200,
      diagnosticsWaitTimeoutMs: 100,
      initializeTimeoutMs: 200,
    },
    lsp: {
      typescript: {
        disabled: true,
      },
      ts: {
        command: [process.execPath, mockServerScript],
        extensions: [".ts"],
        roots: ["tsconfig.json"],
      },
    },
  });

  return workspace;
}

describe("lsp runtime integration", () => {
  test("spawn de-dup under concurrent requests", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const workspace = setupWorkspace(homeDir);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const filePath = join(workspace, "src", "index.ts");

      await Promise.all([
        runtime.getClients(filePath),
        runtime.getClients(filePath),
        runtime.getClients(filePath),
        runtime.getClients(filePath),
      ]);

      expect(runtime.state.clients.size).toBe(1);
      expect(runtime.state.spawning.size).toBe(0);
    });
  });

  test("backoff and recovery after config change", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const workspace = createTempDir();
      mkdirSync(join(workspace, "src"), { recursive: true });
      writeFileSync(join(workspace, "src", "index.ts"), "export const value = 1;", "utf8");
      writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");

      createGlobalConfig(homeDir, {
        security: { projectConfigPolicy: "always" },
        lsp: {
          typescript: {
            disabled: true,
          },
          ts: {
            command: ["/definitely/missing/lsp-binary"],
            extensions: [".ts"],
            roots: ["tsconfig.json"],
          },
        },
      });

      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const filePath = join(workspace, "src", "index.ts");
      const firstClients = await runtime.getClients(filePath);
      expect(firstClients.length).toBe(0);
      expect(runtime.state.broken.size).toBe(1);

      createGlobalConfig(homeDir, {
        security: { projectConfigPolicy: "always" },
        lsp: {
          typescript: {
            disabled: true,
          },
          ts: {
            command: [process.execPath, mockServerScript],
            extensions: [".ts"],
            roots: ["tsconfig.json"],
          },
        },
      });

      runtime.reloadConfig();
      const recoveredClients = await runtime.getClients(filePath);

      expect(recoveredClients.length).toBe(1);
      expect(runtime.state.broken.size).toBe(0);
    });
  });

  test("run surfaces structured spawn failures", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const workspace = createTempDir();
      mkdirSync(join(workspace, "src"), { recursive: true });
      writeFileSync(join(workspace, "src", "index.ts"), "export const value = 1;", "utf8");
      writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");

      createGlobalConfig(homeDir, {
        security: { projectConfigPolicy: "always" },
        lsp: {
          typescript: {
            disabled: true,
          },
          ts: {
            command: ["/definitely/missing/lsp-binary"],
            extensions: [".ts"],
            roots: ["tsconfig.json"],
          },
        },
      });

      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const filePath = join(workspace, "src", "index.ts");
      const availableBeforeFailure = await runtime.hasAvailableClientForFile(filePath);
      expect(availableBeforeFailure).toBe(true);

      const summary = await runtime.run(filePath, async (_client) => {
        return "ok";
      });

      expect(summary.hits).toBe(1);
      expect(summary.outcomes.length).toBe(1);
      expect(summary.outcomes[0]?.ok).toBe(false);
      expect(summary.outcomes[0]?.error?.code).toBe("ESPAWN");

      const availableAfterFailure = await runtime.hasAvailableClientForFile(filePath);
      expect(availableAfterFailure).toBe(false);
    });
  });

  test("runAll ignores stale clients from previous cwd", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const workspaceOne = setupWorkspace(homeDir);
      const workspaceTwo = setupWorkspace(homeDir);

      const runtime = new LspRuntime(workspaceOne);
      runtimes.push(runtime);

      const fileOne = join(workspaceOne, "src", "index.ts");
      await runtime.getClients(fileOne);

      runtime.setCwd(workspaceTwo);

      const summary = await runtime.runAll(async (_client) => {
        return "stale";
      });

      expect(summary.hits).toBe(0);
      expect(summary.outcomes.length).toBe(0);
    });
  });

  test("runAll executes requests across clients concurrently", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const workspace = createTempDir();
      mkdirSync(join(workspace, "src"), { recursive: true });
      writeFileSync(join(workspace, "src", "index.ts"), "export const value = 1;", "utf8");
      writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");

      createGlobalConfig(homeDir, {
        security: { projectConfigPolicy: "always" },
        lsp: {
          typescript: {
            disabled: true,
          },
          tsA: {
            command: [process.execPath, mockServerScript],
            extensions: [".ts"],
            roots: ["tsconfig.json"],
          },
          tsB: {
            command: [process.execPath, mockServerScript],
            extensions: [".ts"],
            roots: ["tsconfig.json"],
          },
        },
      });

      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const filePath = join(workspace, "src", "index.ts");
      await runtime.getClients(filePath);

      const start = Date.now();
      const summary = await runtime.runAll(async () => {
        await Bun.sleep(80);
        return "ok";
      });
      const elapsed = Date.now() - start;

      expect(summary.hits).toBe(2);
      expect(summary.outcomes.length).toBe(2);
      expect(elapsed).toBeLessThan(140);
    });
  });

  test("shutdown sequence leaves no live child processes", async () => {
    const homeDir = createTempDir();

    await withTempHomeAsync(homeDir, async () => {
      const workspace = setupWorkspace(homeDir);
      const runtime = new LspRuntime(workspace);
      runtimes.push(runtime);

      const filePath = join(workspace, "src", "index.ts");
      await runtime.getClients(filePath);

      const childrenBefore = [...runtime.state.clients.values()].map((state) => state.child);
      expect(childrenBefore.length).toBeGreaterThan(0);

      await runtime.shutdownAll();

      for (const child of childrenBefore) {
        expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      }
    });
  });
});
