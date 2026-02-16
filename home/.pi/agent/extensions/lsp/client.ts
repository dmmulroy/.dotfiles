import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  LspDiagnostic,
} from "./types.js";

interface ClientTimingConfig {
  requestTimeoutMs: number;
  diagnosticsWaitTimeoutMs: number;
  initializeTimeoutMs: number;
}

interface InflightRequest {
  id: number;
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  abortCleanup?: () => void;
}

interface DiagnosticsWaiter {
  uri: string;
  minSeq: number;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  debounceTimer?: ReturnType<typeof setTimeout>;
  abortCleanup?: () => void;
}

interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DIAGNOSTICS_DEBOUNCE_MS = 150;

export class LspClientError extends Error {
  code?: string;
  data?: unknown;
  timedOut?: boolean;

  constructor(message: string, options?: { code?: string; data?: unknown; timedOut?: boolean }) {
    super(message);
    this.name = "LspClientError";
    this.code = options?.code;
    this.data = options?.data;
    this.timedOut = options?.timedOut;
  }
}

export function isTimeoutError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as LspClientError).code === "ETIMEDOUT");
}

function inferLanguageId(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "typescriptreact";
    case ".js":
      return "javascript";
    case ".jsx":
      return "javascriptreact";
    case ".py":
      return "python";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".c":
      return "c";
    case ".cpp":
    case ".cc":
      return "cpp";
    default:
      return extension.replace(/^\./, "") || "plaintext";
  }
}

export interface TouchFileResult {
  timedOut: boolean;
  aborted: boolean;
}

export class LspClient {
  readonly serverId: string;
  readonly root: string;
  readonly child: ChildProcessWithoutNullStreams;

  readonly diagnostics = new Map<string, LspDiagnostic[]>();
  readonly versions = new Map<string, number>();

  private timing: ClientTimingConfig;
  private nextRequestId = 1;
  private inflight = new Map<number, InflightRequest>();
  private diagnosticsSeq = new Map<string, number>();
  private diagnosticsWaiters = new Set<DiagnosticsWaiter>();
  private openedUris = new Set<string>();
  private readBuffer = Buffer.alloc(0);
  private isClosed = false;

  capabilities: Record<string, unknown> = {};

  constructor(args: {
    serverId: string;
    root: string;
    child: ChildProcessWithoutNullStreams;
    timing: ClientTimingConfig;
  }) {
    this.serverId = args.serverId;
    this.root = args.root;
    this.child = args.child;
    this.timing = args.timing;

    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdoutChunk(chunk));
    this.child.stderr.on("data", (_chunk: Buffer) => {
      // Kept intentionally silent; callers can inspect process stderr externally if needed.
    });

    this.child.on("exit", () => {
      this.isClosed = true;
      this.rejectAllInflight(new LspClientError(`${this.serverId} exited`, { code: "EPIPE" }));
      this.rejectAllDiagnosticsWaiters(new LspClientError(`${this.serverId} exited`, { code: "EPIPE" }));
    });

