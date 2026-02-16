import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deepMergeDeterministic, loadLspConfig, matchTrustedProjectRoot } from "../../config.js";
import { buildServerRegistry } from "../../server.js";
import {
  createGlobalConfig,
  createProjectConfig,
  createSymlink,
  createTempDir,
  withTempHome,
} from "../helpers.js";

describe("lsp config merge", () => {
  test("deep merge semantics for object/scalar/array", () => {
    const merged = deepMergeDeterministic(
      {
        object: { one: 1, two: 2 },
        scalar: "a",
        array: ["one", "two"],
      },
      {
        object: { two: 22, three: 3 },
        scalar: "b",
        array: ["three"],
      },
    );

    expect(merged).toEqual({
      object: { one: 1, two: 22, three: 3 },
      scalar: "b",
      array: ["three"],
    });
  });

  test("loads built-in servers without explicit lsp config", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    const registry = buildServerRegistry(loaded);

    expect(registry.has("typescript")).toBe(true);
    expect(registry.has("pyright")).toBe(true);
    expect(registry.has("gopls")).toBe(true);
    expect(registry.has("rust-analyzer")).toBe(true);
    expect(registry.has("clangd")).toBe(true);
    expect(registry.has("lua")).toBe(true);
    expect(registry.has("bash")).toBe(true);
    expect(registry.has("css")).toBe(true);
    expect(registry.has("deno")).toBe(false);
    expect(registry.get("typescript")?.source).toBe("builtin");
  });

  test("config override merges into built-in server definitions", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      lsp: {
        typescript: {
          command: ["custom-ts-ls", "--stdio"],
          roots: ["tsconfig.base.json"],
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    const registry = buildServerRegistry(loaded);
    const typescript = registry.get("typescript");

    expect(typescript?.command).toEqual(["custom-ts-ls", "--stdio"]);
    expect(typescript?.roots).toEqual(["tsconfig.base.json"]);
    expect(typescript?.source).toBe("merged");
  });

  test("lsp false hard-disables servers", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();
    mkdirSync(join(workspace, ".pi"), { recursive: true });

    createGlobalConfig(homeDir, {
      lsp: {
        ts: {
          command: ["typescript-language-server", "--stdio"],
          extensions: [".ts"],
        },
      },
    });

    createProjectConfig(workspace, {
      lsp: false,
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    expect(loaded.config.lsp).toBe(false);
  });

  test("global lsp false cannot be overridden by project server config", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      lsp: false,
    });

    createProjectConfig(workspace, {
      lsp: {
        ts: {
          command: ["typescript-language-server", "--stdio"],
          extensions: [".ts"],
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    expect(loaded.config.lsp).toBe(false);
  });

  test("per-server disabled takes precedence", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      lsp: {
        ts: {
          disabled: false,
          command: ["typescript-language-server", "--stdio"],
          extensions: [".ts"],
        },
      },
    });

    createProjectConfig(workspace, {
      lsp: {
        ts: {
          disabled: true,
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    expect(loaded.config.lsp).not.toBe(false);

    const tsServer = (loaded.config.lsp as Record<string, { disabled?: boolean }>).ts;
    expect(tsServer?.disabled).toBe(true);
  });
});

describe("trust policy", () => {
  test("trusted-only blocks command/env for untrusted projects", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      security: {
        projectConfigPolicy: "trusted-only",
        trustedProjectRoots: [join(homeDir, "trusted")],
      },
      lsp: {
        ts: {
          command: ["global-ts", "--stdio"],
          extensions: [".ts"],
        },
      },
    });

    createProjectConfig(workspace, {
      lsp: {
        ts: {
          command: ["project-ts", "--stdio"],
          env: { FOO: "BAR" },
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    const tsServer = (loaded.config.lsp as Record<string, { command?: string[]; env?: Record<string, string> }>).ts;

    expect(tsServer?.command).toEqual(["global-ts", "--stdio"]);
    expect(tsServer?.env).toBeUndefined();
    expect(loaded.warnings.some((warning) => warning.type === "project-override-blocked")).toBe(true);
  });

  test("untrusted project cannot escalate security policy", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      security: {
        projectConfigPolicy: "trusted-only",
        trustedProjectRoots: [join(homeDir, "trusted")],
        allowExternalPaths: false,
      },
    });

    createProjectConfig(workspace, {
      security: {
        projectConfigPolicy: "always",
        trustedProjectRoots: ["/"],
        allowExternalPaths: true,
      },
      lsp: {
        ts: {
          command: ["project-ts", "--stdio"],
          env: { FOO: "BAR" },
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));

    expect(loaded.config.security.projectConfigPolicy).toBe("trusted-only");
    expect(loaded.config.security.allowExternalPaths).toBe(false);
    expect(loaded.config.security.trustedProjectRoots).toEqual([join(homeDir, "trusted")]);
    expect(loaded.warnings.some((warning) => warning.type === "project-security-override-blocked")).toBe(true);
  });

  test("never policy blocks project command/env always", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      security: {
        projectConfigPolicy: "never",
      },
    });

    createProjectConfig(workspace, {
      lsp: {
        pyright: {
          command: ["pyright-langserver", "--stdio"],
          env: { PYRIGHT_PYTHON_FORCE_VERSION: "3.13" },
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    const pyright = (loaded.config.lsp as Record<string, { command?: string[]; env?: Record<string, string> }>).pyright;

    expect(pyright?.command).toBeUndefined();
    expect(pyright?.env).toBeUndefined();
  });

  test("always policy allows project command/env", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    createGlobalConfig(homeDir, {
      security: {
        projectConfigPolicy: "always",
      },
    });

    createProjectConfig(workspace, {
      lsp: {
        pyright: {
          command: ["pyright-langserver", "--stdio"],
          env: { PYRIGHT_PYTHON_FORCE_VERSION: "3.13" },
        },
      },
    });

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    const pyright = (loaded.config.lsp as Record<string, { command?: string[]; env?: Record<string, string> }>).pyright;

    expect(pyright?.command).toEqual(["pyright-langserver", "--stdio"]);
    expect(pyright?.env).toEqual({ PYRIGHT_PYTHON_FORCE_VERSION: "3.13" });
  });

  test("trust matcher uses realpath for symlinked project", () => {
    const homeDir = createTempDir();
    const realWorkspace = createTempDir();
    const aliasRoot = createTempDir();
    const aliasWorkspace = join(aliasRoot, "workspace-link");

    createGlobalConfig(homeDir, {
      security: {
        projectConfigPolicy: "trusted-only",
        trustedProjectRoots: [realpathSync(realWorkspace)],
      },
    });

    createProjectConfig(realWorkspace, {
      lsp: {
        ts: {
          command: ["project-ts", "--stdio"],
        },
      },
    });

    createSymlink(aliasWorkspace, realWorkspace);

    const loaded = withTempHome(homeDir, () => loadLspConfig(aliasWorkspace));
    expect(loaded.trustedProject).toBe(true);
  });

  test("invalid trust entries fail closed", () => {
    const result = matchTrustedProjectRoot("/tmp/workspace", ["relative/path"]);
    expect(result.trusted).toBe(false);
    expect(result.warnings.some((warning) => warning.type === "invalid-trust-entry")).toBe(true);
  });
});

describe("config parse errors", () => {
  test("parse error includes file path context and falls back", () => {
    const homeDir = createTempDir();
    const workspace = createTempDir();

    const globalPath = join(homeDir, ".pi", "agent", "lsp.json");
    mkdirSync(join(homeDir, ".pi", "agent"), { recursive: true });
    writeFileSync(globalPath, "{ this is not json", "utf8");

    const loaded = withTempHome(homeDir, () => loadLspConfig(workspace));
    expect(loaded.warnings.some((warning) => warning.message.includes(globalPath))).toBe(true);
    expect(loaded.config.lsp).not.toBe(false);
  });
});
