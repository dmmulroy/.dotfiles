import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { LspClient, LspClientError, isTimeoutError } from "./client.js";
import { loadLspConfig } from "./config.js";
import {
  buildServerRegistry,
  getServerCandidatesForExtension,
  normalizeSpawnError,
  resolveServerRoot,
  serverRootKey,
  spawnServerProcess,
} from "./server.js";
import type {
  BrokenServerState,
  LspClientState,
  LspDiagnostic,
  LspLoadedConfig,
  LspPanelRow,
  LspPanelSnapshot,
  LspRunSummary,
  LspRuntimeState,
  LspServerDefinition,
  LspStructuredError,
  PanelSortBucket,
} from "./types.js";

interface RuntimeClientEntry {
  state: LspClientState;
  client: LspClient;
  server: LspServerDefinition;
  command?: string[];
}

export interface TouchResult {
  touched: boolean;
  timedOut: boolean;
  aborted: boolean;
  errors: LspStructuredError[];
}

function now(): number {
  return Date.now();
}

function parseKey(key: string): { serverId: string; root: string } {
  const [serverId, ...rest] = key.split("::");
  return {
    serverId,
    root: rest.join("::"),
  };
}

function toStructuredError(serverId: string, error: unknown): LspStructuredError {
  if (error instanceof LspClientError) {
    return {
      serverId,
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      serverId,
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
    };
  }

  return {
    serverId,
    message: String(error),
  };
}

function aggregateDiagnosticsCount(diagnostics: LspDiagnostic[]): { error: number; warning: number; info: number; hint: number; total: number } {
  let error = 0;
  let warning = 0;
  let info = 0;
  let hint = 0;

  for (const diagnostic of diagnostics) {
    switch (diagnostic.severity) {
      case 1:
        error += 1;
        break;
      case 2:
        warning += 1;
        break;
      case 3:
        info += 1;
        break;
      case 4:
        hint += 1;
        break;
      default:
        info += 1;
        break;
    }
  }

  return {
    error,
    warning,
    info,
    hint,
    total: diagnostics.length,
  };
}

function sortBucketForRow(row: LspPanelRow): PanelSortBucket {
  if (row.disabled) return "disabled";
  if (row.broken) return "broken";
  if (row.spawningRoots.length > 0) return "spawning";
  if (row.connectedRoots.length > 0) return "connected";
  return "idle";
}

const SORT_WEIGHT: Record<PanelSortBucket, number> = {
  broken: 0,
  spawning: 1,
  connected: 2,
  idle: 3,
  disabled: 4,
};

function computeBackoffDelayMs(attempts: number): number {
  const baseDelay = 5_000;
  const capDelay = 60_000;
  const exponential = Math.min(capDelay, baseDelay * 2 ** Math.max(0, attempts - 1));
  const jitterFactor = 1 + (Math.random() * 0.4 - 0.2);
  return Math.max(1_000, Math.round(exponential * jitterFactor));
}

async function waitForProcessExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let finished = false;

    const done = (value: boolean) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };

    const onExit = () => done(true);
    const onError = () => done(true);
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    };

    const timer = setTimeout(() => done(false), timeoutMs);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

export class LspRuntime {
  readonly state: LspRuntimeState = {
    clients: new Map(),
    spawning: new Map(),
    broken: new Map(),
  };

  private cwd: string;
  private logger: (message: string) => void;
  private loadedConfig?: LspLoadedConfig;
  private configSignature?: string;
  private registry = new Map<string, LspServerDefinition>();
  private entries = new Map<string, RuntimeClientEntry>();
  private spawnFailures = new Map<string, LspStructuredError>();

  constructor(cwd: string, logger?: (message: string) => void) {
    this.cwd = cwd;
    this.logger = logger ?? (() => {});
    this.reloadConfig();
  }

  setCwd(cwd: string): void {
    if (cwd !== this.cwd) {
      this.cwd = cwd;
      this.reloadConfig();
    }
  }

  private async shutdownEntry(entry: RuntimeClientEntry): Promise<void> {
    await entry.client.shutdown(1_500);

    const exitedAfterShutdown = await waitForProcessExit(entry.state.child, 500);
    if (!exitedAfterShutdown) {
      entry.state.child.kill("SIGTERM");
      const exitedAfterTerm = await waitForProcessExit(entry.state.child, 2_000);
      if (!exitedAfterTerm) {
        entry.state.child.kill("SIGKILL");
        await waitForProcessExit(entry.state.child, 1_000);
      }
    }
  }

