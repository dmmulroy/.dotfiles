import { chmod, mkdir, open, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, type Server, type Socket } from "node:net";

import { SystemClock } from "./domain.ts";
import { MacOsNotificationAdapter } from "./notification.ts";
import { PiBackgroundAuthProbe, PiModelAvailabilityProbe, PiProjectTrustProbe } from "./preflight.ts";
import { handleSchedulerRequest } from "./protocol.ts";
import { RunDispatcher, SchedulerRuntime } from "./runtime.ts";
import { SchedulerApplicationService, type SchedulerService } from "./service.ts";
import { SqliteSchedulerStore } from "./store.ts";
import { SupervisedPiWorker } from "./worker.ts";

const MAX_FRAME_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Running Unix socket server handle. */
export interface SchedulerServerHandle {
  readonly server: Server;
  close(): Promise<void>;
}

/** Dependencies required to expose a scheduler service over a Unix socket. */
export interface StartSchedulerServerOptions {
  readonly socketPath: string;
  readonly service: SchedulerService;
  readonly recordOperation?: (record: {
    readonly operation: string;
    readonly correlationId: string;
    readonly durationMs: number;
    readonly status: "ok" | "error";
    readonly errorTag?: string;
  }) => void;
}

async function handleConnection(socket: Socket, options: StartSchedulerServerOptions): Promise<void> {
  socket.setEncoding("utf8");
  let buffer = "";
  let handled = false;
  socket.on("data", (chunk: string) => {
    if (handled) return;
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES) {
      handled = true;
      socket.end(`${JSON.stringify({ version: 1, id: "invalid", ok: false, error: { tag: "ProtocolError", message: "The scheduler request exceeded the frame limit" } })}\n`);
      return;
    }
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    handled = true;
    const line = buffer.slice(0, newline);
    let value: unknown;
    try { value = JSON.parse(line); }
    catch {
      socket.end(`${JSON.stringify({ version: 1, id: "invalid", ok: false, error: { tag: "ProtocolError", message: "The scheduler request is invalid" } })}\n`);
      return;
    }
    const startedAt = Date.now();
    void handleSchedulerRequest(options.service, value)
      .then((response) => {
        const requestRecord = isRecord(value) ? value : undefined;
        try {
          options.recordOperation?.({
            operation: typeof requestRecord?.method === "string" ? requestRecord.method : "protocol.invalid",
            correlationId: response.id,
            durationMs: Date.now() - startedAt,
            status: response.ok ? "ok" : "error",
            ...(response.ok ? {} : { errorTag: response.error.tag }),
          });
        } catch { /* observability never changes request behavior */ }
        socket.end(`${JSON.stringify(response)}\n`);
      })
      .catch(() => socket.end(`${JSON.stringify({ version: 1, id: "invalid", ok: false, error: { tag: "InternalError", message: "The scheduler request failed" } })}\n`));
  });
}

/** Start a strict LF-delimited JSON server on a real Unix socket. */
export async function startSchedulerServer(options: StartSchedulerServerOptions): Promise<SchedulerServerHandle> {
  await mkdir(dirname(options.socketPath), { recursive: true, mode: 0o700 });
  await rm(options.socketPath, { force: true });
  const server = createServer((socket) => { void handleConnection(socket, options); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  await chmod(options.socketPath, 0o600);
  return {
    server,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(options.socketPath, { force: true });
    },
  };
}

async function acquireDaemonLock(path: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      return handle;
    } catch (cause) {
      if (attempt > 0) throw cause;
      let stale = false;
      try {
        const pid = Number((await readFile(path, "utf8")).trim());
        if (!Number.isInteger(pid) || pid <= 0) stale = true;
        else {
          try { process.kill(pid, 0); }
          catch { stale = true; }
        }
      } catch { stale = true; }
      if (!stale) throw cause;
      await rm(path, { force: true });
    }
  }
  throw new Error("Could not acquire daemon lock");
}

/** Run the production scheduler daemon until SIGTERM or SIGINT. */
export async function runSchedulerDaemon(stateDirectory = join(homedir(), ".pi", "agent", "scheduler")): Promise<void> {
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await chmod(stateDirectory, 0o700);
  const lockPath = join(stateDirectory, "daemon.lock");
  const lock = await acquireDaemonLock(lockPath);
  const piPath = process.env.PI_SCHEDULER_PI_PATH;
  const supervisorPath = process.env.PI_SCHEDULER_SUPERVISOR_PATH;
  if (!piPath || !supervisorPath) {
    await lock.close();
    await rm(lockPath, { force: true });
    throw new Error("Scheduler executable paths are not configured");
  }
  const clock = new SystemClock();
  const store = new SqliteSchedulerStore(join(stateDirectory, "scheduler.sqlite"));
  const worker = new SupervisedPiWorker({
    nodePath: process.execPath,
    supervisorPath,
    piPath,
    runsDirectory: join(stateDirectory, "runs"),
    committer: {
      async commit(runId, supervisor) {
        const marked = store.markRunning(runId, clock.now(), supervisor);
        return marked.ok ? { ok: true as const, value: undefined } : { ok: false as const, error: marked.error };
      },
    },
  });
  const authProbe = new PiBackgroundAuthProbe(piPath);
  const trustProbe = new PiProjectTrustProbe(join(homedir(), ".pi", "agent"));
  const modelProbe = new PiModelAvailabilityProbe(piPath);
  const dispatcher = new RunDispatcher({
    store,
    clock,
    worker,
    notifier: new MacOsNotificationAdapter(),
    preflight: {
      async verify(job) {
        const trust = trustProbe.verify(job.cwd);
        return trust.ok
          ? { ok: true, value: undefined }
          : { ok: false, error: { tag: "ProjectTrustRequired", message: trust.error.message } };
      },
    },
  });
  const service = new SchedulerApplicationService({
    store,
    clock,
    runCancellation: dispatcher,
    authProbe,
    trustProbe,
    modelProbe,
  });
  const runtime = new SchedulerRuntime({ store, clock, dispatcher, runsDirectory: join(stateDirectory, "runs") });
  const server = await startSchedulerServer({
    socketPath: join(stateDirectory, "scheduler.sock"),
    service,
    recordOperation: (record) => { process.stdout.write(`${JSON.stringify(record)}\n`); },
  });
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  try {
    await runtime.run(controller.signal);
  } finally {
    await dispatcher.cancelAll();
    await server.close();
    store.close();
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runSchedulerDaemon(process.argv[2]).catch(() => { process.exitCode = 1; });
}