    this.child.on("error", (error) => {
      this.isClosed = true;
      this.rejectAllInflight(new LspClientError(`${this.serverId} process error: ${error.message}`, { code: "EPIPE" }));
      this.rejectAllDiagnosticsWaiters(new LspClientError(`${this.serverId} process error: ${error.message}`, { code: "EPIPE" }));
    });
  }

  private rejectAllInflight(error: Error): void {
    for (const request of this.inflight.values()) {
      clearTimeout(request.timeout);
      request.abortCleanup?.();
      request.reject(error);
    }
    this.inflight.clear();
  }

  private rejectAllDiagnosticsWaiters(error: Error): void {
    for (const waiter of this.diagnosticsWaiters) {
      clearTimeout(waiter.timeout);
      if (waiter.debounceTimer) {
        clearTimeout(waiter.debounceTimer);
      }
      waiter.abortCleanup?.();
      waiter.reject(error);
    }
    this.diagnosticsWaiters.clear();
  }

  private handleStdoutChunk(chunk: Buffer): void {
    if (chunk.length === 0) {
      return;
    }

    this.readBuffer = Buffer.concat([this.readBuffer, chunk]);

    while (true) {
      const headerEnd = this.readBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }

      const header = this.readBuffer.slice(0, headerEnd).toString("utf8");
      const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!contentLengthMatch) {
        this.readBuffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(contentLengthMatch[1] ?? "0", 10);
      const packetLength = headerEnd + 4 + contentLength;
      if (this.readBuffer.length < packetLength) {
        return;
      }

      const body = this.readBuffer.slice(headerEnd + 4, packetLength).toString("utf8");
      this.readBuffer = this.readBuffer.slice(packetLength);

      try {
        const message = JSON.parse(body) as JsonRpcMessage;
        this.handleRpcMessage(message);
      } catch {
        // Ignore malformed payload and continue processing subsequent packets.
      }
    }
  }

  private handleRpcMessage(message: JsonRpcMessage): void {
    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(message as JsonRpcResponse);
      return;
    }

    if ("method" in message) {
      this.handleNotification(message as JsonRpcNotification);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const inflight = this.inflight.get(response.id);
    if (!inflight) {
      return;
    }

    this.inflight.delete(response.id);
    clearTimeout(inflight.timeout);
    inflight.abortCleanup?.();

    if (response.error) {
      inflight.reject(
        new LspClientError(response.error.message, {
          code: `LSP_${response.error.code}`,
          data: response.error.data,
        }),
      );
      return;
    }

    inflight.resolve(response.result);
  }

  private handleNotification(notification: JsonRpcNotification): void {
    if (notification.method !== "textDocument/publishDiagnostics") {
      return;
    }

    const params = notification.params as {
      uri?: string;
      diagnostics?: LspDiagnostic[];
    };

    if (!params?.uri) {
      return;
    }

    this.diagnostics.set(params.uri, params.diagnostics ?? []);
    const nextSeq = (this.diagnosticsSeq.get(params.uri) ?? 0) + 1;
    this.diagnosticsSeq.set(params.uri, nextSeq);

    for (const waiter of [...this.diagnosticsWaiters]) {
      if (waiter.uri !== params.uri) {
        continue;
      }

      if (nextSeq < waiter.minSeq) {
        continue;
      }

      if (waiter.debounceTimer) {
        clearTimeout(waiter.debounceTimer);
      }

      waiter.debounceTimer = setTimeout(() => {
        this.diagnosticsWaiters.delete(waiter);
        clearTimeout(waiter.timeout);
        waiter.abortCleanup?.();
        waiter.resolve();
      }, DIAGNOSTICS_DEBOUNCE_MS);
    }
  }

  private sendMessage(message: JsonRpcMessage): void {
    if (this.isClosed || !this.child.stdin.writable) {
      throw new LspClientError(`${this.serverId} stdin is closed`, { code: "EPIPE" });
    }

    const payload = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
    this.child.stdin.write(header + payload, "utf8");
  }

  async initialize(initializationOptions?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rootUri = pathToFileURL(this.root).href;

    const settings = initializationOptions ?? {};

    const initializeResult = await this.request<Record<string, unknown>>(
      "initialize",
      {
        processId: process.pid,
        rootUri,
        rootPath: this.root,
        capabilities: {
          window: {
            workDoneProgress: true,
          },
          workspace: {
            configuration: true,
            didChangeWatchedFiles: {
              dynamicRegistration: true,
            },
          },
          textDocument: {
            synchronization: {
              didOpen: true,
              didChange: true,
            },
            publishDiagnostics: {
              versionSupport: true,
            },
          },
        },
        initializationOptions: settings,
        workspaceFolders: [{ uri: rootUri, name: this.root.split("/").pop() ?? "workspace" }],
      },
      {
        timeoutMs: this.timing.initializeTimeoutMs,
      },
    );

    this.capabilities = ((initializeResult as { capabilities?: Record<string, unknown> })?.capabilities ?? {}) as Record<string, unknown>;

    this.notify("initialized", {});

    if (Object.keys(settings).length > 0) {
      this.notify("workspace/didChangeConfiguration", {
        settings,
      });
    }

    return this.capabilities;
  }

  notify(method: string, params?: unknown): void {
    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.sendMessage(message);
  }

  request<T = unknown>(method: string, params?: unknown, options?: RequestOptions): Promise<T> {
    const id = this.nextRequestId++;
    const timeoutMs = options?.timeoutMs ?? this.timing.requestTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      if (this.isClosed) {
        reject(new LspClientError(`${this.serverId} is closed`, { code: "EPIPE" }));
        return;
      }

      const timeout = setTimeout(() => {
        this.inflight.delete(id);
        try {
          this.notify("$/cancelRequest", { id });
        } catch {
          // Best-effort cancellation only.
        }
        reject(
          new LspClientError(`Request timed out: ${method}`, {
            code: "ETIMEDOUT",
            timedOut: true,
          }),
        );
      }, timeoutMs);

      let abortCleanup: (() => void) | undefined;
      if (options?.signal) {
        const onAbort = () => {
          this.inflight.delete(id);
          clearTimeout(timeout);
          try {
            this.notify("$/cancelRequest", { id });
          } catch {
            // Best effort
          }
          reject(new LspClientError(`Request aborted: ${method}`, { code: "EABORTED" }));
        };

        if (options.signal.aborted) {
          onAbort();
          return;
        }

        options.signal.addEventListener("abort", onAbort, { once: true });
        abortCleanup = () => options.signal?.removeEventListener("abort", onAbort);
      }

      this.inflight.set(id, {
        id,
        method,
        resolve,
        reject,
        timeout,
        abortCleanup,
      });

      try {
        const message: JsonRpcRequest = {
          jsonrpc: "2.0",
          id,
          method,
          params,
        };
        this.sendMessage(message);
      } catch (error) {
        this.inflight.delete(id);
        clearTimeout(timeout);
        abortCleanup?.();
        reject(error);
      }
    });
  }

  async touchFile(filePath: string, waitForDiagnostics = false, signal?: AbortSignal): Promise<TouchFileResult> {
    const uri = pathToFileURL(filePath).href;
    const content = await readFile(filePath, "utf8");

    const currentVersion = this.versions.get(uri) ?? 0;
    const nextVersion = currentVersion + 1;
    this.versions.set(uri, nextVersion);

    const waitPromise = waitForDiagnostics
      ? this.waitForDiagnostics(uri, signal, this.timing.diagnosticsWaitTimeoutMs)
      : undefined;

    if (!this.openedUris.has(uri)) {
      this.notify("workspace/didChangeWatchedFiles", {
        changes: [{
          uri,
          type: 1,
        }],
      });

      this.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: inferLanguageId(filePath),
          version: nextVersion,
          text: content,
        },
      });
      this.openedUris.add(uri);
    } else {
      this.notify("workspace/didChangeWatchedFiles", {
        changes: [{
          uri,
          type: 2,
        }],
      });

      this.notify("textDocument/didChange", {
        textDocument: {
          uri,
          version: nextVersion,
        },
        contentChanges: [{ text: content }],
      });
    }

    if (!waitPromise) {
      return { timedOut: false, aborted: false };
    }

    try {
      await waitPromise;
      return { timedOut: false, aborted: false };
    } catch (error) {
      if (isTimeoutError(error)) {
        return { timedOut: true, aborted: false };
      }
      if ((error as LspClientError).code === "EABORTED") {
        return { timedOut: false, aborted: true };
      }
      throw error;
    }
  }

  private waitForDiagnostics(uri: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<void> {
    const minSeq = (this.diagnosticsSeq.get(uri) ?? 0) + 1;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.diagnosticsWaiters.delete(waiter);
        if (waiter.debounceTimer) {
          clearTimeout(waiter.debounceTimer);
        }
        waiter.abortCleanup?.();
        reject(
          new LspClientError(`Timed out waiting for diagnostics: ${uri}`, {
            code: "ETIMEDOUT",
            timedOut: true,
          }),
        );
      }, timeoutMs);

      const waiter: DiagnosticsWaiter = {
        uri,
        minSeq,
        resolve: () => resolve(),
        reject,
        timeout,
      };

      if (signal) {
        const onAbort = () => {
          this.diagnosticsWaiters.delete(waiter);
          clearTimeout(timeout);
          if (waiter.debounceTimer) {
            clearTimeout(waiter.debounceTimer);
          }
          reject(new LspClientError(`Diagnostics wait aborted: ${uri}`, { code: "EABORTED" }));
        };

        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener("abort", onAbort, { once: true });
        waiter.abortCleanup = () => signal.removeEventListener("abort", onAbort);
      }

      this.diagnosticsWaiters.add(waiter);
    });
  }

  async shutdown(timeoutMs = 1_500): Promise<void> {
    try {
      await this.request("shutdown", undefined, { timeoutMs });
    } catch {
      // Best effort only.
    }

    try {
      this.notify("exit", undefined);
    } catch {
      // Ignore.
    }
  }
}
