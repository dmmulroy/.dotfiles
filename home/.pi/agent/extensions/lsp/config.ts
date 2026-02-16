import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import picomatch from "picomatch";
import { getHomeDir } from "../../prelude/environment.js";
import {
  DEFAULT_LSP_SECURITY,
  DEFAULT_LSP_TIMING,
  validateLspConfig,
} from "./schema.js";
import type {
  LspConfigFile,
  LspLoadedConfig,
  LspLoadWarning,
  LspNormalizedConfig,
  LspServerConfig,
  ProjectConfigPolicy,
} from "./types.js";

const PROJECT_CONFIG_RELATIVE = join(".pi", "lsp.json");

function globalConfigFile(): string {
  return join(getHomeDir(), ".pi", "agent", "lsp.json");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = clone(item);
    }
    return result as T;
  }

  return value;
}

/**
 * Deterministic merge semantics:
 * - objects deep merge
 * - scalars replace
 * - arrays replace (no concat)
 */
export function deepMergeDeterministic<T>(base: T, override: unknown): T {
  if (override === undefined) {
    return clone(base);
  }

  if (Array.isArray(base) && Array.isArray(override)) {
    return clone(override) as T;
  }

  if (isObject(base) && isObject(override)) {
    const output: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

    for (const key of keys) {
      const baseValue = (base as Record<string, unknown>)[key];
      if (Object.hasOwn(override, key)) {
        output[key] = deepMergeDeterministic(baseValue, (override as Record<string, unknown>)[key]);
      } else {
        output[key] = clone(baseValue);
      }
    }

    return output as T;
  }

  return clone(override as T);
}

function readAndValidateConfig(path: string): { config: LspConfigFile; warnings: LspLoadWarning[] } {
  if (!existsSync(path)) {
    return { config: {}, warnings: [] };
  }

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateLspConfig(parsed);

    if (!validation.ok) {
      const messages = validation.errors.map((error) => `${error.path} ${error.message}`).join("; ");
      return {
        config: {},
        warnings: [
          {
            type: "config-parse",
            filePath: path,
            message: `Invalid LSP config schema in ${path}: ${messages}`,
          },
        ],
      };
    }

    return {
      config: validation.value ?? {},
      warnings: [],
    };
  } catch (error) {
    return {
      config: {},
      warnings: [
        {
          type: "config-parse",
          filePath: path,
          message: `Failed to parse LSP config at ${path}: ${(error as Error).message}`,
        },
      ],
    };
  }
}

function realpathSafe(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function resolveWorkspaceRoot(cwd: string): string {
  let current = realpathSafe(cwd);

  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, ".jj"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return realpathSafe(cwd);
    }

    current = parent;
  }
}

