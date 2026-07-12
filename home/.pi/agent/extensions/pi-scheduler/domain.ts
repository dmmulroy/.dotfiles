import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

import {
  InvalidDurationError,
  InvalidInstantError,
  InvalidJobIdError,
  InvalidPathError,
  InvalidRunIdError,
} from "./errors.ts";
import { failure, success, type Result } from "./result.ts";

declare const JobIdBrand: unique symbol;
declare const RunIdBrand: unique symbol;
declare const InstantBrand: unique symbol;
declare const DurationBrand: unique symbol;
declare const AbsolutePathBrand: unique symbol;
declare const CronExpressionBrand: unique symbol;
declare const IanaTimeZoneBrand: unique symbol;
declare const ToolNameBrand: unique symbol;

/** Stable identifier for a scheduled job. */
export type JobId = string & { readonly [JobIdBrand]: true };
/** Stable identifier for one scheduled run. */
export type RunId = string & { readonly [RunIdBrand]: true };
/** Unix epoch milliseconds represented by a safe integer. */
export type UnixMillis = number & { readonly [InstantBrand]: true };
/** Positive whole milliseconds. */
export type DurationMs = number & { readonly [DurationBrand]: true };
/** Normalized absolute filesystem path. */
export type AbsolutePath = string & { readonly [AbsolutePathBrand]: true };
/** Validated five-field cron expression. */
export type CronExpression = string & { readonly [CronExpressionBrand]: true };
/** Runtime-supported IANA timezone. */
export type IanaTimeZone = string & { readonly [IanaTimeZoneBrand]: true };
/** Exact non-empty Pi tool name. */
export type ToolName = string & { readonly [ToolNameBrand]: true };
/** Pi thinking level pinned to a job. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** Parse an externally supplied job identifier. */
export function parseJobId(input: unknown): Result<JobId, InvalidJobIdError> {
  return typeof input === "string" && /^(?:job_)?[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(input)
    ? success(input as JobId)
    : failure(new InvalidJobIdError());
}

/** Parse an externally supplied run identifier. */
export function parseRunId(input: unknown): Result<RunId, InvalidRunIdError> {
  return typeof input === "string" && /^(?:run_)?[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(input)
    ? success(input as RunId)
    : failure(new InvalidRunIdError());
}

/** Parse Unix milliseconds without accepting fractional or unsafe numbers. */
export function parseUnixMillis(input: unknown): Result<UnixMillis, InvalidInstantError> {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0
    ? success(input as UnixMillis)
    : failure(new InvalidInstantError());
}

/** Parse a positive, safe whole-millisecond duration. */
export function parseDurationMs(input: unknown): Result<DurationMs, InvalidDurationError> {
  return typeof input === "number" && Number.isSafeInteger(input) && input > 0
    ? success(input as DurationMs)
    : failure(new InvalidDurationError());
}

/** Parse an absolute path, rejecting NUL bytes and relative paths. */
export function parseAbsolutePath(input: unknown): Result<AbsolutePath, InvalidPathError> {
  return typeof input === "string" && input.length > 0 && !input.includes("\0") && isAbsolute(input)
    ? success(input as AbsolutePath)
    : failure(new InvalidPathError());
}

/** Parse a validated cron expression after a Croner adapter has accepted it. */
export function brandCronExpression(input: string): CronExpression {
  return input as CronExpression;
}

/** Parse a timezone after Intl has accepted it. */
export function brandIanaTimeZone(input: string): IanaTimeZone {
  return input as IanaTimeZone;
}

/** Parse an exact Pi tool name. */
export function parseToolName(input: unknown): Result<ToolName, Error> {
  return typeof input === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(input)
    ? success(input as ToolName)
    : failure(new Error("The tool name is invalid"));
}

/** Build a duration expressed in minutes. */
export function durationMinutes(minutes: number): DurationMs {
  const parsed = parseDurationMs(minutes * 60_000);
  if (!parsed.ok) throw new RangeError("Duration minutes must produce positive safe milliseconds");
  return parsed.value;
}

/** Build a duration expressed in days. */
export function durationDays(days: number): DurationMs {
  const parsed = parseDurationMs(days * 86_400_000);
  if (!parsed.ok) throw new RangeError("Duration days must produce positive safe milliseconds");
  return parsed.value;
}

/** Recurrence definition owned by a job. */
export type Schedule =
  | { readonly kind: "interval"; readonly every: DurationMs; readonly anchorAt: UnixMillis }
  | { readonly kind: "cron"; readonly expression: CronExpression; readonly timezone: IanaTimeZone };

/** How overlapping scheduled occurrences are handled. */
export type OverlapPolicy = "skip" | "queueOne";
/** How occurrences missed while the daemon was unavailable are handled. */
export type MisfirePolicy = "skip" | "fireOnce";

/** Provider, model, and reasoning settings frozen at job creation. */
export interface PinnedModel {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: ThinkingLevel;
}

/** Execution limits and capabilities frozen onto a job. */
export interface ExecutionPolicy {
  readonly timeout: DurationMs;
  readonly tools: readonly ToolName[];
  readonly model: PinnedModel;
  readonly overlap: OverlapPolicy;
  readonly misfire: MisfirePolicy;
}

interface JobBase {
  readonly id: JobId;
  readonly name: string;
  readonly schedule: Schedule;
  readonly prompt: string;
  readonly cwd: AbsolutePath;
  readonly execution: ExecutionPolicy;
  readonly createdAt: UnixMillis;
  readonly updatedAt: UnixMillis;
}

/** Safe reason an active job stopped scheduling occurrences. */
export type JobBlockReason =
  | "AuthenticationUnavailable"
  | "ProjectTrustRequired"
  | "ModelUnavailable"
  | "ExecutableUnavailable";

/** Persisted job state; only active jobs contain a next occurrence. */
export type Job =
  | (JobBase & { readonly status: "draft"; readonly nextRunAt: undefined })
  | (JobBase & { readonly status: "active"; readonly nextRunAt: UnixMillis })
  | (JobBase & { readonly status: "paused" | "deleted"; readonly nextRunAt: undefined })
  | (JobBase & {
      readonly status: "blocked";
      readonly nextRunAt: undefined;
      readonly blockReason: JobBlockReason;
    });

interface RunBase {
  readonly id: RunId;
  readonly jobId: JobId;
  readonly scheduledFor: UnixMillis;
  readonly createdAt: UnixMillis;
  readonly missedOccurrences: number;
  readonly readAt?: UnixMillis;
}

/** Aggregated provider usage for a completed scheduled run. */
export interface RunUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
}

/** Successful scheduled run output stored outside interactive context. */
export interface RunResult {
  readonly assistantText: string;
  readonly usage: RunUsage;
  readonly eventLogPath?: AbsolutePath;
}

/** Safe, bounded failure information suitable for persistence and protocol output. */
export interface SafeRunFailure {
  readonly tag:
    | "PiExited"
    | "TimedOut"
    | "Cancelled"
    | "Interrupted"
    | "InvalidOutput"
    | "AuthenticationUnavailable"
    | "ProjectTrustRequired"
    | "ModelUnavailable";
  readonly message: string;
  readonly exitCode?: number;
}

/** Persisted run state for one occurrence or coalesced set of occurrences. */
export type Run =
  | (RunBase & { readonly status: "queued" })
  | (RunBase & {
      readonly status: "running";
      readonly startedAt: UnixMillis;
      readonly supervisorPid: number;
      readonly supervisorToken: string;
    })
  | (RunBase & {
      readonly status: "succeeded";
      readonly startedAt: UnixMillis;
      readonly finishedAt: UnixMillis;
      readonly result: RunResult;
    })
  | (RunBase & {
      readonly status: "failed" | "timedOut" | "cancelled" | "interrupted" | "skipped";
      readonly startedAt?: UnixMillis;
      readonly finishedAt: UnixMillis;
      readonly failure: SafeRunFailure;
    });

/** Canonical input for creating a persisted job. */
export interface CreateJobInput {
  readonly name: string;
  readonly schedule: Schedule;
  readonly prompt: string;
  readonly cwd: AbsolutePath;
  readonly execution: ExecutionPolicy;
  readonly activate: boolean;
}

/** Fields that may be replaced by an explicit job edit. */
export interface UpdateJobInput {
  readonly name?: string;
  readonly schedule?: Schedule;
  readonly prompt?: string;
  readonly cwd?: AbsolutePath;
  readonly execution?: ExecutionPolicy;
}

/** Filters accepted by job listing. */
export interface JobQuery {
  readonly includeDeleted?: boolean;
  readonly status?: Job["status"];
}

/** Filters accepted by run listing. */
export interface RunQuery {
  readonly jobId?: JobId;
  readonly runId?: RunId;
  readonly status?: Run["status"];
  readonly unreadOnly?: boolean;
  readonly limit?: number;
}

/** Terminal data used to finish a running or queued run. */
export type RunCompletion =
  | {
      readonly runId: RunId;
      readonly status: "succeeded";
      readonly finishedAt: UnixMillis;
      readonly result: RunResult;
    }
  | {
      readonly runId: RunId;
      readonly status: "failed" | "timedOut" | "cancelled" | "interrupted" | "skipped";
      readonly finishedAt: UnixMillis;
      readonly failure: SafeRunFailure;
    };

/** Input handed to an isolated Pi worker. */
export interface AgentRunInput {
  readonly runId: RunId;
  readonly jobId: JobId;
  readonly name: string;
  readonly scheduledFor: UnixMillis;
  readonly cwd: AbsolutePath;
  readonly prompt: string;
  readonly execution: ExecutionPolicy;
}

/** Parsed terminal output returned by a worker supervisor. */
export interface AgentRunOutput {
  readonly exitCode: number;
  readonly finalAssistantText?: string;
  readonly usage: RunUsage;
  readonly eventLogPath: AbsolutePath;
  readonly failure?: SafeRunFailure;
  readonly terminalStatus?: "succeeded" | "failed" | "timedOut" | "cancelled";
}

/** Current health information returned by the daemon. */
export interface SchedulerHealth {
  readonly status: "ok" | "degraded";
  readonly version: 1;
  readonly pid: number;
  readonly database: "ok" | "unavailable";
  readonly nextWakeup?: UnixMillis;
}

/** Counts produced by one retention pass. */
export interface RetentionSummary {
  readonly runsDeleted: number;
  readonly logsDeleted: number;
}

/** Time source used by scheduling policy. */
export interface Clock {
  now(): UnixMillis;
  sleepUntil(instant: UnixMillis, signal: AbortSignal): Promise<void>;
}

/** System-backed scheduler time source. */
export class SystemClock implements Clock {
  /** Return current Unix milliseconds. */
  now(): UnixMillis {
    const parsed = parseUnixMillis(Date.now());
    if (!parsed.ok) throw new Error("System clock returned an invalid instant");
    return parsed.value;
  }

  /** Wait until an instant or reject with an AbortError when cancelled. */
  async sleepUntil(instant: UnixMillis, signal: AbortSignal): Promise<void> {
    const delay = Math.max(0, instant - Date.now());
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, delay);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}

/** ID source used when atomically creating jobs and runs. */
export interface IdGenerator {
  jobId(): JobId;
  runId(): RunId;
}

/** Cryptographically random scheduler identifier source. */
export class CryptoIdGenerator implements IdGenerator {
  /** Create a fresh job identifier. */
  jobId(): JobId {
    const parsed = parseJobId(`job_${randomUUID()}`);
    if (!parsed.ok) throw new Error("Generated job identifier was invalid");
    return parsed.value;
  }

  /** Create a fresh run identifier. */
  runId(): RunId {
    const parsed = parseRunId(`run_${randomUUID()}`);
    if (!parsed.ok) throw new Error("Generated run identifier was invalid");
    return parsed.value;
  }
}
