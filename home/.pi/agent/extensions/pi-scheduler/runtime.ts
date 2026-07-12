import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseUnixMillis,
  type AgentRunOutput,
  type Clock,
  type Job,
  type Run,
  type RunId,
  type SafeRunFailure,
} from "./domain.ts";
import { JobConflictError, RunNotFoundError, type SchedulerError } from "./errors.ts";
import { failure, success, type Result } from "./result.ts";
import type { SchedulerStore } from "./store.ts";
import { parseWorkerCompletion, type AgentWorker } from "./worker.ts";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Notification capability invoked after a terminal run is persisted. */
export interface RunNotifier {
  notifyRunFinished(input: {
    readonly jobId: Run["jobId"];
    readonly jobName: string;
    readonly runId: RunId;
    readonly status: Run["status"] | "blocked";
  }): Promise<void>;
}

/** Notification adapter that intentionally performs no side effect. */
export class NoopNotifier implements RunNotifier {
  /** Accept a completion without notifying. */
  async notifyRunFinished(_input: Parameters<RunNotifier["notifyRunFinished"]>[0]): Promise<void> {}
}

/** Cheap per-run checks that must hold immediately before Pi starts. */
export interface ExecutionPreflight {
  verify(job: Job): Promise<Result<void, SafeRunFailure>>;
}

/** Cancellation capability exposed to the application service. */
export interface RunCancellation {
  cancel(id: RunId): Promise<Result<Run, RunNotFoundError | JobConflictError>>;
}

/** Executes queued runs one at a time and owns their cancellation signals. */
export class RunDispatcher implements RunCancellation {
  readonly #store: SchedulerStore;
  readonly #clock: Clock;
  readonly #worker: AgentWorker;
  readonly #notifier: RunNotifier;
  readonly #preflight?: ExecutionPreflight;
  readonly #active = new Map<RunId, { readonly controller: AbortController; readonly completion: Promise<void> }>();

  /** Construct dispatch coordination over persistence, worker, and notification ports. */
  constructor(options: { readonly store: SchedulerStore; readonly clock: Clock; readonly worker: AgentWorker; readonly notifier?: RunNotifier; readonly preflight?: ExecutionPreflight }) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.#worker = options.worker;
    this.#notifier = options.notifier ?? new NoopNotifier();
    this.#preflight = options.preflight;
  }

  #job(id: Run["jobId"]): Job | undefined {
    const jobs = this.#store.listJobs({ includeDeleted: true });
    return jobs.ok ? jobs.value.find((job) => job.id === id) : undefined;
  }

  /** Dispatch one queued run; duplicate calls for the same run share its completion. */
  async dispatch(run: Extract<Run, { status: "queued" }>): Promise<void> {
    const existing = this.#active.get(run.id);
    if (existing) return existing.completion;
    const controller = new AbortController();
    const completion = this.#execute(run, controller).finally(() => { this.#active.delete(run.id); });
    this.#active.set(run.id, { controller, completion });
    return completion;
  }

  async #execute(run: Extract<Run, { status: "queued" }>, controller: AbortController): Promise<void> {
    const job = this.#job(run.jobId);
    if (!job) return;
    const preflight = await this.#preflight?.verify(job);
    if (preflight && !preflight.ok) {
      await this.#finish(run, job, {
        exitCode: 1,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
        eventLogPath: job.cwd,
        terminalStatus: "failed",
        failure: preflight.error,
      });
      return;
    }
    const output = await this.#worker.run({
      runId: run.id,
      jobId: run.jobId,
      name: job.name,
      scheduledFor: run.scheduledFor,
      cwd: job.cwd,
      prompt: job.prompt,
      execution: job.execution,
    }, controller.signal);
    if (!output.ok) {
      await this.#finish(run, job, {
        exitCode: 1,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
        eventLogPath: job.cwd,
        terminalStatus: "failed",
        failure: { tag: "InvalidOutput", message: "The worker supervisor failed" },
      });
      return;
    }
    await this.#finish(run, job, output.value);
  }

  async #finish(run: Run, job: Job, output: AgentRunOutput): Promise<void> {
    const finishedAt = this.#clock.now();
    let finished: Result<Run, SchedulerError>;
    if (output.terminalStatus === "succeeded" && output.finalAssistantText !== undefined) {
      finished = this.#store.finishRun({
        runId: run.id,
        status: "succeeded",
        finishedAt,
        result: { assistantText: output.finalAssistantText, usage: output.usage, eventLogPath: output.eventLogPath },
      });
    } else {
      const status = output.terminalStatus === "timedOut" ? "timedOut" : output.terminalStatus === "cancelled" ? "cancelled" : "failed";
      finished = this.#store.finishRun({ runId: run.id, status, finishedAt, failure: output.failure ?? { tag: "PiExited", message: "Pi exited before completing the scheduled run", exitCode: output.exitCode } });
    }
    if (!finished.ok) return;
    const tag = finished.value.status === "failed" ? finished.value.failure.tag : undefined;
    const reason = tag === "AuthenticationUnavailable" ? "AuthenticationUnavailable" : tag === "ProjectTrustRequired" ? "ProjectTrustRequired" : tag === "ModelUnavailable" ? "ModelUnavailable" : undefined;
    if (reason && job.status === "active") this.#store.transitionJob({ kind: "block", id: job.id, at: finishedAt, reason });
    await this.#notifier.notifyRunFinished({ jobId: run.jobId, jobName: job.name, runId: run.id, status: reason ? "blocked" : finished.value.status });
    await this.#worker.cleanupArtifacts(run.id);
  }

  /** Import a completion produced while the daemon was unavailable. */
  async importCompletion(run: Extract<Run, { status: "running" }>, output: AgentRunOutput): Promise<void> {
    const job = this.#job(run.jobId);
    if (job) await this.#finish(run, job, output);
  }

  /** Abort an active supervisor and wait until cancellation is persisted. */
  async cancel(id: RunId): Promise<Result<Run, RunNotFoundError | JobConflictError>> {
    const active = this.#active.get(id);
    if (!active) return failure(new JobConflictError("The run is not active in this daemon"));
    active.controller.abort();
    await active.completion;
    const runs = this.#store.listRuns({ runId: id });
    if (!runs.ok) return failure(new JobConflictError("The cancelled run could not be read"));
    return runs.value[0] ? success(runs.value[0]) : failure(new RunNotFoundError(id));
  }

  /** Cancel all daemon-owned workers during graceful shutdown. */
  async cancelAll(): Promise<void> {
    const active = [...this.#active.values()];
    for (const item of active) item.controller.abort();
    await Promise.all(active.map((item) => item.completion));
  }
}

