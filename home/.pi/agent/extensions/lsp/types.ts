import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { TextContent } from "@mariozechner/pi-ai";

export type LspOperation =
  | "goToDefinition"
  | "findReferences"
  | "hover"
  | "documentSymbol"
  | "workspaceSymbol"
  | "goToImplementation"
  | "prepareCallHierarchy"
  | "incomingCalls"
  | "outgoingCalls";

export interface LspPosition {
  filePath: string;
  line: number;
  character: number;
}

export type LspToolInput = {
  operation: LspOperation;
} & LspPosition;

export type LspRootMode = "workspace-or-marker" | "marker-only";

export interface LspServerConfig {
  disabled?: boolean;
  command?: string[];
  extensions?: string[];
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  roots?: string[];
  excludeRoots?: string[];
  rootMode?: LspRootMode;
}

export type ProjectConfigPolicy = "trusted-only" | "always" | "never";

export interface LspSecurityConfig {
  projectConfigPolicy?: ProjectConfigPolicy;
  trustedProjectRoots?: string[];
  allowExternalPaths?: boolean;
}

export interface LspTimingConfig {
  requestTimeoutMs?: number;
  diagnosticsWaitTimeoutMs?: number;
  initializeTimeoutMs?: number;
}

export interface LspConfigFile {
  lsp?: false | Record<string, LspServerConfig>;
  security?: LspSecurityConfig;
  timing?: LspTimingConfig;
}

export interface LspNormalizedConfig {
  lsp: false | Record<string, LspServerConfig>;
  security: {
    projectConfigPolicy: ProjectConfigPolicy;
    trustedProjectRoots: string[];
    allowExternalPaths: boolean;
  };
  timing: {
    requestTimeoutMs: number;
    diagnosticsWaitTimeoutMs: number;
    initializeTimeoutMs: number;
  };
}

export interface LspLoadWarning {
  type:
    | "project-override-blocked"
    | "project-security-override-blocked"
    | "invalid-trust-entry"
    | "project-config-untrusted"
    | "trust-matcher-error"
    | "config-parse";
  message: string;
  filePath?: string;
  serverId?: string;
  field?: "command" | "env" | "projectConfigPolicy" | "trustedProjectRoots" | "allowExternalPaths";
}

export type LspServerSource = "builtin" | "global" | "project" | "merged";

export interface LspLoadedConfig {
  config: LspNormalizedConfig;
  globalConfig: LspConfigFile;
  projectConfig: LspConfigFile;
  globalPath: string;
  projectPath?: string;
  projectRoot: string;
  workspaceRoot: string;
  warnings: LspLoadWarning[];
  trustedProject: boolean;
  serverSource: Record<string, LspServerSource>;
}

export interface LspServerDefinition {
  id: string;
  disabled: boolean;
  source: LspServerSource;
  command?: string[];
  extensions: string[];
  env: Record<string, string>;
  initialization: Record<string, unknown>;
  roots: string[];
  excludeRoots: string[];
  rootMode: LspRootMode;
}

export interface LspSpawnError {
  code: "ESPAWN" | "EINIT" | "ETIMEDOUT" | "EPIPE" | "EBROKEN";
  message: string;
  serverId: string;
  root: string;
  command?: string[];
  details?: unknown;
}

export interface LspStructuredError {
  serverId: string;
  message: string;
  code?: string;
}

export interface LspToolResult<T = unknown> {
  ok: boolean;
  operation: LspOperation;
  data: T;
  errors?: LspStructuredError[];
  meta: {
    durationMs: number;
    serverHits: number;
    partial: boolean;
    timedOut?: boolean;
    empty?: boolean;
    truncated?: boolean;
    warnings?: string[];
  };
}

export interface LspRange {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}

export interface LspLocationLike {
  uri: string;
  range: LspRange;
}

export interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  data?: unknown;
}

export interface LspPanelRow {
  serverId: string;
  source: LspServerSource;
  disabled: boolean;
  extensions: string[];
  configuredRoots: string[];
  connectedRoots: string[];
  spawningRoots: string[];
  broken?: { attempts: number; retryAt: number; lastError: string };
  diagnostics?: { error: number; warning: number; info: number; hint: number; total: number };
  lastSeenAt?: number;
}

export interface LspPanelSnapshot {
  generatedAt: number;
  rows: LspPanelRow[];
  totals: {
    configured: number;
    connected: number;
    spawning: number;
    broken: number;
    disabled: number;
  };
}

export interface LspRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LspRequestResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: LspStructuredError;
  timedOut?: boolean;
}

export interface LspClientState {
  key: string;
  serverId: string;
  root: string;
  child: ChildProcessWithoutNullStreams;
  capabilities: Record<string, unknown>;
  diagnostics: Map<string, LspDiagnostic[]>;
  versions: Map<string, number>;
  lastSeenAt: number;
}

export interface BrokenServerState {
  attempts: number;
  retryAt: number;
  lastError: string;
}

export interface LspRuntimeState {
  clients: Map<string, LspClientState>;
  spawning: Map<string, Promise<LspClientState | undefined>>;
  broken: Map<string, BrokenServerState>;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface PathNormalizationResult {
  raw: string;
  normalizedInput: string;
  absolutePath: string;
  realPath: string;
}

export interface LspRuntimeRequestOutcome<T = unknown> {
  serverId: string;
  key: string;
  ok: boolean;
  value?: T;
  error?: LspStructuredError;
  timedOut?: boolean;
}

export interface LspRunSummary<T = unknown> {
  hits: number;
  outcomes: LspRuntimeRequestOutcome<T>[];
  warnings: LspLoadWarning[];
}

export interface LspDiagnosticsSummary {
  filePath: string;
  diagnostics: LspDiagnostic[];
}

export interface LspHookSummaryOptions {
  relatedFilesLimit: number;
  diagnosticsPerFileLimit: number;
  maxChars: number;
}

export interface LspTextResultPatch {
  content?: TextContent[];
  details?: Record<string, unknown>;
}

export interface LspDiagnosticTouchResult {
  filePath: string;
  timedOut: boolean;
  error?: string;
}

export type PanelSortBucket = "broken" | "spawning" | "connected" | "idle" | "disabled";
