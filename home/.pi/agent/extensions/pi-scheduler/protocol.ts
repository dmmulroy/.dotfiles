import {
  parseAbsolutePath,
  parseDurationMs,
  parseJobId,
  parseRunId,
  parseToolName,
  parseUnixMillis,
  type CreateJobInput,
  type ExecutionPolicy,
  type Job,
  type JobQuery,
  type Run,
  type RunQuery,
  type ThinkingLevel,
  type UpdateJobInput,
} from "./domain.ts";
import {
  DaemonUnavailableError,
  InvalidInputError,
  ProtocolError,
  RunNotFoundError,
  type SchedulerError,
} from "./errors.ts";
import { failure, success, type Result } from "./result.ts";
import { parseSchedule } from "./schedule.ts";
import type { SchedulerService } from "./service.ts";

/** Methods supported by protocol version one. */
export type SchedulerMethod =
  | "health"
  | "job.create"
  | "job.approve"
  | "job.update"
  | "job.list"
  | "job.pause"
  | "job.resume"
  | "job.delete"
  | "job.runNow"
  | "run.list"
  | "run.get"
  | "run.cancel"
  | "run.markRead";

/** One parsed scheduler request frame. */
export interface SchedulerRequestDto {
  readonly version: 1;
  readonly id: string;
  readonly method: SchedulerMethod;
  readonly payload: unknown;
}

/** Safe expected error projection sent over the Unix socket. */
export interface SchedulerErrorDto {
  readonly tag: SchedulerError["_tag"] | "InternalError";
  readonly message: string;
  readonly fields?: Readonly<Record<string, string | number>>;
}

/** One scheduler response frame. */
export type SchedulerResponseDto =
  | { readonly version: 1; readonly id: string; readonly ok: true; readonly data: unknown }
  | { readonly version: 1; readonly id: string; readonly ok: false; readonly error: SchedulerErrorDto };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseString(input: unknown, label: string, options: { readonly allowEmpty?: boolean; readonly max?: number } = {}): Result<string, InvalidInputError> {
  if (typeof input !== "string" || (!options.allowEmpty && input.trim().length === 0) || input.length > (options.max ?? 100_000)) {
    return failure(new InvalidInputError(`${label} is invalid`));
  }
  return success(input);
}

function parseBoolean(input: unknown, label: string): Result<boolean, InvalidInputError> {
  return typeof input === "boolean" ? success(input) : failure(new InvalidInputError(`${label} is invalid`));
}

function isThinkingLevel(input: unknown): input is ThinkingLevel {
  return input === "off" || input === "minimal" || input === "low" || input === "medium" || input === "high" || input === "xhigh";
}

function parseThinkingLevel(input: unknown): Result<ThinkingLevel, InvalidInputError> {
  return isThinkingLevel(input) ? success(input) : failure(new InvalidInputError("thinkingLevel is invalid"));
}

function isSchedulerMethod(input: unknown): input is SchedulerMethod {
  return input === "health" || input === "job.create" || input === "job.approve" || input === "job.update" || input === "job.list" || input === "job.pause" || input === "job.resume" || input === "job.delete" || input === "job.runNow" || input === "run.list" || input === "run.get" || input === "run.cancel" || input === "run.markRead";
}

function isJobStatus(input: unknown): input is Job["status"] {
  return input === "draft" || input === "active" || input === "paused" || input === "blocked" || input === "deleted";
}

function isRunStatus(input: unknown): input is Run["status"] {
  return input === "queued" || input === "running" || input === "succeeded" || input === "failed" || input === "timedOut" || input === "cancelled" || input === "interrupted" || input === "skipped";
}

function isBlockReason(input: unknown): input is Extract<Job, { status: "blocked" }>["blockReason"] {
  return input === "AuthenticationUnavailable" || input === "ProjectTrustRequired" || input === "ModelUnavailable" || input === "ExecutableUnavailable";
}

