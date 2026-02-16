import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LspRuntime } from "../runtime.js";
import { registerLspHooks } from "../hooks.js";
import {
  createGlobalConfig,
  createTempDir,
  fixturePath,
  withTempHomeAsync,
} from "../tests/helpers.js";

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

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return sorted[index] ?? 0;
}

function makeWorkspace(baseName: "ts" | "python") {
  const workspace = createTempDir(`pi-lsp-bench-${baseName}-`);

  if (baseName === "ts") {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");
    writeFileSync(join(workspace, "src", "index.ts"), "export const value = 1;", "utf8");
  } else {
    writeFileSync(join(workspace, "pyproject.toml"), "[project]\nname='bench'\nversion='0.1.0'\n", "utf8");
    writeFileSync(join(workspace, "app.py"), "def add(a, b):\n    return a + b\n", "utf8");
  }

  return workspace;
}

async function benchmarkWorkspace(homeDir: string, workspace: string, extension: ".ts" | ".py") {
  createGlobalConfig(homeDir, {
    security: { projectConfigPolicy: "always" },
    timing: {
      requestTimeoutMs: 400,
      initializeTimeoutMs: 400,
      diagnosticsWaitTimeoutMs: 250,
    },
    lsp: {
      typescript: {
        disabled: extension === ".ts",
      },
      pyright: {
        disabled: extension === ".py",
      },
      mock: {
        command: [process.execPath, mockServerScript],
        extensions: [extension],
        roots: extension === ".ts" ? ["tsconfig.json"] : ["pyproject.toml"],
      },
    },
  });

  const runtime = new LspRuntime(workspace);

  const filePath = extension === ".ts"
    ? join(workspace, "src", "index.ts")
    : join(workspace, "app.py");

  const coldStart = performance.now();
  await runtime.run(filePath, async (client) => {
    return await client.request("textDocument/definition", {
      textDocument: { uri: `file://${filePath}` },
      position: { line: 0, character: 0 },
    });
  });
  const coldFirstRequestMs = performance.now() - coldStart;

  const warmLatencies: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    const started = performance.now();
    await runtime.run(filePath, async (client) => {
      return await client.request("textDocument/definition", {
        textDocument: { uri: `file://${filePath}` },
        position: { line: 0, character: 0 },
      });
    });
    warmLatencies.push(performance.now() - started);
  }

  const editLatencies: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    writeFileSync(filePath, `export const value = ${i};`, "utf8");
    const started = performance.now();
    await runtime.touchFile(filePath, true);
    editLatencies.push(performance.now() - started);
  }

  const pi = new FakePi();
  registerLspHooks(pi as any, runtime);
  const [hookResult] = await pi.emit(
    "tool_result",
    {
      toolName: "write",
      input: { path: filePath, content: "export const value = 99;" },
      content: [{ type: "text", text: "Wrote file" }],
      details: undefined,
      isError: false,
    },
    { cwd: workspace },
  );

  const summaryChars = hookResult?.content?.[0]?.text?.length ?? 0;

  const children = [...runtime.state.clients.values()].map((state) => state.child);
  await runtime.shutdownAll();
  const leakedProcesses = children.filter((child) => !child.killed && child.exitCode === null).length;

  return {
    warmP50Ms: percentile(warmLatencies, 50),
    warmP95Ms: percentile(warmLatencies, 95),
    coldFirstRequestMs,
    editToDiagnosticsP95Ms: percentile(editLatencies, 95),
    leakedProcesses,
    diagnosticsSummaryChars: summaryChars,
  };
}

async function main() {
  const homeDir = createTempDir("pi-lsp-bench-home-");

  const result = await withTempHomeAsync(homeDir, async () => {
    const tsWorkspace = makeWorkspace("ts");
    const pyWorkspace = makeWorkspace("python");

    const tsMetrics = await benchmarkWorkspace(homeDir, tsWorkspace, ".ts");
    const pyMetrics = await benchmarkWorkspace(homeDir, pyWorkspace, ".py");

    return {
      generatedAt: Date.now(),
      ts: tsMetrics,
      python: pyMetrics,
      aggregate: {
        warmP50Ms: (tsMetrics.warmP50Ms + pyMetrics.warmP50Ms) / 2,
        warmP95Ms: (tsMetrics.warmP95Ms + pyMetrics.warmP95Ms) / 2,
        coldFirstRequestMs: (tsMetrics.coldFirstRequestMs + pyMetrics.coldFirstRequestMs) / 2,
        editToDiagnosticsP95Ms: (tsMetrics.editToDiagnosticsP95Ms + pyMetrics.editToDiagnosticsP95Ms) / 2,
        leakedProcesses: tsMetrics.leakedProcesses + pyMetrics.leakedProcesses,
        diagnosticsSummaryChars: Math.max(tsMetrics.diagnosticsSummaryChars, pyMetrics.diagnosticsSummaryChars),
      },
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

void main();
