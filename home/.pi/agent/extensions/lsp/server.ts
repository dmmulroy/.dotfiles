import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readdirSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join } from "node:path";
import picomatch from "picomatch";
import { getHomeDir } from "../../prelude/environment.js";
import type {
  LspConfigFile,
  LspLoadedConfig,
  LspRootMode,
  LspServerConfig,
  LspServerDefinition,
  LspServerSource,
  LspSpawnError,
} from "./types.js";

const BUILTIN_SERVERS: Record<string, LspServerConfig> = {
  typescript: {
    command: ["typescript-language-server", "--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    roots: [
      "package-lock.json",
      "bun.lockb",
      "bun.lock",
      "pnpm-lock.yaml",
      "yarn.lock",
      "package.json",
      "tsconfig.json",
      "jsconfig.json",
    ],
    rootMode: "workspace-or-marker",
  },
  pyright: {
    command: ["pyright-langserver", "--stdio"],
    extensions: [".py", ".pyi"],
    roots: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "pyrightconfig.json"],
    rootMode: "workspace-or-marker",
  },
  gopls: {
    command: ["gopls"],
    extensions: [".go"],
    roots: ["go.work", "go.mod", "go.sum"],
    rootMode: "workspace-or-marker",
  },
  "rust-analyzer": {
    command: ["rust-analyzer"],
    extensions: [".rs"],
    roots: ["Cargo.toml", "rust-project.json"],
    rootMode: "workspace-or-marker",
  },
  clangd: {
    command: ["clangd", "--background-index", "--clang-tidy"],
    extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".m", ".mm"],
    roots: ["compile_commands.json", "compile_flags.txt", ".clangd", "CMakeLists.txt", "Makefile", "configure.ac"],
    rootMode: "workspace-or-marker",
  },
  lua: {
    command: ["lua-language-server"],
    extensions: [".lua"],
    roots: [".luarc.json", ".luarc.jsonc", ".git"],
    rootMode: "workspace-or-marker",
  },
  bash: {
    command: ["bash-language-server", "start"],
    extensions: [".sh", ".bash", ".zsh"],
    roots: [".git"],
    rootMode: "workspace-or-marker",
  },
  css: {
    command: ["vscode-css-language-server", "--stdio"],
    extensions: [".css", ".scss", ".less"],
    roots: ["package.json", ".git"],
    rootMode: "workspace-or-marker",
  },
};

const LSP_BIN_DIR = join(getHomeDir() || process.cwd(), ".local", "share", "pi", "lsp-bin");
const DISABLE_AUTO_INSTALL_ENV_VARS = ["OPENCODE_DISABLE_LSP_DOWNLOAD", "PI_LSP_DISABLE_AUTO_INSTALL"] as const;

const NPM_BACKED_BUILTINS: Record<string, { packages: string[]; binary: string }> = {
  typescript: {
    packages: ["typescript", "typescript-language-server"],
    binary: "typescript-language-server",
  },
  pyright: {
    packages: ["pyright"],
    binary: "pyright-langserver",
  },
  bash: {
    packages: ["bash-language-server"],
    binary: "bash-language-server",
  },
  css: {
    packages: ["vscode-langservers-extracted"],
    binary: "vscode-css-language-server",
  },
};

const bootstrapInFlight = new Map<string, Promise<string | undefined>>();

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function normalizeExtensions(extensions: string[] | undefined): string[] {
  return (extensions ?? []).map((entry) => normalizeExtension(entry)).filter(Boolean);
}

function cloneStringArray(values: string[] | undefined): string[] | undefined {
  return values ? [...values] : undefined;
}

function getServerMap(configValue: LspConfigFile): Record<string, LspServerConfig> {
  if (configValue.lsp === false || !configValue.lsp) {
    return {};
  }
  return configValue.lsp;
}

function mergeServerConfig(baseConfig: LspServerConfig | undefined, overrideConfig: LspServerConfig | undefined): LspServerConfig {
  const base = baseConfig ?? {};
  const override = overrideConfig ?? {};

  const mergedEnv = {
    ...(base.env ?? {}),
    ...(override.env ?? {}),
  };

  const mergedInitialization = {
    ...(base.initialization ?? {}),
    ...(override.initialization ?? {}),
  };

  return {
    disabled: override.disabled ?? base.disabled,
    command: cloneStringArray(override.command) ?? cloneStringArray(base.command),
    extensions: cloneStringArray(override.extensions) ?? cloneStringArray(base.extensions),
    env: Object.keys(mergedEnv).length > 0 ? mergedEnv : undefined,
    initialization: Object.keys(mergedInitialization).length > 0 ? mergedInitialization : undefined,
    roots: cloneStringArray(override.roots) ?? cloneStringArray(base.roots),
    excludeRoots: cloneStringArray(override.excludeRoots) ?? cloneStringArray(base.excludeRoots),
    rootMode: override.rootMode ?? base.rootMode,
  };
}