function isFailureTag(input: unknown): input is Extract<Run, { status: "failed" }>["failure"]["tag"] {
  return input === "PiExited" || input === "TimedOut" || input === "Cancelled" || input === "Interrupted" || input === "InvalidOutput" || input === "AuthenticationUnavailable" || input === "ProjectTrustRequired" || input === "ModelUnavailable";
}

function isErrorTag(input: unknown): input is SchedulerErrorDto["tag"] {
  return input === "InternalError" || input === "InvalidScheduleError" || input === "InvalidJobIdError" || input === "InvalidRunIdError" || input === "InvalidInstantError" || input === "InvalidDurationError" || input === "InvalidPathError" || input === "InvalidInputError" || input === "JobNotFoundError" || input === "RunNotFoundError" || input === "JobConflictError" || input === "ApprovalRequiredError" || input === "ProjectTrustRequiredError" || input === "BackgroundAuthenticationError" || input === "ModelUnavailableError" || input === "DaemonUnavailableError" || input === "StoreUnavailableError" || input === "ProtocolError";
}

/** Parse an execution policy from an untrusted boundary object. */
export function parseExecutionPolicy(input: unknown): Result<ExecutionPolicy, InvalidInputError> {
  if (!isRecord(input)) return failure(new InvalidInputError("execution is invalid"));
  const timeout = parseDurationMs(input.timeout ?? input.timeoutMs);
  if (!timeout.ok) return failure(new InvalidInputError("timeoutMs is invalid"));
  if (!Array.isArray(input.tools)) return failure(new InvalidInputError("tools is invalid"));
  const tools: ExecutionPolicy["tools"][number][] = [];
  for (const value of input.tools) {
    const tool = parseToolName(value);
    if (!tool.ok) return failure(new InvalidInputError("tools is invalid"));
    if (!tools.includes(tool.value)) tools.push(tool.value);
  }
  if (!isRecord(input.model)) return failure(new InvalidInputError("model is invalid"));
  const provider = parseString(input.model.provider, "provider", { max: 200 });
  const modelId = parseString(input.model.modelId, "modelId", { max: 500 });
  const thinkingLevel = parseThinkingLevel(input.model.thinkingLevel);
  if (!provider.ok) return provider;
  if (!modelId.ok) return modelId;
  if (!thinkingLevel.ok) return thinkingLevel;
  const overlap = input.overlap;
  const misfire = input.misfire;
  if (overlap !== "skip" && overlap !== "queueOne") return failure(new InvalidInputError("overlap is invalid"));
  if (misfire !== "skip" && misfire !== "fireOnce") return failure(new InvalidInputError("misfire is invalid"));
  return success({
    timeout: timeout.value,
    tools,
    model: { provider: provider.value, modelId: modelId.value, thinkingLevel: thinkingLevel.value },
    overlap,
    misfire,
  });
}

/** Parse a complete create-job payload from unknown protocol or CLI data. */
export function parseCreateJobInput(
  input: unknown,
  defaultTimezone?: string,
): Result<CreateJobInput, InvalidInputError> {
  if (!isRecord(input)) return failure(new InvalidInputError());
  const name = parseString(input.name, "name", { max: 200 });
  const schedule = parseSchedule(input.schedule, defaultTimezone);
  const prompt = parseString(input.prompt, "prompt");
  const cwd = parseAbsolutePath(input.cwd);
  const execution = parseExecutionPolicy(input.execution);
  const activate = parseBoolean(input.activate, "activate");
  if (!name.ok) return name;
  if (!schedule.ok) return failure(new InvalidInputError(schedule.error.message));
  if (!prompt.ok) return prompt;
  if (!cwd.ok) return failure(new InvalidInputError(cwd.error.message));
  if (!execution.ok) return execution;
  if (!activate.ok) return activate;
  return success({ name: name.value.trim(), schedule: schedule.value, prompt: prompt.value, cwd: cwd.value, execution: execution.value, activate: activate.value });
}

