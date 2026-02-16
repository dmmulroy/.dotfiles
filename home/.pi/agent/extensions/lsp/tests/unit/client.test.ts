import { afterEach, describe, expect, test } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LspClient, isTimeoutError } from "../../client.js";
import { createTempDir, fixturePath } from "../helpers.js";

const mockServerScript = fixturePath("mock-lsp-server.mjs");

function spawnMockServer(extraEnv: Record<string, string> = {}): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [mockServerScript], {
    stdio: "pipe",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

const liveChildren = new Set<ChildProcessWithoutNullStreams>();

async function createClient(extraEnv: Record<string, string> = {}, timings?: Partial<{ requestTimeoutMs: number; diagnosticsWaitTimeoutMs: number; initializeTimeoutMs: number }>) {
  const child = spawnMockServer(extraEnv);
  liveChildren.add(child);

  const client = new LspClient({
    serverId: "mock",
    root: createTempDir(),
    child,
    timing: {
      requestTimeoutMs: timings?.requestTimeoutMs ?? 300,
      diagnosticsWaitTimeoutMs: timings?.diagnosticsWaitTimeoutMs ?? 150,
      initializeTimeoutMs: timings?.initializeTimeoutMs ?? 250,
    },
  });

  return { client, child };
}

afterEach(async () => {
  for (const child of liveChildren) {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }
  liveChildren.clear();
});

describe("lsp client", () => {
  test("initialize timeout path", async () => {
    const { client } = await createClient(
      { MOCK_LSP_HANG_INITIALIZE: "1" },
      { initializeTimeoutMs: 50 },
    );

    try {
      await client.initialize();
      throw new Error("expected initialize timeout");
    } catch (error) {
      expect(isTimeoutError(error)).toBe(true);
    }
  });

  test("request timeout sends cancel notification", async () => {
    const { client, child } = await createClient(
      { MOCK_LSP_REQUEST_DELAY_MS: "200" },
      { requestTimeoutMs: 40 },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    await client.initialize();

    try {
      await client.request("textDocument/definition", {
        textDocument: { uri: pathToFileURL("/tmp/file.ts").href },
        position: { line: 0, character: 0 },
      });
      throw new Error("expected request timeout");
    } catch (error) {
      expect(isTimeoutError(error)).toBe(true);
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(stderr).toContain("CANCEL:");
  });

  test("diagnostics wait timeout falls back gracefully", async () => {
    const workspace = createTempDir();
    const file = join(workspace, "index.ts");
    writeFileSync(file, "export const value = 1;", "utf8");

    const { client } = await createClient(
      { MOCK_LSP_DIAG_DELAY_MS: "300" },
      { diagnosticsWaitTimeoutMs: 50 },
    );

    await client.initialize();

    const result = await client.touchFile(file, true);
    expect(result.timedOut).toBe(true);
    expect(result.aborted).toBe(false);
  });

  test("touchFile wait handles synchronous diagnostics publication", async () => {
    const workspace = createTempDir();
    const file = join(workspace, "index.ts");
    writeFileSync(file, "export const value = 1;", "utf8");

    const { client } = await createClient(
      { MOCK_LSP_DIAG_SYNC: "1" },
      { diagnosticsWaitTimeoutMs: 400 },
    );
    await client.initialize();

    const result = await client.touchFile(file, true);
    expect(result.timedOut).toBe(false);
    expect(result.aborted).toBe(false);
  });

  test("touchFile sends didOpen then didChange with monotonic versions", async () => {
    const workspace = createTempDir();
    const file = join(workspace, "index.ts");
    writeFileSync(file, "export const value = 1;", "utf8");

    const { client } = await createClient();
    await client.initialize();

    await client.touchFile(file, false);
    await client.touchFile(file, false);

    const uri = pathToFileURL(file).href;
    expect(client.versions.get(uri)).toBe(2);
  });
});
