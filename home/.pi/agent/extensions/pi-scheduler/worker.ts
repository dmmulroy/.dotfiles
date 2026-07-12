import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  parseAbsolutePath,
  type AgentRunInput,
  type AgentRunOutput,
  type RunId,
  type RunUsage,
  type SafeRunFailure,
} from "./domain.ts";
import { WorkerProtocolError, WorkerStartError } from "./errors.ts";
import { failure, success, type Result } from "./result.ts";

/** Supervisor identity that must be committed before Pi starts. */
export interface SupervisorIdentity {
  readonly pid: number;
  readonly token: string;
}

/** Durable handshake capability used by a daemon dispatcher. */
export interface SupervisorCommitter {
  commit(runId: RunId, supervisor: SupervisorIdentity): Promise<Result<void, unknown>>;
}

/** Serializable request consumed by a worker supervisor process. */
export interface WorkerRequestDto {
  readonly version: 1;
  readonly token: string;
  readonly runId: string;
  readonly jobId: string;
  readonly name: string;
  readonly scheduledFor: number;
  readonly cwd: string;
  readonly prompt: string;
  readonly timeoutMs: number;
  readonly deadlineAt: number;
  readonly tools: readonly string[];
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: string;
  readonly piPath: string;
  readonly eventsPath: string;
  readonly heartbeatPath: string;
  readonly completionPath: string;
}

/** Worker execution capability used by dispatch coordination. */
export interface AgentWorker {
  run(input: AgentRunInput, signal: AbortSignal): Promise<Result<AgentRunOutput, WorkerStartError | WorkerProtocolError>>;
  cleanupArtifacts(runId: RunId): Promise<void>;
}

/** Construction options for the daemon-side worker adapter. */
export interface SupervisedPiWorkerOptions {
  readonly nodePath: string;
  readonly supervisorPath: string;
  readonly piPath: string;
  readonly runsDirectory: string;
  readonly committer: SupervisorCommitter;
  readonly environment?: NodeJS.ProcessEnv;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSafeFailureTag(value: unknown): SafeRunFailure["tag"] | undefined {
  return value === "PiExited" || value === "TimedOut" || value === "Cancelled" || value === "Interrupted" || value === "InvalidOutput" || value === "AuthenticationUnavailable" || value === "ProjectTrustRequired" || value === "ModelUnavailable" ? value : undefined;
}

function parseUsage(value: unknown): RunUsage | undefined {
  if (!isRecord(value)) return undefined;
  const fields = [value.inputTokens, value.outputTokens, value.cacheReadTokens, value.cacheWriteTokens, value.costUsd];
  if (!fields.every((field) => typeof field === "number" && Number.isFinite(field) && field >= 0)) return undefined;
  return {
    inputTokens: Number(value.inputTokens), outputTokens: Number(value.outputTokens),
    cacheReadTokens: Number(value.cacheReadTokens), cacheWriteTokens: Number(value.cacheWriteTokens),
    costUsd: Number(value.costUsd),
  };
}

/** Parse a supervisor completion file and verify its unguessable run token. */
export function parseWorkerCompletion(value: unknown, expectedToken: string): Result<AgentRunOutput, WorkerProtocolError> {
  if (!isRecord(value) || value.version !== 1 || value.token !== expectedToken || typeof value.exitCode !== "number" || !Number.isInteger(value.exitCode)) return failure(new WorkerProtocolError());
  const usage = parseUsage(value.usage);
  const eventLogPath = parseAbsolutePath(value.eventLogPath);
  if (!usage || !eventLogPath.ok) return failure(new WorkerProtocolError());
  const terminalStatus = value.terminalStatus;
  if (terminalStatus !== "succeeded" && terminalStatus !== "failed" && terminalStatus !== "timedOut" && terminalStatus !== "cancelled") return failure(new WorkerProtocolError());
  const classifiedTag = parseSafeFailureTag(value.failureTag);
  const failureTag: SafeRunFailure["tag"] = terminalStatus === "timedOut" ? "TimedOut" : terminalStatus === "cancelled" ? "Cancelled" : classifiedTag ?? "PiExited";
  const safeFailure: SafeRunFailure | undefined = terminalStatus === "succeeded"
    ? undefined
    : {
        tag: failureTag,
        message: terminalStatus === "timedOut" ? "The scheduled run timed out" : terminalStatus === "cancelled" ? "The scheduled run was cancelled" : failureTag === "AuthenticationUnavailable" ? "Background authentication is unavailable" : failureTag === "ProjectTrustRequired" ? "Saved project trust is required" : failureTag === "ModelUnavailable" ? "The pinned model is unavailable" : "Pi exited before completing the scheduled run",
        ...(value.exitCode === 0 ? {} : { exitCode: value.exitCode }),
      };
  return success({
    exitCode: value.exitCode,
    usage,
    eventLogPath: eventLogPath.value,
    terminalStatus,
    ...(typeof value.finalAssistantText === "string" ? { finalAssistantText: value.finalAssistantText } : {}),
    ...(safeFailure === undefined ? {} : { failure: safeFailure }),
  });
}

/** Daemon-side adapter implementing the supervisor ready/commit/start handshake. */
export class SupervisedPiWorker implements AgentWorker {
  readonly #options: SupervisedPiWorkerOptions;