/** Parse a partial update-job payload from unknown protocol or CLI data. */
export function parseUpdateJobInput(input: unknown): Result<UpdateJobInput, InvalidInputError> {
  if (!isRecord(input)) return failure(new InvalidInputError());
  const output: {
    name?: string;
    schedule?: CreateJobInput["schedule"];
    prompt?: string;
    cwd?: CreateJobInput["cwd"];
    execution?: ExecutionPolicy;
  } = {};
  if (input.name !== undefined) {
    const value = parseString(input.name, "name", { max: 200 });
    if (!value.ok) return value;
    output.name = value.value.trim();
  }
  if (input.schedule !== undefined) {
    const value = parseSchedule(input.schedule);
    if (!value.ok) return failure(new InvalidInputError(value.error.message));
    output.schedule = value.value;
  }
  if (input.prompt !== undefined) {
    const value = parseString(input.prompt, "prompt");
    if (!value.ok) return value;
    output.prompt = value.value;
  }
  if (input.cwd !== undefined) {
    const value = parseAbsolutePath(input.cwd);
    if (!value.ok) return failure(new InvalidInputError(value.error.message));
    output.cwd = value.value;
  }
  if (input.execution !== undefined) {
    const value = parseExecutionPolicy(input.execution);
    if (!value.ok) return value;
    output.execution = value.value;
  }
  if (Object.keys(output).length === 0) return failure(new InvalidInputError("No job fields were supplied"));
  return success(output);
}

/** Parse one LF-delimited request frame. */
export function parseSchedulerRequest(input: unknown): Result<SchedulerRequestDto, ProtocolError> {
  if (!isRecord(input) || input.version !== 1 || typeof input.id !== "string" || input.id.length === 0 || input.id.length > 128 || typeof input.method !== "string") {
    return failure(new ProtocolError());
  }
  if (!isSchedulerMethod(input.method)) return failure(new ProtocolError("The scheduler method is unsupported"));
  return success({ version: 1, id: input.id, method: input.method, payload: input.payload });
}

function parseJobQuery(payload: unknown): Result<JobQuery, InvalidInputError> {
  if (payload === undefined || payload === null) return success({});
  if (!isRecord(payload)) return failure(new InvalidInputError());
  const query: { includeDeleted?: boolean; status?: Job["status"] } = {};
  if (payload.includeDeleted !== undefined) {
    const parsed = parseBoolean(payload.includeDeleted, "includeDeleted");
    if (!parsed.ok) return parsed;
    query.includeDeleted = parsed.value;
  }
  if (payload.status !== undefined) {
    if (!isJobStatus(payload.status)) return failure(new InvalidInputError("status is invalid"));
    query.status = payload.status;
  }
  return success(query);
}

function parseRunQuery(payload: unknown): Result<RunQuery, InvalidInputError> {
  if (payload === undefined || payload === null) return success({});
  if (!isRecord(payload)) return failure(new InvalidInputError());
  const query: { jobId?: RunQuery["jobId"]; runId?: RunQuery["runId"]; status?: Run["status"]; unreadOnly?: boolean; limit?: number } = {};
  if (payload.jobId !== undefined) {
    const parsed = parseJobId(payload.jobId);
    if (!parsed.ok) return failure(new InvalidInputError(parsed.error.message));
    query.jobId = parsed.value;
  }
  if (payload.runId !== undefined) {
    const parsed = parseRunId(payload.runId);
    if (!parsed.ok) return failure(new InvalidInputError(parsed.error.message));
    query.runId = parsed.value;
  }
  if (payload.status !== undefined) {
    if (!isRunStatus(payload.status)) return failure(new InvalidInputError("status is invalid"));
    query.status = payload.status;
  }
  if (payload.unreadOnly !== undefined) {
    const parsed = parseBoolean(payload.unreadOnly, "unreadOnly");
    if (!parsed.ok) return parsed;
    query.unreadOnly = parsed.value;
  }
  if (payload.limit !== undefined) {
    if (typeof payload.limit !== "number" || !Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 1000) return failure(new InvalidInputError("limit is invalid"));
    query.limit = payload.limit;
  }
  return success(query);
}