function parseHeartbeat(value: unknown, token: string): number | undefined {
  if (!isRecord(value)) return undefined;
  return value.version === 1 && value.token === token && typeof value.at === "number" && Number.isSafeInteger(value.at) ? value.at : undefined;
}

/** Durable wake loop that claims occurrences, reconciles supervisors, and enforces global concurrency one. */
export class SchedulerRuntime {
  readonly #store: SchedulerStore;
  readonly #clock: Clock;
  readonly #dispatcher: RunDispatcher;
  readonly #runsDirectory: string;
  #lastRetentionAt: number | undefined;

  /** Construct a scheduler runtime around durable store and worker coordination. */
  constructor(options: { readonly store: SchedulerStore; readonly clock: Clock; readonly dispatcher: RunDispatcher; readonly runsDirectory: string }) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.#dispatcher = options.dispatcher;
    this.#runsDirectory = options.runsDirectory;
  }

  async #reconcile(): Promise<void> {
    const running = this.#store.listRuns({ status: "running", limit: 1000 });
    if (!running.ok) return;
    const jobs = this.#store.listJobs({ includeDeleted: true });
    if (!jobs.ok) return;
    const now = this.#clock.now();
    for (const run of running.value) {
      if (run.status !== "running") continue;
      const completionPath = join(this.#runsDirectory, run.id, "completion.json");
      try {
        const text = await readFile(completionPath, "utf8");
        const completion: unknown = JSON.parse(text);
        const parsed = parseWorkerCompletion(completion, run.supervisorToken);
        if (parsed.ok) {
          await this.#dispatcher.importCompletion(run, parsed.value);
          continue;
        }
      } catch { /* completion is not available yet */ }
      const job = jobs.value.find((candidate) => candidate.id === run.jobId);
      const staleAfter = run.startedAt + (job?.execution.timeout ?? 0) + 5_000;
      let heartbeatAt: number | undefined;
      try {
        const heartbeat: unknown = JSON.parse(await readFile(join(this.#runsDirectory, run.id, "heartbeat.json"), "utf8"));
        heartbeatAt = parseHeartbeat(heartbeat, run.supervisorToken);
      } catch { /* heartbeat may not have been written yet */ }
      if (now > staleAfter && (heartbeatAt === undefined || now - heartbeatAt > 5_000)) {
        this.#store.finishRun({ runId: run.id, status: "interrupted", finishedAt: now, failure: { tag: "Interrupted", message: "The worker supervisor stopped reporting progress" } });
      }
    }
  }

  /** Run until aborted, continuously claiming due work and reconciling durable supervisors. */
  async run(signal: AbortSignal): Promise<void> {
    const abortWorkers = () => { void this.#dispatcher.cancelAll().catch(() => undefined); };
    signal.addEventListener("abort", abortWorkers);
    try {
      while (!signal.aborted) {
        await this.#reconcile();
      const now = this.#clock.now();
      if (this.#lastRetentionAt === undefined || now - this.#lastRetentionAt >= 86_400_000) {
        this.#lastRetentionAt = now;
        this.#store.pruneRetention({
          now,
          runMaxAgeMs: 30 * 86_400_000,
          runMaxCountPerJob: 100,
          eventLogMaxAgeMs: 7 * 86_400_000,
          eventLogMaxCountPerJob: 20,
        });
      }
      this.#store.claimDueRuns(now, 100);
      const running = this.#store.listRuns({ status: "running", limit: 1 });
      if (running.ok && running.value.length === 0) {
        const queued = this.#store.listRuns({ status: "queued", limit: 1000 });
        const oldest = queued.ok ? queued.value.at(-1) : undefined;
        if (oldest?.status === "queued") {
          await this.#dispatcher.dispatch(oldest);
          continue;
        }
      }
      const wakeup = this.#store.getNextWakeup();
      const maintenanceWake = parseUnixMillis(Date.now() + 1_000);
      if (!maintenanceWake.ok) return;
      const target = wakeup.ok && wakeup.value !== undefined && wakeup.value < maintenanceWake.value ? wakeup.value : maintenanceWake.value;
        try { await this.#clock.sleepUntil(target, signal); }
        catch { if (!signal.aborted) throw new Error("Scheduler sleep failed"); }
      }
    } finally {
      signal.removeEventListener("abort", abortWorkers);
    }
  }
}