  private pruneEntriesForCurrentConfig(): void {
    if (!this.loadedConfig) {
      return;
    }

    const workspaceRoot = this.loadedConfig.workspaceRoot;

    for (const [key, entry] of this.entries.entries()) {
      if (this.isEntryActiveInCurrentConfig(entry, workspaceRoot)) {
        continue;
      }

      this.entries.delete(key);
      this.state.clients.delete(key);
      this.state.broken.delete(key);
      this.spawnFailures.delete(key);
      void this.shutdownEntry(entry).catch(() => {
        // Best-effort stale entry cleanup.
      });
    }

    for (const key of [...this.state.broken.keys()]) {
      const parsed = parseKey(key);
      if (!this.registry.has(parsed.serverId) || !this.isWithinRoot(parsed.root, workspaceRoot)) {
        this.state.broken.delete(key);
      }
    }

    for (const key of [...this.spawnFailures.keys()]) {
      const parsed = parseKey(key);
      if (!this.registry.has(parsed.serverId) || !this.isWithinRoot(parsed.root, workspaceRoot)) {
        this.spawnFailures.delete(key);
      }
    }
  }

  private buildConfigSignature(config: LspLoadedConfig): string {
    return JSON.stringify({
      config: config.config,
      projectPath: config.projectPath,
      warnings: config.warnings.map((warning) => warning.message),
    });
  }

  reloadConfig(): void {
    const loaded = loadLspConfig(this.cwd);
    const nextSignature = this.buildConfigSignature(loaded);

    if (this.configSignature && this.configSignature !== nextSignature) {
      // Reset retry budget when config changes.
      this.state.broken.clear();
      this.spawnFailures.clear();
    }

    this.loadedConfig = loaded;
    this.configSignature = nextSignature;
    this.registry = buildServerRegistry(loaded);
    this.pruneEntriesForCurrentConfig();
  }

  private ensureConfig(): LspLoadedConfig {
    const loaded = loadLspConfig(this.cwd);
    const nextSignature = this.buildConfigSignature(loaded);

    if (!this.configSignature || this.configSignature !== nextSignature) {
      this.loadedConfig = loaded;
      this.configSignature = nextSignature;
      this.registry = buildServerRegistry(loaded);
      this.state.broken.clear();
      this.spawnFailures.clear();
      this.pruneEntriesForCurrentConfig();
    }

    return this.loadedConfig ?? loaded;
  }

  getWarnings(): string[] {
    return (this.loadedConfig?.warnings ?? []).map((warning) => warning.message);
  }

  getAllowExternalPaths(): boolean {
    return this.ensureConfig().config.security.allowExternalPaths;
  }

  getWorkspaceRoot(): string {
    return this.ensureConfig().workspaceRoot;
  }

  getBoundaryRoots(): string[] {
    const config = this.ensureConfig();
    const roots = [config.workspaceRoot];

    if (this.isWithinRoot(config.projectRoot, config.workspaceRoot)) {
      roots.push(config.projectRoot);
    }

    return [...new Set(roots)];
  }

  getConfiguredServers(): Map<string, LspServerDefinition> {
    this.ensureConfig();
    return new Map(this.registry);
  }

  async hasAvailableClientForFile(filePath: string): Promise<boolean> {
    const loadedConfig = this.ensureConfig();
    const candidates = getServerCandidatesForExtension(filePath, this.registry.values());
    const nowMs = now();

    for (const server of candidates) {
      if (server.disabled) {
        continue;
      }

      const root = resolveServerRoot({
        filePath,
        server,
        workspaceRoot: loadedConfig.workspaceRoot,
      });

      if (!root) {
        continue;
      }

      const key = serverRootKey(server.id, root);
      const broken = this.state.broken.get(key);
      if (broken && nowMs < broken.retryAt) {
        continue;
      }

      return true;
    }

    return false;
  }

  private normalizePathForCompare(pathValue: string): string {
    try {
      return realpathSync(pathValue).replace(/\\/g, "/");
    } catch {
      return pathValue.replace(/\\/g, "/");
    }
  }