/** Project a known expected failure without leaking causes or arbitrary values. */
export function projectSchedulerError(error: SchedulerError | InvalidInputError): SchedulerErrorDto {
  let fields: Readonly<Record<string, string | number>> | undefined;
  if (error._tag === "JobNotFoundError") fields = { jobId: error.jobId };
  if (error._tag === "RunNotFoundError") fields = { runId: error.runId };
  return { tag: error._tag, message: error.message, ...(fields ? { fields } : {}) };
}

function errorResponse(id: string, error: SchedulerError | InvalidInputError): SchedulerResponseDto {
  return { version: 1, id, ok: false, error: projectSchedulerError(error) };
}

/** Dispatch one parsed request to the scheduler service and return a safe response. */
export async function handleSchedulerRequest(service: SchedulerService, raw: unknown): Promise<SchedulerResponseDto> {
  const request = parseSchedulerRequest(raw);
  if (!request.ok) return errorResponse(isRecord(raw) && typeof raw.id === "string" ? raw.id : "invalid", request.error);
  const { id, method, payload } = request.value;
  try {
    let result: Result<unknown, SchedulerError | InvalidInputError>;
    if (method === "health") {
      result = success(await service.health());
    } else if (method === "job.create") {
      const input = parseCreateJobInput(payload);
      result = input.ok ? await service.createJob(input.value) : input;
    } else if (method === "job.list") {
      const query = parseJobQuery(payload);
      result = query.ok ? await service.listJobs(query.value) : query;
    } else if (method === "run.list") {
      const query = parseRunQuery(payload);
      result = query.ok ? await service.listRuns(query.value) : query;
    } else if (method === "run.markRead") {
      if (!isRecord(payload) || !Array.isArray(payload.ids)) result = failure(new InvalidInputError("ids is invalid"));
      else {
        const ids = [];
        let invalid = false;
        for (const value of payload.ids) {
          const parsed = parseRunId(value);
          if (!parsed.ok) { invalid = true; break; }
          ids.push(parsed.value);
        }
        result = invalid ? failure(new InvalidInputError("ids is invalid")) : await service.markRunsRead(ids);
      }
    } else if (method === "job.update") {
      if (!isRecord(payload)) result = failure(new InvalidInputError());
      else {
        const jobId = parseJobId(payload.id);
        const input = parseUpdateJobInput(payload.input);
        result = !jobId.ok ? failure(new InvalidInputError(jobId.error.message)) : !input.ok ? input : await service.updateJob(jobId.value, input.value);
      }
    } else if (method === "run.get") {
      if (!isRecord(payload)) result = failure(new InvalidInputError("An id is required"));
      else {
        const runId = parseRunId(payload.id);
        if (!runId.ok) result = failure(new InvalidInputError(runId.error.message));
        else {
          const runs = await service.listRuns({ runId: runId.value });
          result = runs.ok ? (runs.value[0] ? success(runs.value[0]) : failure(new RunNotFoundError(runId.value))) : runs;
        }
      }
    } else if (method === "run.cancel") {
      if (!isRecord(payload)) result = failure(new InvalidInputError("An id is required"));
      else {
        const runId = parseRunId(payload.id);
        result = runId.ok ? await service.cancelRun(runId.value) : failure(new InvalidInputError(runId.error.message));
      }
    } else {
      if (!isRecord(payload)) result = failure(new InvalidInputError("An id is required"));
      else {
        const jobId = parseJobId(payload.id);
        if (!jobId.ok) result = failure(new InvalidInputError(jobId.error.message));
        else if (method === "job.approve") result = await service.approveJob(jobId.value);
        else if (method === "job.pause") result = await service.pauseJob(jobId.value);
        else if (method === "job.resume") result = await service.resumeJob(jobId.value);
        else if (method === "job.delete") result = await service.deleteJob(jobId.value);
        else result = await service.runNow(jobId.value);
      }
    }
    return result.ok
      ? { version: 1, id, ok: true, data: result.value }
      : errorResponse(id, result.error);
  } catch {
    return { version: 1, id, ok: false, error: { tag: "InternalError", message: "The scheduler request failed" } };
  }
}