function deriveServerSource(args: {
  serverId: string;
  hasBuiltin: boolean;
  globalServers: Record<string, LspServerConfig>;
  projectServers: Record<string, LspServerConfig>;
  configuredSource?: LspServerSource;
}): LspServerSource {
  const hasGlobal = Object.hasOwn(args.globalServers, args.serverId);
  const hasProject = Object.hasOwn(args.projectServers, args.serverId);

  if (args.hasBuiltin && !hasGlobal && !hasProject) {
    return "builtin";
  }

  if (args.hasBuiltin) {
    return "merged";
  }

  if (args.configuredSource) {
    return args.configuredSource;
  }

  if (hasGlobal && hasProject) {
    return "merged";
  }

  if (hasProject) {
    return "project";
  }

  return "global";
}

function normalizeRootMode(mode: LspRootMode | undefined): LspRootMode {
  return mode ?? "workspace-or-marker";
}

export function buildServerRegistry(config: LspLoadedConfig): Map<string, LspServerDefinition> {
  const registry = new Map<string, LspServerDefinition>();

  if (config.config.lsp === false) {
    return registry;
  }

  const globalServers = getServerMap(config.globalConfig);
  const projectServers = getServerMap(config.projectConfig);
  const mergedServers = config.config.lsp;

  const allServerIds = new Set<string>([
    ...Object.keys(BUILTIN_SERVERS),
    ...Object.keys(mergedServers),
  ]);

  for (const serverId of allServerIds) {
    const builtinServer = BUILTIN_SERVERS[serverId];
    const configuredServer = mergedServers[serverId];
    const mergedServer = mergeServerConfig(builtinServer, configuredServer);

    const extensions = normalizeExtensions(mergedServer.extensions);
    const isCustomWithoutExtensions = !builtinServer && extensions.length === 0;

    registry.set(serverId, {
      id: serverId,
      source: deriveServerSource({
        serverId,
        hasBuiltin: Boolean(builtinServer),
        globalServers,
        projectServers,
        configuredSource: config.serverSource[serverId],
      }),
      disabled: mergedServer.disabled === true || isCustomWithoutExtensions,
      command: mergedServer.command ? [...mergedServer.command] : undefined,
      extensions,
      env: { ...(mergedServer.env ?? {}) },
      initialization: { ...(mergedServer.initialization ?? {}) },
      roots: [...(mergedServer.roots ?? [])],
      excludeRoots: [...(mergedServer.excludeRoots ?? [])],
      rootMode: normalizeRootMode(mergedServer.rootMode),
    });
  }

  return registry;
}

export function getServerCandidatesForExtension(
  filePath: string,
  registry: Iterable<LspServerDefinition>,
): LspServerDefinition[] {
  const extension = normalizeExtension(extname(filePath));
  if (!extension) {
    return [];
  }

  const matches: LspServerDefinition[] = [];
  for (const server of registry) {
    if (server.disabled) continue;
    if (server.extensions.includes(extension)) {
      matches.push(server);
    }
  }

  return matches;
}

function markerMatchesDirectory(marker: string, dirPath: string): boolean {
  if (!marker) return false;

  if (!/[*?{}()[\]!+@]/.test(marker)) {
    return existsSync(join(dirPath, marker));
  }

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return false;
  }

  let matcher: (value: string) => boolean;
  try {
    matcher = picomatch(marker, {
      dot: true,
      nocase: process.platform === "win32",
    });
  } catch {
    return false;
  }

  return entries.some((entry) => matcher(entry));
}