export function findNearestProjectConfig(cwd: string): string | undefined {
  let current = realpathSafe(cwd);

  while (true) {
    const candidate = join(current, PROJECT_CONFIG_RELATIVE);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function stripTrailingSlash(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/";
}

function expandTrustedRootEntry(entry: string, homeDir: string): string {
  if (entry === "~") {
    return homeDir;
  }
  if (entry.startsWith("~/")) {
    return join(homeDir, entry.slice(2));
  }
  return entry;
}

function hasGlobPattern(pathValue: string): boolean {
  return /[*?{}()[\]!+@]/.test(pathValue);
}

function isDescendantOrEqual(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

export interface TrustedRootMatchResult {
  trusted: boolean;
  warnings: LspLoadWarning[];
}

export function matchTrustedProjectRoot(
  candidateProjectRoot: string,
  trustedRootEntries: string[],
): TrustedRootMatchResult {
  const warnings: LspLoadWarning[] = [];
  const homeDir = getHomeDir();
  const candidate = stripTrailingSlash(candidateProjectRoot);

  for (const rawEntry of trustedRootEntries) {
    const expandedEntry = expandTrustedRootEntry(rawEntry, homeDir);

    if (!isAbsolute(expandedEntry)) {
      warnings.push({
        type: "invalid-trust-entry",
        message: `Ignoring non-absolute trustedProjectRoots entry: ${rawEntry}`,
      });
      continue;
    }

    const normalizedEntry = stripTrailingSlash(expandedEntry);

    try {
      if (!hasGlobPattern(normalizedEntry)) {
        if (isDescendantOrEqual(candidate, normalizedEntry)) {
          return { trusted: true, warnings };
        }
        continue;
      }

      const matcher = picomatch(normalizedEntry, {
        dot: true,
        nocase: process.platform === "win32",
      });

      if (matcher(candidate)) {
        return { trusted: true, warnings };
      }
    } catch (error) {
      warnings.push({
        type: "trust-matcher-error",
        message: `Trust matcher failed for entry '${rawEntry}': ${(error as Error).message}`,
      });
      return { trusted: false, warnings };
    }
  }

  return { trusted: false, warnings };
}

function normalizeServerConfig(server: LspServerConfig | undefined): LspServerConfig {
  if (!server) {
    return {};
  }

  return {
    disabled: server.disabled,
    command: server.command ? [...server.command] : undefined,
    extensions: server.extensions ? [...server.extensions] : undefined,
    env: server.env ? { ...server.env } : undefined,
    initialization: server.initialization ? { ...server.initialization } : undefined,
    roots: server.roots ? [...server.roots] : undefined,
    excludeRoots: server.excludeRoots ? [...server.excludeRoots] : undefined,
    rootMode: server.rootMode,
  };
}

function sanitizeProjectOverrides(args: {
  projectConfig: LspConfigFile;
  policy: ProjectConfigPolicy;
  trustedProject: boolean;
}): { config: LspConfigFile; warnings: LspLoadWarning[] } {
  const { projectConfig, policy, trustedProject } = args;
  const warnings: LspLoadWarning[] = [];

  if (!projectConfig.lsp || projectConfig.lsp === false) {
    return { config: clone(projectConfig), warnings };
  }

  const unsafeAllowed = policy === "always" || (policy === "trusted-only" && trustedProject);
  const sanitizedServers: Record<string, LspServerConfig> = {};

  for (const [serverId, config] of Object.entries(projectConfig.lsp)) {
    const server = normalizeServerConfig(config);

    if (!unsafeAllowed) {
      if (server.command) {
        delete server.command;
        warnings.push({
          type: "project-override-blocked",
          serverId,
          field: "command",
          message: `Blocked project command override for server '${serverId}' by policy '${policy}'.`,
        });
      }

      if (server.env) {
        delete server.env;
        warnings.push({
          type: "project-override-blocked",
          serverId,
          field: "env",
          message: `Blocked project env override for server '${serverId}' by policy '${policy}'.`,
        });
      }
    }

    sanitizedServers[serverId] = server;
  }

  return {
    config: {
      ...clone(projectConfig),
      lsp: sanitizedServers,
    },
    warnings,
  };
}

function sanitizeProjectSecurityOverrides(args: {
  projectConfig: LspConfigFile;
  policy: ProjectConfigPolicy;
  trustedProject: boolean;
}): { config: LspConfigFile; warnings: LspLoadWarning[] } {
  const { projectConfig, policy, trustedProject } = args;
  const warnings: LspLoadWarning[] = [];
  const cloned = clone(projectConfig);

  if (!cloned.security) {
    return { config: cloned, warnings };
  }

  const sanitizedSecurity = { ...cloned.security };
  const unsafeAllowed = policy === "always" || (policy === "trusted-only" && trustedProject);

  if (sanitizedSecurity.projectConfigPolicy !== undefined) {
    delete sanitizedSecurity.projectConfigPolicy;
    warnings.push({
      type: "project-security-override-blocked",
      field: "projectConfigPolicy",
      message: "Blocked project security.projectConfigPolicy override; global policy is authoritative.",
    });
  }

  if (sanitizedSecurity.trustedProjectRoots !== undefined) {
    delete sanitizedSecurity.trustedProjectRoots;
    warnings.push({
      type: "project-security-override-blocked",
      field: "trustedProjectRoots",
      message: "Blocked project security.trustedProjectRoots override; global trust roots are authoritative.",
    });
  }

  if (!unsafeAllowed && sanitizedSecurity.allowExternalPaths !== undefined) {
    delete sanitizedSecurity.allowExternalPaths;
    warnings.push({
      type: "project-security-override-blocked",
      field: "allowExternalPaths",
      message: `Blocked project security.allowExternalPaths override by policy '${policy}'.`,
    });
  }

  cloned.security = Object.keys(sanitizedSecurity).length > 0 ? sanitizedSecurity : undefined;
  return {
    config: cloned,
    warnings,
  };
}

function normalizeConfig(config: LspConfigFile): LspNormalizedConfig {
  const normalized = deepMergeDeterministic(
    {
      lsp: {} as false | Record<string, LspServerConfig>,
      security: {
        projectConfigPolicy: DEFAULT_LSP_SECURITY.projectConfigPolicy,
        trustedProjectRoots: DEFAULT_LSP_SECURITY.trustedProjectRoots,
        allowExternalPaths: DEFAULT_LSP_SECURITY.allowExternalPaths,
      },
      timing: {
        requestTimeoutMs: DEFAULT_LSP_TIMING.requestTimeoutMs,
        diagnosticsWaitTimeoutMs: DEFAULT_LSP_TIMING.diagnosticsWaitTimeoutMs,
        initializeTimeoutMs: DEFAULT_LSP_TIMING.initializeTimeoutMs,
      },
    },
    config,
  );

  const lspValue = normalized.lsp === false ? false : (normalized.lsp ?? {});

  return {
    lsp: lspValue,
    security: {
      projectConfigPolicy: normalized.security?.projectConfigPolicy ?? DEFAULT_LSP_SECURITY.projectConfigPolicy,
      trustedProjectRoots: [...(normalized.security?.trustedProjectRoots ?? DEFAULT_LSP_SECURITY.trustedProjectRoots)],
      allowExternalPaths: normalized.security?.allowExternalPaths ?? DEFAULT_LSP_SECURITY.allowExternalPaths,
    },
    timing: {
      requestTimeoutMs: normalized.timing?.requestTimeoutMs ?? DEFAULT_LSP_TIMING.requestTimeoutMs,
      diagnosticsWaitTimeoutMs:
        normalized.timing?.diagnosticsWaitTimeoutMs ?? DEFAULT_LSP_TIMING.diagnosticsWaitTimeoutMs,
      initializeTimeoutMs: normalized.timing?.initializeTimeoutMs ?? DEFAULT_LSP_TIMING.initializeTimeoutMs,
    },
  };
}

function getServerKeys(config: LspConfigFile): string[] {
  if (!config.lsp || config.lsp === false) {
    return [];
  }
  return Object.keys(config.lsp);
}

function deriveServerSource(globalConfig: LspConfigFile, projectConfig: LspConfigFile): Record<string, "global" | "project" | "merged"> {
  const sources: Record<string, "global" | "project" | "merged"> = {};

  const globalServers = getServerKeys(globalConfig);
  const projectServers = getServerKeys(projectConfig);

  for (const serverId of globalServers) {
    sources[serverId] = "global";
  }

  for (const serverId of projectServers) {
    if (sources[serverId]) {
      sources[serverId] = "merged";
    } else {
      sources[serverId] = "project";
    }
  }

  return sources;
}

export function loadLspConfig(cwd: string): LspLoadedConfig {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const projectPath = findNearestProjectConfig(cwd);
  const projectRoot = projectPath ? realpathSafe(dirname(projectPath)) : workspaceRoot;

  const globalPath = globalConfigFile();
  const globalLoaded = readAndValidateConfig(globalPath);
  const projectLoaded = projectPath ? readAndValidateConfig(projectPath) : { config: {}, warnings: [] as LspLoadWarning[] };

  const warnings: LspLoadWarning[] = [...globalLoaded.warnings, ...projectLoaded.warnings];

  const globalSecurity = normalizeConfig({
    security: globalLoaded.config.security,
  }).security;

  let trustedProject = false;

  if (globalSecurity.projectConfigPolicy === "always") {
    trustedProject = true;
  } else if (globalSecurity.projectConfigPolicy === "never") {
    trustedProject = false;
  } else {
    const matchResult = matchTrustedProjectRoot(projectRoot, globalSecurity.trustedProjectRoots);
    trustedProject = matchResult.trusted;
    warnings.push(...matchResult.warnings);

    if (!trustedProject) {
      warnings.push({
        type: "project-config-untrusted",
        filePath: projectPath,
        message: `Project config overrides are not trusted for ${projectRoot}`,
      });
    }
  }

  const securitySanitizedProject = sanitizeProjectSecurityOverrides({
    projectConfig: projectLoaded.config,
    policy: globalSecurity.projectConfigPolicy,
    trustedProject,
  });
  warnings.push(...securitySanitizedProject.warnings);

  const sanitizedProject = sanitizeProjectOverrides({
    projectConfig: securitySanitizedProject.config,
    policy: globalSecurity.projectConfigPolicy,
    trustedProject,
  });

  warnings.push(...sanitizedProject.warnings);

  const hardDisabled = globalLoaded.config.lsp === false || projectLoaded.config.lsp === false;

  let mergedInput = deepMergeDeterministic(globalLoaded.config, sanitizedProject.config);
  if (hardDisabled) {
    mergedInput = deepMergeDeterministic(mergedInput, {
      lsp: false,
    });
  }

  // Trust policy and trusted roots are always sourced from global config.
  mergedInput = deepMergeDeterministic(mergedInput, {
    security: {
      projectConfigPolicy: globalSecurity.projectConfigPolicy,
      trustedProjectRoots: globalSecurity.trustedProjectRoots,
    },
  });

  const merged = normalizeConfig(mergedInput);

  return {
    config: merged,
    globalConfig: clone(globalLoaded.config),
    projectConfig: clone(sanitizedProject.config),
    globalPath,
    projectPath,
    projectRoot,
    workspaceRoot,
    warnings,
    trustedProject,
    serverSource: deriveServerSource(globalLoaded.config, sanitizedProject.config),
  };
}

export function getConfigPaths(cwd: string): { globalPath: string; projectPath?: string } {
  return {
    globalPath: globalConfigFile(),
    projectPath: findNearestProjectConfig(cwd),
  };
}