/** Parse a response envelope before method-specific data parsing. */
export function parseSchedulerResponse(input: unknown, expectedId: string): Result<SchedulerResponseDto, ProtocolError | DaemonUnavailableError> {
  if (!isRecord(input) || input.version !== 1 || input.id !== expectedId || typeof input.ok !== "boolean") return failure(new ProtocolError("The scheduler response is invalid"));
  if (input.ok) return success({ version: 1, id: expectedId, ok: true, data: input.data });
  if (!isRecord(input.error) || !isErrorTag(input.error.tag) || typeof input.error.message !== "string") return failure(new ProtocolError("The scheduler error response is invalid"));
  let fields: Readonly<Record<string, string | number>> | undefined;
  if (isRecord(input.error.fields)) {
    const parsedFields: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(input.error.fields)) {
      if (typeof value !== "string" && typeof value !== "number") return failure(new ProtocolError());
      parsedFields[key] = value;
    }
    fields = parsedFields;
  }
  return success({ version: 1, id: expectedId, ok: false, error: { tag: input.error.tag, message: input.error.message, ...(fields ? { fields } : {}) } });
}

/** Reparse a protocol job DTO through the same domain boundary parsers. */
export function parseJobDto(input: unknown): Result<Job, ProtocolError> {
  if (!isRecord(input)) return failure(new ProtocolError());
  const id = parseJobId(input.id);
  const schedule = parseSchedule(input.schedule);
  const cwd = parseAbsolutePath(input.cwd);
  const execution = parseExecutionPolicy(input.execution);
  const createdAt = parseUnixMillis(input.createdAt);
  const updatedAt = parseUnixMillis(input.updatedAt);
  if (!id.ok || !schedule.ok || !cwd.ok || !execution.ok || !createdAt.ok || !updatedAt.ok || typeof input.name !== "string" || typeof input.prompt !== "string") return failure(new ProtocolError("The job DTO is invalid"));
  const base = { id: id.value, name: input.name, schedule: schedule.value, prompt: input.prompt, cwd: cwd.value, execution: execution.value, createdAt: createdAt.value, updatedAt: updatedAt.value };
  if (input.status === "active") {
    const nextRunAt = parseUnixMillis(input.nextRunAt);
    return nextRunAt.ok ? success({ ...base, status: "active", nextRunAt: nextRunAt.value }) : failure(new ProtocolError());
  }
  if (input.status === "blocked" && isBlockReason(input.blockReason)) {
    return success({ ...base, status: "blocked", nextRunAt: undefined, blockReason: input.blockReason });
  }
  if (input.status === "draft" || input.status === "paused" || input.status === "deleted") return success({ ...base, status: input.status, nextRunAt: undefined });
  return failure(new ProtocolError("The job DTO status is invalid"));
}

/** Reparse an array of protocol job DTOs. */
export function parseJobsDto(input: unknown): Result<readonly Job[], ProtocolError> {
  if (!Array.isArray(input)) return failure(new ProtocolError());
  const jobs: Job[] = [];
  for (const value of input) {
    const parsed = parseJobDto(value);
    if (!parsed.ok) return parsed;
    jobs.push(parsed.value);
  }
  return success(jobs);
}

function parseRunUsage(input: unknown) {
  if (!isRecord(input)) return undefined;
  const values = [input.inputTokens, input.outputTokens, input.cacheReadTokens, input.cacheWriteTokens, input.costUsd];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) return undefined;
  return {
    inputTokens: Number(input.inputTokens), outputTokens: Number(input.outputTokens),
    cacheReadTokens: Number(input.cacheReadTokens), cacheWriteTokens: Number(input.cacheWriteTokens), costUsd: Number(input.costUsd),
  };
}