export function findRootByMarkers(filePath: string, markers: string[], boundaryRoot?: string): string | undefined {
  if (markers.length === 0) {
    return undefined;
  }

  let current = dirname(filePath);
  const boundary = boundaryRoot ? boundaryRoot.replace(/\\/g, "/") : undefined;

  while (true) {
    const normalizedCurrent = current.replace(/\\/g, "/");
    if (boundary && !(normalizedCurrent === boundary || normalizedCurrent.startsWith(`${boundary}/`))) {
      return undefined;
    }

    if (markers.some((marker) => markerMatchesDirectory(marker, current))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export function resolveServerRoot(args: {
  filePath: string;
  server: LspServerDefinition;
  workspaceRoot: string;
}): string | undefined {
  const excludedByMarker = findRootByMarkers(args.filePath, args.server.excludeRoots, args.workspaceRoot);
  if (excludedByMarker) {
    return undefined;
  }

  const markerRoot = findRootByMarkers(args.filePath, args.server.roots, args.workspaceRoot);
  if (markerRoot) {
    return markerRoot;
  }

  if (args.server.rootMode === "marker-only") {
    return undefined;
  }

  const normalizedFile = args.filePath.replace(/\\/g, "/");
  const normalizedWorkspace = args.workspaceRoot.replace(/\\/g, "/");

  if (normalizedFile === normalizedWorkspace || normalizedFile.startsWith(`${normalizedWorkspace}/`)) {
    return args.workspaceRoot;
  }

  return dirname(args.filePath);
}

export function serverRootKey(serverId: string, root: string): string {
  return `${serverId}::${root}`;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function autoInstallDisabled(env: NodeJS.ProcessEnv): boolean {
  return DISABLE_AUTO_INSTALL_ENV_VARS.some((key) => isTruthyEnv(env[key]));
}

function isExecutableFile(pathValue: string): boolean {
  try {
    accessSync(pathValue, constants.X_OK);
    return true;
  } catch {
    // Windows does not fully honor execute bit semantics.
    return existsSync(pathValue);
  }
}

function appendWindowsExtensions(binary: string, env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") {
    return [binary];
  }

  if (binary.includes(".") && !binary.endsWith(".")) {
    return [binary];
  }

  const pathext = env.PATHEXT ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  const suffixes = pathext.split(";").filter(Boolean);
  return [binary, ...suffixes.map((ext) => `${binary}${ext}`)];
}

function resolveBinaryFromPath(binary: string, env: NodeJS.ProcessEnv): string | undefined {
  const pathEnv = env.PATH ?? process.env.PATH ?? "";

  if (isAbsolute(binary) || binary.includes("/") || binary.includes("\\")) {
    return isExecutableFile(binary) ? binary : undefined;
  }

  const candidates = appendWindowsExtensions(binary, env);
  const searchDirs = [...pathEnv.split(delimiter).filter(Boolean), LSP_BIN_DIR];

  for (const dir of searchDirs) {
    for (const candidate of candidates) {
      const fullPath = join(dir, candidate);
      if (isExecutableFile(fullPath)) {
        return fullPath;
      }
    }
  }

  return undefined;
}

function isDefaultBuiltinCommand(serverId: string, command: string[]): boolean {
  const builtinCommand = BUILTIN_SERVERS[serverId]?.command;
  if (!builtinCommand) {
    return false;
  }

  if (builtinCommand.length !== command.length) {
    return false;
  }

  return builtinCommand.every((entry, index) => entry === command[index]);
}

function localNodeBin(binary: string): string {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return join(LSP_BIN_DIR, "node_modules", ".bin", `${binary}${suffix}`);
}

function localNativeBin(binary: string): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return join(LSP_BIN_DIR, `${binary}${suffix}`);
}

function ensureLspBinDir(): void {
  mkdirSync(LSP_BIN_DIR, { recursive: true });
}

async function runCommand(args: {
  command: string;
  commandArgs: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
      env: args.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000);
      }
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = stderr.trim().length > 0 ? `\n${stderr.trim()}` : "";
      reject(new Error(`Command failed (${code}): ${args.command} ${args.commandArgs.join(" ")}${suffix}`));
    });
  });
}

async function installNpmBackedBuiltin(serverId: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const spec = NPM_BACKED_BUILTINS[serverId];
  if (!spec) {
    return undefined;
  }

  const cachedBinary = localNodeBin(spec.binary);
  if (isExecutableFile(cachedBinary)) {
    return cachedBinary;
  }

  const npmBinary = resolveBinaryFromPath("npm", env);
  if (!npmBinary) {
    return undefined;
  }

  ensureLspBinDir();

  await runCommand({
    command: npmBinary,
    commandArgs: ["install", "--prefix", LSP_BIN_DIR, "--no-audit", "--no-fund", ...spec.packages],
    cwd: LSP_BIN_DIR,
    env,
  });

  return isExecutableFile(cachedBinary) ? cachedBinary : undefined;
}