  private isWithinRoot(pathValue: string, root: string): boolean {
    const normalizedPath = this.normalizePathForCompare(pathValue);
    const normalizedRoot = this.normalizePathForCompare(root);
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
  }

  private isEntryActiveInCurrentConfig(entry: RuntimeClientEntry, workspaceRoot: string): boolean {
    const server = this.registry.get(entry.state.serverId);
    if (!server || server.disabled) {
      return false;
    }

    return this.isWithinRoot(entry.state.root, workspaceRoot);
  }

  private recordBroken(key: string, message: string): void {
    const previous = this.state.broken.get(key);
    const attempts = (previous?.attempts ?? 0) + 1;
    const delayMs = computeBackoffDelayMs(attempts);

    this.state.broken.set(key, {
      attempts,
      retryAt: now() + delayMs,
      lastError: message,
    });
  }

  private resetBroken(key: string): void {
    this.state.broken.delete(key);
  }

  private async spawnClient(key: string, server: LspServerDefinition, root: string): Promise<LspClientState | undefined> {
    if (this.state.spawning.has(key)) {
      return this.state.spawning.get(key);
    }

    const spawnPromise = (async () => {
      try {
        const spawned = await spawnServerProcess({
          server,
          root,
          baseEnv: process.env,
        });

        const loadedConfig = this.ensureConfig();
        const client = new LspClient({
          serverId: server.id,
          root,
          child: spawned.child,
          timing: {
            requestTimeoutMs: loadedConfig.config.timing.requestTimeoutMs,
            diagnosticsWaitTimeoutMs: loadedConfig.config.timing.diagnosticsWaitTimeoutMs,
            initializeTimeoutMs: loadedConfig.config.timing.initializeTimeoutMs,
          },
        });

        const capabilities = await client.initialize(server.initialization);

        const state: LspClientState = {
          key,
          serverId: server.id,
          root,
          child: spawned.child,
          capabilities,
          diagnostics: client.diagnostics,
          versions: client.versions,
          lastSeenAt: now(),
        };

        const entry: RuntimeClientEntry = {
          state,
          client,
          server,
          command: spawned.command,
        };

        this.entries.set(key, entry);
        this.state.clients.set(key, state);
        this.resetBroken(key);
        this.spawnFailures.delete(key);
        return state;
      } catch (error) {
        const normalized = normalizeSpawnError({
          serverId: server.id,
          root,
          command: server.command,
          error,
        });
        this.recordBroken(key, normalized.message);
        this.spawnFailures.set(key, {
          serverId: server.id,
          message: normalized.message,
          code: normalized.code,
        });
        this.logger(`[lsp] ${normalized.message}`);
        return undefined;
      } finally {
        this.state.spawning.delete(key);
      }
    })();

    this.state.spawning.set(key, spawnPromise);
    return spawnPromise;
  }

  private async selectClientsForFile(filePath: string): Promise<{
    clients: RuntimeClientEntry[];
    errors: Array<{ serverId: string; key: string; error: LspStructuredError }>;
    requestedKeys: string[];
  }> {
    const loadedConfig = this.ensureConfig();
    const candidates = getServerCandidatesForExtension(filePath, this.registry.values());
    if (candidates.length === 0) {
      return {
        clients: [],
        errors: [],
        requestedKeys: [],
      };
    }

    const nowMs = now();
    const pending: Array<Promise<LspClientState | undefined>> = [];
    const requestedKeys: string[] = [];
    const errorByKey = new Map<string, { serverId: string; key: string; error: LspStructuredError }>();

    for (const server of candidates) {
      if (server.disabled) continue;

      const root = resolveServerRoot({
        filePath,
        server,
        workspaceRoot: loadedConfig.workspaceRoot,
      });
      if (!root) {
        continue;
      }

      const key = serverRootKey(server.id, root);
      requestedKeys.push(key);

      const broken = this.state.broken.get(key);
      if (broken && nowMs < broken.retryAt) {
        errorByKey.set(key, {
          serverId: server.id,
          key,
          error: {
            serverId: server.id,
            code: "EBROKEN",
            message: `Server ${server.id} is backing off until ${new Date(broken.retryAt).toISOString()}: ${broken.lastError}`,
          },
        });
        continue;
      }

      if (this.state.clients.has(key)) {
        continue;
      }

      pending.push(this.spawnClient(key, server, root));
    }

    if (pending.length > 0) {
      await Promise.all(pending);
    }

    const clients: RuntimeClientEntry[] = [];
    for (const key of requestedKeys) {
      const entry = this.entries.get(key);
      if (entry) {
        clients.push(entry);
        continue;
      }

      if (errorByKey.has(key)) {
        continue;
      }

      const spawnFailure = this.spawnFailures.get(key);
      if (spawnFailure) {
        const parsed = parseKey(key);
        errorByKey.set(key, {
          serverId: parsed.serverId,
          key,
          error: spawnFailure,
        });
      }
    }

    return {
      clients,
      errors: [...errorByKey.values()],
      requestedKeys,
    };
  }

