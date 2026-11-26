// Main-thread handle to the index worker (worker.ts). One worker per pi
// process, started on first use and kept for the life of the process.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { IndexProgress, SessionDocPreview, SessionSearchRequest, SessionSearchResponse } from "./index-store.ts";
import type { SessionIndexWorkerRequest } from "./worker.ts";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type WorkerReply =
  | { type: "progress"; progress: IndexProgress }
  | { type: "result"; id: number; result?: unknown; error?: string }
  | { type: "error"; message: string }
  | { type: "fatal"; message: string };

export class SessionIndexClient {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly progressListeners = new Set<(progress: IndexProgress) => void>();
  progress: IndexProgress = { phase: "idle", filesDone: 0, filesTotal: 0, docs: 0 };
  lastError: string | undefined;

  private readonly dbPath: string;
  private readonly sessionsDir: string;

  constructor(dbPath: string, sessionsDir: string) {
    this.dbPath = dbPath;
    this.sessionsDir = sessionsDir;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const here = path.dirname(fileURLToPath(import.meta.url));
    const worker = new Worker(path.join(here, "worker.ts"), {
      workerData: { dbPath: this.dbPath, sessionsDir: this.sessionsDir },
      // Keep worker warnings (e.g. experimental features) off pi's terminal.
      stderr: true,
      stdout: true,
    });
    worker.unref();
    worker.on("message", (reply: WorkerReply) => this.onReply(reply));
    worker.on("error", (error) => this.failAll(error.message));
    worker.on("exit", (code) => {
      this.worker = undefined;
      if (code !== 0) this.failAll(`session index worker exited with code ${code}`);
    });
    this.worker = worker;
    return worker;
  }

  private onReply(reply: WorkerReply): void {
    if (reply.type === "progress") {
      this.progress = reply.progress;
      for (const listener of this.progressListeners) listener(reply.progress);
      return;
    }
    if (reply.type === "error" || reply.type === "fatal") {
      this.lastError = reply.message;
      if (reply.type === "fatal") this.failAll(reply.message);
      return;
    }
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    if (reply.error) pending.reject(new Error(reply.error));
    else pending.resolve(reply.result);
  }

  private failAll(message: string): void {
    this.lastError = message;
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear();
  }

  private request<T>(build: (id: number) => SessionIndexWorkerRequest): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage(build(id));
    });
  }

  /** Index new and changed session files in the background. */
  refresh(): void {
    this.ensureWorker().postMessage({ type: "refresh" } satisfies SessionIndexWorkerRequest);
  }

  search(request: SessionSearchRequest): Promise<SessionSearchResponse> {
    return this.request((id) => ({ type: "search", id, request }));
  }

  preview(docId: number, query: string): Promise<SessionDocPreview | undefined> {
    return this.request((id) => ({ type: "preview", id, docId, query }));
  }

  onProgress(listener: (progress: IndexProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    this.failAll("session index closed");
    await worker?.terminate();
  }
}