async function bootstrapBinaryIfNeeded(args: {
  server: LspServerDefinition;
  command: string[];
  env: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  if (!isDefaultBuiltinCommand(args.server.id, args.command)) {
    return undefined;
  }

  if (autoInstallDisabled(args.env)) {
    return undefined;
  }

  if (!NPM_BACKED_BUILTINS[args.server.id]) {
    return undefined;
  }

  const existingTask = bootstrapInFlight.get(args.server.id);
  if (existingTask) {
    return existingTask;
  }

  const task = installNpmBackedBuiltin(args.server.id, args.env)
    .catch(() => undefined)
    .finally(() => {
      if (bootstrapInFlight.get(args.server.id) === task) {
        bootstrapInFlight.delete(args.server.id);
      }
    });

  bootstrapInFlight.set(args.server.id, task);
  return task;
}

function buildMissingBinaryError(args: {
  serverId: string;
  root: string;
  command: string[];
  autoInstallAttempted: boolean;
  autoInstallDisabled: boolean;
}): LspSpawnError {
  const binary = args.command[0] ?? "<unknown>";
  const installHint = args.autoInstallDisabled
    ? `Auto-install is disabled (${DISABLE_AUTO_INSTALL_ENV_VARS.join(" or ")}).`
    : args.autoInstallAttempted
      ? "Attempted auto-install but binary is still unavailable."
      : "No auto-install strategy is available for this server.";

  return {
    code: "ESPAWN",
    serverId: args.serverId,
    root: args.root,
    command: args.command,
    message: `Missing LSP binary '${binary}' for server '${args.serverId}'. ${installHint}`,
    details: {
      binary,
      command: args.command,
      autoInstallAttempted: args.autoInstallAttempted,
      autoInstallDisabled: args.autoInstallDisabled,
    },
  };
}

function isLspSpawnError(error: unknown): error is LspSpawnError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Partial<LspSpawnError>;
  return typeof candidate.code === "string"
    && typeof candidate.serverId === "string"
    && typeof candidate.root === "string"
    && typeof candidate.message === "string";
}

export async function resolveSpawnCommand(args: {
  server: LspServerDefinition;
  root: string;
  env: NodeJS.ProcessEnv;
}): Promise<string[] | undefined> {
  const configured = args.server.command;
  if (!configured || configured.length === 0) {
    return undefined;
  }

  const command = [...configured];
  const binary = command[0]!;
  if (resolveBinaryFromPath(binary, args.env)) {
    return command;
  }

  const autoInstallOff = autoInstallDisabled(args.env);
  const shouldAttemptBootstrap = isDefaultBuiltinCommand(args.server.id, command) && !autoInstallOff;

  if (shouldAttemptBootstrap) {
    const bootstrappedBinary = await bootstrapBinaryIfNeeded({
      server: args.server,
      command,
      env: args.env,
    });

    if (bootstrappedBinary) {
      return [bootstrappedBinary, ...command.slice(1)];
    }

    if (resolveBinaryFromPath(binary, args.env)) {
      return command;
    }
  }

  throw buildMissingBinaryError({
    serverId: args.server.id,
    root: args.root,
    command,
    autoInstallAttempted: shouldAttemptBootstrap,
    autoInstallDisabled: autoInstallOff,
  });
}

export function buildSpawnEnv(server: LspServerDefinition, baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...(baseEnv ?? process.env),
    ...server.env,
  };
}

export function normalizeSpawnError(args: {
  serverId: string;
  root: string;
  command?: string[];
  error: unknown;
}): LspSpawnError {
  if (isLspSpawnError(args.error)) {
    return {
      ...args.error,
      command: args.error.command ?? args.command,
    };
  }

  const errorValue = args.error as NodeJS.ErrnoException | Error;
  const code = (errorValue as NodeJS.ErrnoException)?.code;

  return {
    code: "ESPAWN",
    serverId: args.serverId,
    root: args.root,
    command: args.command,
    message: code
      ? `Failed to spawn ${args.serverId} (${code}): ${errorValue.message}`
      : `Failed to spawn ${args.serverId}: ${errorValue.message}`,
    details: {
      name: errorValue.name,
      stack: errorValue.stack,
      code,
    },
  };
}

export async function spawnServerProcess(args: {
  server: LspServerDefinition;
  root: string;
  baseEnv?: NodeJS.ProcessEnv;
}): Promise<{ child: ChildProcessWithoutNullStreams; command: string[] }> {
  const env = buildSpawnEnv(args.server, args.baseEnv);
  const command = await resolveSpawnCommand({
    server: args.server,
    root: args.root,
    env,
  });

  if (!command) {
    throw {
      code: "ESPAWN",
      serverId: args.server.id,
      root: args.root,
      message: `No command configured for LSP server '${args.server.id}'.`,
    } satisfies LspSpawnError;
  }

  const [binary, ...binaryArgs] = command;
  const child = spawn(binary!, binaryArgs, {
    cwd: args.root,
    env,
    stdio: "pipe",
  });

  return {
    child,
    command,
  };
}