  async getClients(filePath: string): Promise<RuntimeClientEntry[]> {
    const selection = await this.selectClientsForFile(filePath);
    return selection.clients;
  }

  async run<T>(filePath: string, requestFn: (client: LspClient, entry: RuntimeClientEntry) => Promise<T>): Promise<LspRunSummary<T>> {
    const selection = await this.selectClientsForFile(filePath);
    const outcomes: LspRunSummary<T>["outcomes"] = selection.errors.map((failure) => ({
      serverId: failure.serverId,
      key: failure.key,
      ok: false,
      error: failure.error,
      timedOut: failure.error.code === "ETIMEDOUT",
    }));

    const clientOutcomes = await Promise.all(selection.clients.map(async (entry) => {
      try {
        const value = await requestFn(entry.client, entry);
        entry.state.lastSeenAt = now();
        this.resetBroken(entry.state.key);
        return {
          serverId: entry.state.serverId,
          key: entry.state.key,
          ok: true as const,
          value,
        };
      } catch (error) {
        const structured = toStructuredError(entry.state.serverId, error);

        if (structured.code === "EPIPE") {
          this.recordBroken(entry.state.key, structured.message);
        }

        return {
          serverId: entry.state.serverId,
          key: entry.state.key,
          ok: false as const,
          error: structured,
          timedOut: isTimeoutError(error),
        };
      }
    }));

    outcomes.push(...clientOutcomes);

    return {
      hits: selection.requestedKeys.length,
      outcomes,
      warnings: [...(this.loadedConfig?.warnings ?? [])],
    };
  }

  async runAll<T>(requestFn: (client: LspClient, entry: RuntimeClientEntry) => Promise<T>): Promise<LspRunSummary<T>> {
    const config = this.ensureConfig();
    const activeEntries = [...this.entries.values()].filter((entry) =>
      this.isEntryActiveInCurrentConfig(entry, config.workspaceRoot)
    );

    const outcomes: LspRunSummary<T>["outcomes"] = [];

    const clientOutcomes = await Promise.all(activeEntries.map(async (entry) => {
      try {
        const value = await requestFn(entry.client, entry);
        entry.state.lastSeenAt = now();
        this.resetBroken(entry.state.key);
        return {
          serverId: entry.state.serverId,
          key: entry.state.key,
          ok: true as const,
          value,
        };
      } catch (error) {
        const structured = toStructuredError(entry.state.serverId, error);

        if (structured.code === "EPIPE") {
          this.recordBroken(entry.state.key, structured.message);
        }

        return {
          serverId: entry.state.serverId,
          key: entry.state.key,
          ok: false as const,
          error: structured,
          timedOut: isTimeoutError(error),
        };
      }
    }));

    outcomes.push(...clientOutcomes);

    return {
      hits: activeEntries.length,
      outcomes,
      warnings: [...(this.loadedConfig?.warnings ?? [])],
    };
  }

  async touchFile(filePath: string, waitForDiagnostics = false, signal?: AbortSignal): Promise<TouchResult> {
    const selection = await this.selectClientsForFile(filePath);
    if (selection.clients.length === 0) {
      return {
        touched: false,
        timedOut: false,
        aborted: false,
        errors: selection.errors.map((failure) => failure.error),
      };
    }

    let timedOut = false;
    let aborted = false;
    const errors: LspStructuredError[] = selection.errors.map((failure) => failure.error);

    await Promise.all(selection.clients.map(async (entry) => {
      try {
        const touchResult = await entry.client.touchFile(filePath, waitForDiagnostics, signal);
        timedOut ||= touchResult.timedOut;
        aborted ||= touchResult.aborted;
        entry.state.lastSeenAt = now();
      } catch (error) {
        errors.push(toStructuredError(entry.state.serverId, error));
      }
    }));

    return {
      touched: true,
      timedOut,
      aborted,
      errors,
    };
  }