/** Reparse a protocol run DTO and enforce its state-specific fields. */
export function parseRunDto(input: unknown): Result<Run, ProtocolError> {
  if (!isRecord(input)) return failure(new ProtocolError());
  const id = parseRunId(input.id);
  const jobId = parseJobId(input.jobId);
  const scheduledFor = parseUnixMillis(input.scheduledFor);
  const createdAt = parseUnixMillis(input.createdAt);
  if (!id.ok || !jobId.ok || !scheduledFor.ok || !createdAt.ok || typeof input.missedOccurrences !== "number" || !Number.isSafeInteger(input.missedOccurrences) || input.missedOccurrences < 0) return failure(new ProtocolError("The run DTO is invalid"));
  const readAt = input.readAt === undefined ? undefined : parseUnixMillis(input.readAt);
  if (readAt !== undefined && !readAt.ok) return failure(new ProtocolError());
  const base = { id: id.value, jobId: jobId.value, scheduledFor: scheduledFor.value, createdAt: createdAt.value, missedOccurrences: input.missedOccurrences, ...(readAt?.ok ? { readAt: readAt.value } : {}) };
  if (input.status === "queued") return success({ ...base, status: "queued" });
  const startedAt = input.startedAt === undefined ? undefined : parseUnixMillis(input.startedAt);
  if (startedAt !== undefined && !startedAt.ok) return failure(new ProtocolError());
  if (input.status === "running") {
    if (!startedAt?.ok || typeof input.supervisorPid !== "number" || !Number.isInteger(input.supervisorPid) || typeof input.supervisorToken !== "string") return failure(new ProtocolError());
    return success({ ...base, status: "running", startedAt: startedAt.value, supervisorPid: input.supervisorPid, supervisorToken: input.supervisorToken });
  }
  const finishedAt = parseUnixMillis(input.finishedAt);
  if (!finishedAt.ok) return failure(new ProtocolError());
  if (input.status === "succeeded") {
    if (!startedAt?.ok || !isRecord(input.result) || typeof input.result.assistantText !== "string") return failure(new ProtocolError());
    const usage = parseRunUsage(input.result.usage);
    const eventLogPath = input.result.eventLogPath === undefined ? undefined : parseAbsolutePath(input.result.eventLogPath);
    if (!usage || (eventLogPath !== undefined && !eventLogPath.ok)) return failure(new ProtocolError());
    return success({ ...base, status: "succeeded", startedAt: startedAt.value, finishedAt: finishedAt.value, result: { assistantText: input.result.assistantText, usage, ...(eventLogPath?.ok ? { eventLogPath: eventLogPath.value } : {}) } });
  }
  if (input.status === "failed" || input.status === "timedOut" || input.status === "cancelled" || input.status === "interrupted" || input.status === "skipped") {
    if (!isRecord(input.failure) || typeof input.failure.tag !== "string" || typeof input.failure.message !== "string") return failure(new ProtocolError());
    if (!isFailureTag(input.failure.tag)) return failure(new ProtocolError());
    return success({ ...base, status: input.status, ...(startedAt?.ok ? { startedAt: startedAt.value } : {}), finishedAt: finishedAt.value, failure: { tag: input.failure.tag, message: input.failure.message, ...(typeof input.failure.exitCode === "number" && Number.isInteger(input.failure.exitCode) ? { exitCode: input.failure.exitCode } : {}) } });
  }
  return failure(new ProtocolError("The run DTO status is invalid"));
}

/** Reparse an array of protocol run DTOs. */
export function parseRunsDto(input: unknown): Result<readonly Run[], ProtocolError> {
  if (!Array.isArray(input)) return failure(new ProtocolError());
  const runs: Run[] = [];
  for (const value of input) {
    const parsed = parseRunDto(value);
    if (!parsed.ok) return parsed;
    runs.push(parsed.value);
  }
  return success(runs);
}
