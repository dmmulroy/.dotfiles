import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import type { Job, JobQuery, Run, RunQuery, SchedulerHealth } from "./domain.ts";
import {
  ApprovalRequiredError,
  BackgroundAuthenticationError,
  DaemonUnavailableError,
  InvalidInputError,
  InvalidScheduleError,
  JobConflictError,
  JobNotFoundError,
  ModelUnavailableError,
  ProjectTrustRequiredError,
  ProtocolError,
  RunNotFoundError,
  StoreUnavailableError,
  type SchedulerError,
} from "./errors.ts";
import {
  parseJobDto,
  parseJobsDto,
  parseRunDto,
  parseRunsDto,
  parseSchedulerResponse,
  type SchedulerErrorDto,
  type SchedulerMethod,
} from "./protocol.ts";
import { failure, success, type Result } from "./result.ts";

const MAX_FRAME_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Client operations consumed by scheduler command and tool adapters. */
export interface SchedulerClient {
  createJob(input: unknown): Promise<Result<Job, SchedulerError>>;
  listJobs(query?: JobQuery): Promise<Result<readonly Job[], SchedulerError>>;
  health(): Promise<Result<SchedulerHealth, SchedulerError>>;
  jobAction(action: "approve" | "pause" | "resume" | "delete" | "runNow", id: string): Promise<Result<unknown, SchedulerError>>;
  updateJob(id: string, input: unknown): Promise<Result<Job, SchedulerError>>;
  listRuns(query?: RunQuery): Promise<Result<readonly Run[], SchedulerError>>;
  getRun(id: string): Promise<Result<Run, SchedulerError>>;
  cancelRun(id: string): Promise<Result<Run, SchedulerError>>;
  markRunsRead(ids: readonly string[]): Promise<Result<void, SchedulerError>>;
}

function remoteError(dto: SchedulerErrorDto): SchedulerError {
  switch (dto.tag) {
    case "InvalidScheduleError": return new InvalidScheduleError(dto.message);
    case "InvalidInputError": return new InvalidInputError(dto.message);
    case "JobNotFoundError": return new JobNotFoundError(String(dto.fields?.jobId ?? "unknown"));
    case "RunNotFoundError": return new RunNotFoundError(String(dto.fields?.runId ?? "unknown"));
    case "JobConflictError": return new JobConflictError(dto.message);
    case "ApprovalRequiredError": return new ApprovalRequiredError();
    case "ProjectTrustRequiredError": return new ProjectTrustRequiredError();
    case "BackgroundAuthenticationError": return new BackgroundAuthenticationError();
    case "ModelUnavailableError": return new ModelUnavailableError();
    case "StoreUnavailableError": return new StoreUnavailableError(undefined);
    case "DaemonUnavailableError": return new DaemonUnavailableError();
    default: return new ProtocolError(dto.message);
  }
}

/** Client for one-request-per-connection scheduler JSONL protocol calls. */
export class UnixSocketSchedulerClient implements SchedulerClient {
  /** Create a client targeting an owner-only Unix socket. */
  constructor(readonly socketPath: string) {}

  async #request(method: SchedulerMethod, payload: unknown): Promise<Result<unknown, SchedulerError>> {
    const id = randomUUID();
    const frame = `${JSON.stringify({ version: 1, id, method, payload })}\n`;
    return new Promise((resolve) => {
      const socket = createConnection(this.socketPath);
      let settled = false;
      let buffer = "";
      const finish = (result: Result<unknown, SchedulerError>) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setEncoding("utf8");
      socket.once("connect", () => socket.write(frame));
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES) {
          finish(failure(new ProtocolError("The scheduler response exceeded the frame limit")));
          return;
        }
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const line = buffer.slice(0, newline);
        let value: unknown;
        try { value = JSON.parse(line); }
        catch { finish(failure(new ProtocolError())); return; }
        const response = parseSchedulerResponse(value, id);
        if (!response.ok) { finish(failure(response.error)); return; }
        finish(response.value.ok ? success(response.value.data) : failure(remoteError(response.value.error)));
      });
      socket.once("error", () => finish(failure(new DaemonUnavailableError())));
      socket.once("end", () => {
        if (!settled) finish(failure(new ProtocolError("The scheduler closed the connection without a response")));
      });
    });
  }

  /** Create a draft or active job from boundary input. */
  async createJob(input: unknown): Promise<Result<Job, SchedulerError>> {
    const response = await this.#request("job.create", input);
    if (!response.ok) return response;
    const job = parseJobDto(response.value);
    return job.ok ? job : failure(job.error);
  }

  /** List jobs matching an optional query. */
  async listJobs(query: JobQuery = {}): Promise<Result<readonly Job[], SchedulerError>> {
    const response = await this.#request("job.list", query);
    if (!response.ok) return response;
    const jobs = parseJobsDto(response.value);
    return jobs.ok ? jobs : failure(jobs.error);
  }

  /** Return daemon and database health. */
  async health(): Promise<Result<SchedulerHealth, SchedulerError>> {
    const response = await this.#request("health", {});
    if (!response.ok) return response;
    if (typeof response.value !== "object" || response.value === null) return failure(new ProtocolError());
    if (!isRecord(response.value)) return failure(new ProtocolError());
    const value = response.value;
    if ((value.status !== "ok" && value.status !== "degraded") || value.version !== 1 || typeof value.pid !== "number" || (value.database !== "ok" && value.database !== "unavailable")) return failure(new ProtocolError());
    return success({ status: value.status, version: 1, pid: value.pid, database: value.database });
  }

  /** Invoke a job mutation that requires only a job identifier. */
  async jobAction(action: "approve" | "pause" | "resume" | "delete" | "runNow", id: string): Promise<Result<unknown, SchedulerError>> {
    const method: SchedulerMethod = action === "approve" ? "job.approve" : action === "pause" ? "job.pause" : action === "resume" ? "job.resume" : action === "delete" ? "job.delete" : "job.runNow";
    return this.#request(method, { id });
  }

  /** Update explicitly supplied fields on a job. */
  async updateJob(id: string, input: unknown): Promise<Result<Job, SchedulerError>> {
    const response = await this.#request("job.update", { id, input });
    if (!response.ok) return response;
    const job = parseJobDto(response.value);
    return job.ok ? job : failure(job.error);
  }

  /** List run DTOs matching an optional query. */
  async listRuns(query: RunQuery = {}): Promise<Result<readonly Run[], SchedulerError>> {
    const response = await this.#request("run.list", query);
    if (!response.ok) return response;
    const runs = parseRunsDto(response.value);
    return runs.ok ? runs : failure(runs.error);
  }

  /** Return one run DTO by identifier. */
  async getRun(id: string): Promise<Result<Run, SchedulerError>> {
    const response = await this.#request("run.get", { id });
    if (!response.ok) return response;
    const run = parseRunDto(response.value);
    return run.ok ? run : failure(run.error);
  }

  /** Cancel one queued or supervised run. */
  async cancelRun(id: string): Promise<Result<Run, SchedulerError>> {
    const response = await this.#request("run.cancel", { id });
    if (!response.ok) return response;
    const run = parseRunDto(response.value);
    return run.ok ? run : failure(run.error);
  }

  /** Mark terminal inbox entries as read. */
  async markRunsRead(ids: readonly string[]): Promise<Result<void, SchedulerError>> {
    const response = await this.#request("run.markRead", { ids });
    return response.ok ? success(undefined) : response;
  }
}