  diagnostics(): Record<string, LspDiagnostic[]> {
    const config = this.ensureConfig();
    const aggregated: Record<string, LspDiagnostic[]> = {};

    for (const entry of this.entries.values()) {
      if (!this.isEntryActiveInCurrentConfig(entry, config.workspaceRoot)) {
        continue;
      }

      for (const [uri, diagnostics] of entry.state.diagnostics.entries()) {
        try {
          const filePath = fileURLToPath(uri);
          if (!aggregated[filePath]) {
            aggregated[filePath] = [];
          }
          aggregated[filePath].push(...diagnostics);
        } catch {
          // Ignore invalid URIs.
        }
      }
    }

    return aggregated;
  }

  getLspPanelSnapshot(): LspPanelSnapshot {
    const config = this.ensureConfig();

    const rows: LspPanelRow[] = [];

    for (const server of this.registry.values()) {
      const connectedRoots: string[] = [];
      const spawningRoots: string[] = [];
      const diagnostics: LspDiagnostic[] = [];
      let lastSeenAt: number | undefined;
      let brokenState: BrokenServerState | undefined;

      for (const [key, entry] of this.entries.entries()) {
        if (entry.state.serverId !== server.id) continue;
        if (!this.isEntryActiveInCurrentConfig(entry, config.workspaceRoot)) continue;
        connectedRoots.push(entry.state.root);

        for (const diagSet of entry.state.diagnostics.values()) {
          diagnostics.push(...diagSet);
        }

        if (!lastSeenAt || entry.state.lastSeenAt > lastSeenAt) {
          lastSeenAt = entry.state.lastSeenAt;
        }

        const broken = this.state.broken.get(key);
        if (broken && (!brokenState || broken.attempts > brokenState.attempts)) {
          brokenState = broken;
        }
      }

      for (const key of this.state.spawning.keys()) {
        const parsed = parseKey(key);
        if (parsed.serverId !== server.id) {
          continue;
        }
        if (!this.isWithinRoot(parsed.root, config.workspaceRoot)) {
          continue;
        }
        spawningRoots.push(parsed.root);
      }

      for (const [key, broken] of this.state.broken.entries()) {
        const parsed = parseKey(key);
        if (parsed.serverId !== server.id) continue;
        if (!this.isWithinRoot(parsed.root, config.workspaceRoot)) continue;
        if (!brokenState || broken.attempts > brokenState.attempts) {
          brokenState = broken;
        }
      }

      rows.push({
        serverId: server.id,
        source: server.source,
        disabled: server.disabled,
        extensions: [...server.extensions],
        configuredRoots: [...server.roots],
        connectedRoots,
        spawningRoots,
        broken: brokenState,
        diagnostics: diagnostics.length > 0 ? aggregateDiagnosticsCount(diagnostics) : undefined,
        lastSeenAt,
      });
    }

    rows.sort((left, right) => {
      const leftBucket = sortBucketForRow(left);
      const rightBucket = sortBucketForRow(right);
      const bucketDiff = SORT_WEIGHT[leftBucket] - SORT_WEIGHT[rightBucket];
      if (bucketDiff !== 0) {
        return bucketDiff;
      }
      return left.serverId.localeCompare(right.serverId);
    });

    const totals = {
      configured: rows.length,
      connected: rows.filter((row) => row.connectedRoots.length > 0).length,
      spawning: rows.filter((row) => row.spawningRoots.length > 0).length,
      broken: rows.filter((row) => row.broken !== undefined).length,
      disabled: rows.filter((row) => row.disabled).length,
    };

    return {
      generatedAt: now(),
      rows,
      totals,
    };
  }

  async shutdownAll(): Promise<void> {
    const entries = [...this.entries.values()];

    for (const entry of entries) {
      await this.shutdownEntry(entry);
    }

    this.entries.clear();
    this.state.clients.clear();
    this.state.spawning.clear();
    this.state.broken.clear();
  }
}
