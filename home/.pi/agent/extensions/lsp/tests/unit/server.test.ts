import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTempDir } from "../helpers.js";
import {
  findRootByMarkers,
  getServerCandidatesForExtension,
  resolveServerRoot,
  resolveSpawnCommand,
  serverRootKey,
} from "../../server.js";
import type { LspServerDefinition } from "../../types.js";

describe("server root resolution", () => {
  test("discovers root by marker search", () => {
    const workspace = createTempDir();
    const project = join(workspace, "project");
    const nested = join(project, "src", "deep");

    mkdirSync(nested, { recursive: true });
    writeFileSync(join(project, "tsconfig.json"), "{}", "utf8");
    writeFileSync(join(nested, "index.ts"), "export const x = 1;", "utf8");

    const root = findRootByMarkers(join(nested, "index.ts"), ["tsconfig.json"], workspace);
    expect(root).toBe(project);
  });

  test("falls back to workspace root when markers missing", () => {
    const workspace = createTempDir();
    const nestedFile = join(workspace, "src", "index.ts");
    mkdirSync(dirname(nestedFile), { recursive: true });
    writeFileSync(nestedFile, "export const y = 1;", "utf8");

    const server: LspServerDefinition = {
      id: "ts",
      source: "global",
      disabled: false,
      command: ["typescript-language-server", "--stdio"],
      extensions: [".ts"],
      env: {},
      initialization: {},
      roots: ["tsconfig.json"],
      excludeRoots: [],
      rootMode: "workspace-or-marker",
    };

    const root = resolveServerRoot({
      filePath: nestedFile,
      server,
      workspaceRoot: workspace,
    });

    expect(root).toBe(workspace);
  });

  test("marker-only server returns undefined without marker", () => {
    const workspace = createTempDir();
    const nestedFile = join(workspace, "src", "index.ts");
    mkdirSync(dirname(nestedFile), { recursive: true });
    writeFileSync(nestedFile, "export const y = 1;", "utf8");

    const server: LspServerDefinition = {
      id: "marker-only",
      source: "project",
      disabled: false,
      command: ["mock-ls"],
      extensions: [".ts"],
      env: {},
      initialization: {},
      roots: ["marker.config", "marker.config.local"],
      excludeRoots: [],
      rootMode: "marker-only",
    };

    const root = resolveServerRoot({
      filePath: nestedFile,
      server,
      workspaceRoot: workspace,
    });

    expect(root).toBeUndefined();
  });

  test("exclude root markers short-circuit root resolution", () => {
    const workspace = createTempDir();
    const nestedFile = join(workspace, "src", "index.ts");
    mkdirSync(dirname(nestedFile), { recursive: true });
    writeFileSync(join(workspace, "skip.marker"), "{}", "utf8");
    writeFileSync(join(workspace, "tsconfig.json"), "{}", "utf8");
    writeFileSync(nestedFile, "export const y = 1;", "utf8");

    const server: LspServerDefinition = {
      id: "typescript",
      source: "builtin",
      disabled: false,
      command: ["typescript-language-server", "--stdio"],
      extensions: [".ts"],
      env: {},
      initialization: {},
      roots: ["tsconfig.json"],
      excludeRoots: ["skip.marker", "skip.marker.local"],
      rootMode: "workspace-or-marker",
    };

    const root = resolveServerRoot({
      filePath: nestedFile,
      server,
      workspaceRoot: workspace,
    });

    expect(root).toBeUndefined();
  });

  test("extension matching picks expected servers", () => {
    const registry: LspServerDefinition[] = [
      {
        id: "ts",
        source: "global",
        disabled: false,
        command: ["typescript-language-server", "--stdio"],
        extensions: [".ts", ".tsx"],
        env: {},
        initialization: {},
        roots: [],
        excludeRoots: [],
        rootMode: "workspace-or-marker",
      },
      {
        id: "pyright",
        source: "global",
        disabled: false,
        command: ["pyright-langserver", "--stdio"],
        extensions: [".py"],
        env: {},
        initialization: {},
        roots: [],
        excludeRoots: [],
        rootMode: "workspace-or-marker",
      },
    ];

    const matches = getServerCandidatesForExtension("/tmp/file.ts", registry);
    expect(matches.map((server) => server.id)).toEqual(["ts"]);
  });

  test("resolveSpawnCommand accepts configured absolute binary path", async () => {
    const workspace = createTempDir();
    const binary = process.execPath;

    const server: LspServerDefinition = {
      id: "custom",
      source: "project",
      disabled: false,
      command: [binary, "--version"],
      extensions: [".txt"],
      env: {},
      initialization: {},
      roots: [],
      excludeRoots: [],
      rootMode: "workspace-or-marker",
    };

    const command = await resolveSpawnCommand({
      server,
      root: workspace,
      env: {
        ...process.env,
        PATH: "",
      },
    });

    expect(command).toEqual([binary, "--version"]);
  });

  test("resolveSpawnCommand reports missing builtin binary when auto-install disabled", async () => {
    const workspace = createTempDir();

    const server: LspServerDefinition = {
      id: "typescript",
      source: "builtin",
      disabled: false,
      command: ["typescript-language-server", "--stdio"],
      extensions: [".ts"],
      env: {},
      initialization: {},
      roots: ["tsconfig.json"],
      excludeRoots: [],
      rootMode: "workspace-or-marker",
    };

    let failure: unknown;
    try {
      await resolveSpawnCommand({
        server,
        root: workspace,
        env: {
          ...process.env,
          PATH: "",
          OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
        },
      });
    } catch (error) {
      failure = error;
    }

    const spawnError = failure as { code?: string; message?: string };
    expect(spawnError.code).toBe("ESPAWN");
    expect(spawnError.message).toContain("Auto-install is disabled");
  });

  test("server root key is deterministic", () => {
    expect(serverRootKey("ts", "/tmp/workspace")).toBe("ts::/tmp/workspace");
  });
});
