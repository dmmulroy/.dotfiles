import { describe, expect, test } from "bun:test";
import { LspPanelComponent } from "../../lsp-panel.js";
import { summarizeSnapshot } from "../../index.js";
import type { LspPanelSnapshot } from "../../types.js";

class FakeTui {
  requestCount = 0;
  requestRender() {
    this.requestCount += 1;
  }
}

function snapshot(): LspPanelSnapshot {
  return {
    generatedAt: Date.now(),
    totals: {
      configured: 2,
      connected: 1,
      spawning: 0,
      broken: 1,
      disabled: 0,
    },
    rows: [
      {
        serverId: "ts",
        source: "global",
        disabled: false,
        extensions: [".ts"],
        configuredRoots: ["tsconfig.json"],
        connectedRoots: ["/tmp/work"],
        spawningRoots: [],
        broken: {
          attempts: 2,
          retryAt: Date.now() + 5000,
          lastError: "spawn failed",
        },
      },
      {
        serverId: "pyright",
        source: "project",
        disabled: false,
        extensions: [".py"],
        configuredRoots: ["pyproject.toml"],
        connectedRoots: [],
        spawningRoots: [],
      },
    ],
  };
}

describe("lsp panel", () => {
  test("renders rows and supports key handling", async () => {
    const tui = new FakeTui();
    let closed = 0;
    let refreshCalls = 0;

    const panel = new LspPanelComponent(tui as any, snapshot(), {
      onClose: () => {
        closed += 1;
      },
      onRefresh: async () => {
        refreshCalls += 1;
        return snapshot();
      },
    });

    let lines = panel.render(100).join("\n");
    expect(lines).toContain("ts");
    expect(lines).toContain("pyright");

    panel.handleInput("j"); // move selection down
    panel.handleInput("\r"); // enter -> expand
    lines = panel.render(100).join("\n");
    expect(lines).toContain("extensions: .py");

    panel.handleInput("/");
    panel.handleInput("p");
    panel.handleInput("y");
    panel.handleInput("\r");
    lines = panel.render(100).join("\n");
    expect(lines).toContain("pyright");

    panel.handleInput("?");
    lines = panel.render(100).join("\n");
    expect(lines).toContain("Ctrl+R or r refresh");

    panel.handleInput("r");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshCalls).toBeGreaterThan(0);

    panel.handleInput("q");
    expect(closed).toBe(1);
  });

  test("non-UI summary path", () => {
    const summary = summarizeSnapshot(snapshot());
    expect(summary).toContain("LSP status");
    expect(summary).toContain("Top issues");
  });
});
