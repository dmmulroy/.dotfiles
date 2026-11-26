// Worker thread that owns the SQLite session index, so indexing 5+ GB of
// sessions never blocks pi's UI. Loaded by Node's native type stripping:
// erasable TypeScript only, relative imports with .ts extensions, no pi imports.

import { parentPort, workerData } from "node:worker_threads";
import { SessionIndexStore, type SessionSearchRequest } from "./index-store.ts";

export type SessionIndexWorkerRequest =
  | { type: "refresh" }
  | { type: "search"; id: number; request: SessionSearchRequest }
  | { type: "preview"; id: number; docId: number; query: string };

const { dbPath, sessionsDir } = workerData as { dbPath: string; sessionsDir: string };
const port = parentPort;
if (!port) throw new Error("session-finder worker must run in a worker thread");

let store: SessionIndexStore;
try {
  store = new SessionIndexStore(dbPath, sessionsDir, (progress) => port.postMessage({ type: "progress", progress }));
} catch (error) {
  port.postMessage({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
  throw error;
}

port.on("message", (message: SessionIndexWorkerRequest) => {
  if (message.type === "refresh") {
    store.refresh().catch((error: unknown) => {
      port.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
    return;
  }
  try {
    const result = message.type === "search" ? store.search(message.request) : store.preview(message.docId, message.query);
    port.postMessage({ type: "result", id: message.id, result });
  } catch (error) {
    port.postMessage({ type: "result", id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
});