  /** Construct a worker adapter with resolved executable and state paths. */
  constructor(options: SupervisedPiWorkerOptions) {
    this.#options = options;
  }

  /** Remove supervisor coordination files after terminal state is durable. */
  async cleanupArtifacts(runId: RunId): Promise<void> {
    const directory = join(this.#options.runsDirectory, runId);
    await Promise.all([
      rm(join(directory, "request.json"), { force: true }),
      rm(join(directory, "heartbeat.json"), { force: true }),
      rm(join(directory, "completion.json"), { force: true }),
    ]);
  }

  /** Run one isolated Pi process and return only parsed, safe completion data. */
  async run(input: AgentRunInput, signal: AbortSignal): Promise<Result<AgentRunOutput, WorkerStartError | WorkerProtocolError>> {
    const runDirectory = join(this.#options.runsDirectory, input.runId);
    const requestPath = join(runDirectory, "request.json");
    const completionPath = join(runDirectory, "completion.json");
    const token = randomBytes(24).toString("base64url");
    await mkdir(runDirectory, { recursive: true, mode: 0o700 });
    await chmod(runDirectory, 0o700);
    const request: WorkerRequestDto = {
      version: 1,
      token,
      runId: input.runId,
      jobId: input.jobId,
      name: input.name,
      scheduledFor: input.scheduledFor,
      cwd: input.cwd,
      prompt: input.prompt,
      timeoutMs: input.execution.timeout,
      deadlineAt: Date.now() + input.execution.timeout,
      tools: input.execution.tools,
      provider: input.execution.model.provider,
      modelId: input.execution.model.modelId,
      thinkingLevel: input.execution.model.thinkingLevel,
      piPath: this.#options.piPath,
      eventsPath: join(runDirectory, "events.jsonl"),
      heartbeatPath: join(runDirectory, "heartbeat.json"),
      completionPath,
    };
    await writeFile(requestPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600 });

    return new Promise((resolve) => {
      let settled = false;
      let committed = false;
      const child = spawn(this.#options.nodePath, ["--import", "tsx", this.#options.supervisorPath, requestPath], {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, ...this.#options.environment },
      });
      const finish = (result: Result<AgentRunOutput, WorkerStartError | WorkerProtocolError>) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        resolve(result);
      };
      const abort = () => { if (child.connected) child.send({ type: "cancel", token }); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      child.once("error", (cause) => finish(failure(new WorkerStartError(cause))));
      child.on("message", (message: unknown) => {
        if (!isRecord(message) || message.token !== token || message.type !== "ready" || committed) return;
        if (typeof message.pid !== "number" || !Number.isInteger(message.pid) || message.pid <= 0) {
          finish(failure(new WorkerProtocolError()));
          child.kill();
          return;
        }
        committed = true;
        void this.#options.committer.commit(input.runId, { pid: message.pid, token }).then((result) => {
          if (!result.ok) {
            child.send({ type: "reject", token });
            finish(failure(new WorkerStartError(result.error)));
            return;
          }
          child.send({ type: "start", token });
          if (signal.aborted) child.send({ type: "cancel", token });
        }).catch((cause: unknown) => {
          child.send({ type: "reject", token });
          finish(failure(new WorkerStartError(cause)));
        });
      });
      child.once("exit", () => {
        if (settled) return;
        if (!committed) { finish(failure(new WorkerStartError(undefined))); return; }
        void readFile(completionPath, "utf8").then((text) => {
          let value: unknown;
          try { value = JSON.parse(text); }
          catch { finish(failure(new WorkerProtocolError())); return; }
          finish(parseWorkerCompletion(value, token));
        }).catch(() => finish(failure(new WorkerProtocolError())));
      });
    });
  }
}

