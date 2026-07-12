import { randomUUID } from "node:crypto";
import { chmodSync, unlinkSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import {
  type CreateJobInput,
  type ExecutionPolicy,
  type Job,
  type JobBlockReason,
  type JobId,
  type JobQuery,
  type Run,
  type RunCompletion,
  type RunId,
  type RunQuery,
  type SafeRunFailure,
  type Schedule,
  type ThinkingLevel,
  type UnixMillis,
  type RunUsage,
  parseAbsolutePath,
  parseDurationMs,
  parseJobId,
  parseRunId,
  parseToolName,
  parseUnixMillis,
} from "./domain.ts";
import { JobConflictError, JobNotFoundError, RunNotFoundError, StoreUnavailableError } from "./errors.ts";
import { failure, success, type Result } from "./result.ts";
import { advancePast, countOccurrencesThrough, parseSchedule } from "./schedule.ts";

/** Fully identified job input ready for persistence. */
export interface PersistedCreateJob extends CreateJobInput {
  readonly id: JobId;
  readonly createdAt: UnixMillis;
  readonly updatedAt: UnixMillis;
  readonly nextRunAt?: UnixMillis;
}

/** Atomic legal job transition accepted by the SQLite store. */
export type JobTransition =
  | { readonly kind: "approve"; readonly id: JobId; readonly at: UnixMillis; readonly nextRunAt: UnixMillis }
  | { readonly kind: "resume"; readonly id: JobId; readonly at: UnixMillis; readonly nextRunAt: UnixMillis }
  | { readonly kind: "pause"; readonly id: JobId; readonly at: UnixMillis }
  | { readonly kind: "delete"; readonly id: JobId; readonly at: UnixMillis }
  | { readonly kind: "block"; readonly id: JobId; readonly at: UnixMillis; readonly reason: JobBlockReason }
  | {
      readonly kind: "update";
      readonly id: JobId;
      readonly at: UnixMillis;
      readonly input: CreateJobInput;
      readonly status: Job["status"];
      readonly nextRunAt?: UnixMillis;
      readonly blockReason?: JobBlockReason;
    };

/** Retention cutoffs and counts applied atomically to terminal run rows. */
export interface StoreRetentionInput {
  readonly now: UnixMillis;
  readonly runMaxAgeMs: number;
  readonly runMaxCountPerJob: number;
  readonly eventLogMaxAgeMs: number;
  readonly eventLogMaxCountPerJob: number;
}

/** Persistence capability owned by the scheduler application. */
export interface SchedulerStore {
  migrate(): Result<void, StoreUnavailableError>;
  createJob(input: PersistedCreateJob): Result<Job, StoreUnavailableError>;
  transitionJob(command: JobTransition): Result<Job, JobNotFoundError | JobConflictError | StoreUnavailableError>;
  claimDueRuns(now: UnixMillis, limit: number): Result<readonly Run[], StoreUnavailableError>;
  claimManualRun(jobId: JobId, runId: RunId, now: UnixMillis): Result<Run, JobNotFoundError | JobConflictError | StoreUnavailableError>;
  markRunning(runId: RunId, startedAt: UnixMillis, supervisor: { readonly pid: number; readonly token: string }): Result<Run, RunNotFoundError | JobConflictError | StoreUnavailableError>;
  finishRun(completion: RunCompletion): Result<Run, RunNotFoundError | JobConflictError | StoreUnavailableError>;
  recoverInterruptedRuns(now: UnixMillis): Result<readonly Run[], StoreUnavailableError>;
  getNextWakeup(): Result<UnixMillis | undefined, StoreUnavailableError>;
  listJobs(query?: JobQuery): Result<readonly Job[], StoreUnavailableError>;
  listRuns(query?: RunQuery): Result<readonly Run[], StoreUnavailableError>;
  markRunsRead(ids: readonly RunId[], at: UnixMillis): Result<void, StoreUnavailableError>;
  pruneRetention(input: StoreRetentionInput): Result<{ readonly runsDeleted: number; readonly logsDeleted: number }, StoreUnavailableError>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active','paused','blocked','deleted')),
  block_reason TEXT CHECK (block_reason IS NULL OR block_reason IN ('AuthenticationUnavailable','ProjectTrustRequired','ModelUnavailable','ExecutableUnavailable')),
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('interval','cron')),
  interval_ms INTEGER,
  anchor_at INTEGER,
  cron_expression TEXT,
  timezone TEXT,
  prompt TEXT NOT NULL,
  cwd TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms > 0),
  tools_json TEXT NOT NULL CHECK (json_valid(tools_json)),
  model_json TEXT NOT NULL CHECK (json_valid(model_json)),
  thinking_level TEXT NOT NULL,
  overlap_policy TEXT NOT NULL CHECK (overlap_policy IN ('skip','queueOne')),
  misfire_policy TEXT NOT NULL CHECK (misfire_policy IN ('skip','fireOnce')),
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((schedule_kind='interval' AND interval_ms IS NOT NULL AND anchor_at IS NOT NULL AND cron_expression IS NULL AND timezone IS NULL) OR (schedule_kind='cron' AND interval_ms IS NULL AND anchor_at IS NULL AND cron_expression IS NOT NULL AND timezone IS NOT NULL)),
  CHECK ((status='active' AND next_run_at IS NOT NULL AND block_reason IS NULL) OR (status='blocked' AND next_run_at IS NULL AND block_reason IS NOT NULL) OR (status IN ('draft','paused','deleted') AND next_run_at IS NULL AND block_reason IS NULL))
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  scheduled_for INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','timedOut','cancelled','interrupted','skipped')),
  missed_occurrences INTEGER NOT NULL DEFAULT 0 CHECK (missed_occurrences >= 0),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  supervisor_pid INTEGER,
  supervisor_token TEXT,
  assistant_text TEXT,
  event_log_path TEXT,
  usage_json TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
  failure_json TEXT CHECK (failure_json IS NULL OR json_valid(failure_json)),
  read_at INTEGER,
  UNIQUE(job_id, scheduled_for)
);
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_running_per_job ON runs(job_id) WHERE status='running';
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_queued_per_job ON runs(job_id) WHERE status='queued';
CREATE INDEX IF NOT EXISTS runs_job_created ON runs(job_id, created_at DESC);
PRAGMA user_version = 1;
`;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") throw new Error("Expected persisted JSON text");
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function isBlockReason(value: unknown): value is JobBlockReason {
  return value === "AuthenticationUnavailable" || value === "ProjectTrustRequired" || value === "ModelUnavailable" || value === "ExecutableUnavailable";
}

function isFailureTag(value: unknown): value is SafeRunFailure["tag"] {
  return value === "PiExited" || value === "TimedOut" || value === "Cancelled" || value === "Interrupted" || value === "InvalidOutput" || value === "AuthenticationUnavailable" || value === "ProjectTrustRequired" || value === "ModelUnavailable";
}

function requiredString(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Invalid persisted ${key}`);
  return value;
}

function optionalString(row: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Invalid persisted ${key}`);
  return value;
}

function requiredNumber(row: Readonly<Record<string, unknown>>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Invalid persisted ${key}`);
  return value;
}

function optionalNumber(row: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Invalid persisted ${key}`);
  return value;
}

function must<Value, Failure>(result: Result<Value, Failure>): Value {
  if (!result.ok) throw new Error("Persisted refined value is invalid");
  return result.value;
}

function parseExecution(row: Readonly<Record<string, unknown>>): ExecutionPolicy {
  const toolsValue = parseJson(row.tools_json);
  if (!Array.isArray(toolsValue)) throw new Error("Invalid persisted tools");
  const tools = toolsValue.map((tool) => must(parseToolName(tool)));
  const modelValue = parseJson(row.model_json);
  if (!isRecord(modelValue)) throw new Error("Invalid persisted model");
  const provider = modelValue.provider;
  const modelId = modelValue.modelId;
  const thinkingLevel = modelValue.thinkingLevel;
  const overlap = row.overlap_policy;
  const misfire = row.misfire_policy;
  if (
    typeof provider !== "string" ||
    typeof modelId !== "string" ||
    !isThinkingLevel(thinkingLevel) ||
    (overlap !== "skip" && overlap !== "queueOne") ||
    (misfire !== "skip" && misfire !== "fireOnce")
  ) throw new Error("Invalid persisted execution policy");
  return {
    timeout: must(parseDurationMs(requiredNumber(row, "timeout_ms"))),
    tools,
    model: {
      provider,
      modelId,
      thinkingLevel,
    },
    overlap,
    misfire,
  };
}

function parseJobRow(value: unknown): Job {
  if (!isRecord(value)) throw new Error("Invalid persisted job row");
  const id = must(parseJobId(value.id));
  const kind = value.schedule_kind;
  let schedule: Schedule;
  if (kind === "interval") {
    const parsed = parseSchedule({ kind, every: value.interval_ms, anchorAt: value.anchor_at });
    schedule = must(parsed);
  } else if (kind === "cron") {
    const parsed = parseSchedule({ kind, expression: value.cron_expression, timezone: value.timezone });
    schedule = must(parsed);
  } else {
    throw new Error("Invalid persisted schedule kind");
  }
  const base = {
    id,
    name: requiredString(value, "name"),
    schedule,
    prompt: requiredString(value, "prompt"),
    cwd: must(parseAbsolutePath(value.cwd)),
    execution: parseExecution(value),
    createdAt: must(parseUnixMillis(requiredNumber(value, "created_at"))),
    updatedAt: must(parseUnixMillis(requiredNumber(value, "updated_at"))),
  };
  const status = value.status;
  if (status === "active") return { ...base, status, nextRunAt: must(parseUnixMillis(requiredNumber(value, "next_run_at"))) };
  if (status === "blocked") {
    const blockReason = requiredString(value, "block_reason");
    if (!isBlockReason(blockReason)) throw new Error("Invalid persisted block reason");
    return { ...base, status, nextRunAt: undefined, blockReason };
  }
  if (status === "draft" || status === "paused" || status === "deleted") return { ...base, status, nextRunAt: undefined };
  throw new Error("Invalid persisted job status");
}

function parseUsage(input: unknown): RunUsage {
  if (!isRecord(input)) throw new Error("Invalid persisted usage");
  const numbers = [input.inputTokens, input.outputTokens, input.cacheReadTokens, input.cacheWriteTokens, input.costUsd];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)) throw new Error("Invalid persisted usage");
  return {
    inputTokens: Number(input.inputTokens),
    outputTokens: Number(input.outputTokens),
    cacheReadTokens: Number(input.cacheReadTokens),
    cacheWriteTokens: Number(input.cacheWriteTokens),
    costUsd: Number(input.costUsd),
  };
}

function parseFailure(input: unknown): SafeRunFailure {
  if (!isRecord(input) || typeof input.tag !== "string" || typeof input.message !== "string") throw new Error("Invalid persisted failure");
  if (!isFailureTag(input.tag)) throw new Error("Invalid persisted failure tag");
  const exitCode = input.exitCode;
  if (exitCode !== undefined && (typeof exitCode !== "number" || !Number.isInteger(exitCode))) throw new Error("Invalid persisted exit code");
  return { tag: input.tag, message: input.message, ...(exitCode === undefined ? {} : { exitCode }) };
}

function parseRunRow(value: unknown): Run {
  if (!isRecord(value)) throw new Error("Invalid persisted run row");
  const base = {
    id: must(parseRunId(value.id)),
    jobId: must(parseJobId(value.job_id)),
    scheduledFor: must(parseUnixMillis(requiredNumber(value, "scheduled_for"))),
    createdAt: must(parseUnixMillis(requiredNumber(value, "created_at"))),
    missedOccurrences: requiredNumber(value, "missed_occurrences"),
    ...(optionalNumber(value, "read_at") === undefined ? {} : { readAt: must(parseUnixMillis(optionalNumber(value, "read_at"))) }),
  };
  const status = value.status;
  if (status === "queued") return { ...base, status };
  if (status === "running") return {
    ...base,
    status,
    startedAt: must(parseUnixMillis(requiredNumber(value, "started_at"))),
    supervisorPid: requiredNumber(value, "supervisor_pid"),
    supervisorToken: requiredString(value, "supervisor_token"),
  };
  if (status === "succeeded") return {
    ...base,
    status,
    startedAt: must(parseUnixMillis(requiredNumber(value, "started_at"))),
    finishedAt: must(parseUnixMillis(requiredNumber(value, "finished_at"))),
    result: {
      assistantText: requiredString(value, "assistant_text"),
      ...(optionalString(value, "event_log_path") === undefined ? {} : { eventLogPath: must(parseAbsolutePath(optionalString(value, "event_log_path"))) }),
      usage: parseUsage(parseJson(value.usage_json)),
    },
  };
  if (status === "failed" || status === "timedOut" || status === "cancelled" || status === "interrupted" || status === "skipped") {
    const startedAt = optionalNumber(value, "started_at");
    return {
      ...base,
      status,
      ...(startedAt === undefined ? {} : { startedAt: must(parseUnixMillis(startedAt)) }),
      finishedAt: must(parseUnixMillis(requiredNumber(value, "finished_at"))),
      failure: parseFailure(parseJson(value.failure_json)),
    };
  }
  throw new Error("Invalid persisted run status");
}

function serializeModel(policy: ExecutionPolicy): string {
  return JSON.stringify(policy.model);
}

function runStatement(statement: StatementSync, ...values: readonly (string | number | null)[]): void {
  statement.run(...values);
}

/** SQLite scheduler store using synchronous, short-lived transactions. */
export class SqliteSchedulerStore implements SchedulerStore {
  readonly #database: DatabaseSync;

  /** Open a scheduler database and apply the current migration. */
  constructor(path: string) {
    this.#database = new DatabaseSync(path);
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    if (path !== ":memory:") {
      for (const runtimePath of [path, `${path}-wal`, `${path}-shm`]) {
        try { chmodSync(runtimePath, 0o600); } catch { /* SQLite may create sidecars lazily */ }
      }
    }
    const migrated = this.migrate();
    if (!migrated.ok) {
      this.#database.close();
      throw migrated.error;
    }
  }

  /** Close the underlying SQLite handle. */
  close(): void {
    this.#database.close();
  }

  /** Apply idempotent scheduler schema migrations. */
  migrate(): Result<void, StoreUnavailableError> {
    try {
      this.#database.exec(SCHEMA);
      return success(undefined);
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Persist a new draft or active job. */
  createJob(input: PersistedCreateJob): Result<Job, StoreUnavailableError> {
    try {
      const status = input.activate ? "active" : "draft";
      const schedule = input.schedule;
      runStatement(
        this.#database.prepare(`INSERT INTO jobs (id,name,status,block_reason,schedule_kind,interval_ms,anchor_at,cron_expression,timezone,prompt,cwd,timeout_ms,tools_json,model_json,thinking_level,overlap_policy,misfire_policy,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
        input.id,
        input.name,
        status,
        null,
        schedule.kind,
        schedule.kind === "interval" ? schedule.every : null,
        schedule.kind === "interval" ? schedule.anchorAt : null,
        schedule.kind === "cron" ? schedule.expression : null,
        schedule.kind === "cron" ? schedule.timezone : null,
        input.prompt,
        input.cwd,
        input.execution.timeout,
        JSON.stringify(input.execution.tools),
        serializeModel(input.execution),
        input.execution.model.thinkingLevel,
        input.execution.overlap,
        input.execution.misfire,
        input.activate ? (input.nextRunAt ?? null) : null,
        input.createdAt,
        input.updatedAt,
      );
      return success(parseJobRow(this.#database.prepare("SELECT * FROM jobs WHERE id=?").get(input.id)));
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Apply one legal job state transition atomically. */
  transitionJob(command: JobTransition): Result<Job, JobNotFoundError | JobConflictError | StoreUnavailableError> {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const currentValue = this.#database.prepare("SELECT * FROM jobs WHERE id=?").get(command.id);
      if (currentValue === undefined) {
        this.#database.exec("ROLLBACK");
        return failure(new JobNotFoundError(command.id));
      }
      const current = parseJobRow(currentValue);
      let changed = 0;
      if (command.kind === "approve") {
        if (current.status !== "draft" && current.status !== "blocked") {
          this.#database.exec("ROLLBACK");
          return failure(new JobConflictError("Only draft or blocked jobs can be approved"));
        }
        changed = Number(this.#database.prepare("UPDATE jobs SET status='active',block_reason=NULL,next_run_at=?,updated_at=? WHERE id=?").run(command.nextRunAt, command.at, command.id).changes);
      } else if (command.kind === "resume") {
        if (current.status !== "paused" && current.status !== "blocked") {
          this.#database.exec("ROLLBACK");
          return failure(new JobConflictError("Only paused or blocked jobs can be resumed"));
        }
        changed = Number(this.#database.prepare("UPDATE jobs SET status='active',block_reason=NULL,next_run_at=?,updated_at=? WHERE id=?").run(command.nextRunAt, command.at, command.id).changes);
      } else if (command.kind === "pause") {
        if (current.status !== "active") {
          this.#database.exec("ROLLBACK");
          return failure(new JobConflictError("Only active jobs can be paused"));
        }
        changed = Number(this.#database.prepare("UPDATE jobs SET status='paused',next_run_at=NULL,updated_at=? WHERE id=?").run(command.at, command.id).changes);
      } else if (command.kind === "delete") {
        if (current.status === "deleted") {
          this.#database.exec("ROLLBACK");
          return failure(new JobConflictError("The job is already deleted"));
        }
        changed = Number(this.#database.prepare("UPDATE jobs SET status='deleted',block_reason=NULL,next_run_at=NULL,updated_at=? WHERE id=?").run(command.at, command.id).changes);
      } else if (command.kind === "block") {
        if (current.status !== "active") {
          this.#database.exec("ROLLBACK");
          return failure(new JobConflictError("Only active jobs can be blocked"));
        }
        changed = Number(this.#database.prepare("UPDATE jobs SET status='blocked',block_reason=?,next_run_at=NULL,updated_at=? WHERE id=?").run(command.reason, command.at, command.id).changes);
      } else {
        const schedule = command.input.schedule;
        changed = Number(this.#database.prepare(`UPDATE jobs SET name=?,status=?,block_reason=?,schedule_kind=?,interval_ms=?,anchor_at=?,cron_expression=?,timezone=?,prompt=?,cwd=?,timeout_ms=?,tools_json=?,model_json=?,thinking_level=?,overlap_policy=?,misfire_policy=?,next_run_at=?,updated_at=? WHERE id=?`).run(
          command.input.name,
          command.status,
          command.blockReason ?? null,
          schedule.kind,
          schedule.kind === "interval" ? schedule.every : null,
          schedule.kind === "interval" ? schedule.anchorAt : null,
          schedule.kind === "cron" ? schedule.expression : null,
          schedule.kind === "cron" ? schedule.timezone : null,
          command.input.prompt,
          command.input.cwd,
          command.input.execution.timeout,
          JSON.stringify(command.input.execution.tools),
          serializeModel(command.input.execution),
          command.input.execution.model.thinkingLevel,
          command.input.execution.overlap,
          command.input.execution.misfire,
          command.nextRunAt ?? null,
          command.at,
          command.id,
        ).changes);
      }
      if (changed !== 1) throw new Error("Job transition changed an unexpected row count");
      const updated = parseJobRow(this.#database.prepare("SELECT * FROM jobs WHERE id=?").get(command.id));
      this.#database.exec("COMMIT");
      return success(updated);
    } catch (cause) {
      try { this.#database.exec("ROLLBACK"); } catch { /* transaction was not open */ }
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Claim due active jobs, coalescing misfires and overlaps in one immediate transaction. */
  claimDueRuns(now: UnixMillis, limit: number): Result<readonly Run[], StoreUnavailableError> {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const dueRows = this.#database.prepare("SELECT * FROM jobs WHERE status='active' AND next_run_at<=? ORDER BY next_run_at LIMIT ?").all(now, Math.max(1, limit));
      const claimed: Run[] = [];
      for (const value of dueRows) {
        const job = parseJobRow(value);
        if (job.status !== "active") throw new Error("Due query returned inactive job");
        const first = job.nextRunAt;
        const countResult = countOccurrencesThrough(job.schedule, first, now);
        const nextResult = advancePast(job.schedule, first, now);
        if (!countResult.ok || !nextResult.ok) throw new Error("Persisted schedule could not advance");
        this.#database.prepare("UPDATE jobs SET next_run_at=?,updated_at=? WHERE id=?").run(nextResult.value, now, job.id);
        const occurrenceCount = countResult.value;
        if (job.execution.misfire === "skip" && now > first) continue;
        const running = this.#database.prepare("SELECT id FROM runs WHERE job_id=? AND status='running'").get(job.id);
        const queuedValue = this.#database.prepare("SELECT * FROM runs WHERE job_id=? AND status='queued'").get(job.id);
        if (running !== undefined || queuedValue !== undefined) {
          if (job.execution.overlap === "queueOne") {
            if (queuedValue !== undefined) {
              if (!isRecord(queuedValue)) throw new Error("Invalid queued run row");
              const queuedId = requiredString(queuedValue, "id");
              this.#database.prepare("UPDATE runs SET missed_occurrences=missed_occurrences+? WHERE id=?").run(occurrenceCount, queuedId);
              claimed.push(parseRunRow(this.#database.prepare("SELECT * FROM runs WHERE id=?").get(queuedId)));
            } else {
              const runId = `run_${randomUUID()}`;
              this.#database.prepare("INSERT INTO runs (id,job_id,scheduled_for,status,missed_occurrences,created_at) VALUES (?,?,?,'queued',?,?)").run(runId, job.id, first, occurrenceCount - 1, now);
              claimed.push(parseRunRow(this.#database.prepare("SELECT * FROM runs WHERE id=?").get(runId)));
            }
          }
          continue;
        }
        const runId = `run_${randomUUID()}`;
        this.#database.prepare("INSERT OR IGNORE INTO runs (id,job_id,scheduled_for,status,missed_occurrences,created_at) VALUES (?,?,?,'queued',?,?)").run(runId, job.id, first, Math.max(0, occurrenceCount - 1), now);
        const inserted = this.#database.prepare("SELECT * FROM runs WHERE job_id=? AND scheduled_for=?").get(job.id, first);
        if (inserted !== undefined) claimed.push(parseRunRow(inserted));
      }
      this.#database.exec("COMMIT");
      return success(claimed);
    } catch (cause) {
      try { this.#database.exec("ROLLBACK"); } catch { /* transaction was not open */ }
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Claim an immediate manual run when no run is queued or active for the job. */
  claimManualRun(jobId: JobId, runId: RunId, now: UnixMillis): Result<Run, JobNotFoundError | JobConflictError | StoreUnavailableError> {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const job = this.#database.prepare("SELECT status FROM jobs WHERE id=?").get(jobId);
      if (job === undefined) {
        this.#database.exec("ROLLBACK");
        return failure(new JobNotFoundError(jobId));
      }
      const conflict = this.#database.prepare("SELECT 1 FROM runs WHERE job_id=? AND status IN ('queued','running')").get(jobId);
      if (conflict !== undefined) {
        this.#database.exec("ROLLBACK");
        return failure(new JobConflictError("The job already has a queued or running occurrence"));
      }
      this.#database.prepare("INSERT INTO runs (id,job_id,scheduled_for,status,missed_occurrences,created_at) VALUES (?,?,?,'queued',0,?)").run(runId, jobId, now, now);
      const run = parseRunRow(this.#database.prepare("SELECT * FROM runs WHERE id=?").get(runId));
      this.#database.exec("COMMIT");
      return success(run);
    } catch (cause) {
      try { this.#database.exec("ROLLBACK"); } catch { /* transaction was not open */ }
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Persist the committed supervisor identity before allowing Pi to start. */
  markRunning(runId: RunId, startedAt: UnixMillis, supervisor: { readonly pid: number; readonly token: string }): Result<Run, RunNotFoundError | JobConflictError | StoreUnavailableError> {
    try {
      const existing = this.#database.prepare("SELECT status FROM runs WHERE id=?").get(runId);
      if (existing === undefined) return failure(new RunNotFoundError(runId));
      if (!isRecord(existing) || existing.status !== "queued") return failure(new JobConflictError("Only a queued run can start"));
      const changed = this.#database.prepare("UPDATE runs SET status='running',started_at=?,supervisor_pid=?,supervisor_token=? WHERE id=? AND status='queued'").run(startedAt, supervisor.pid, supervisor.token, runId);
      if (Number(changed.changes) !== 1) return failure(new JobConflictError());
      return success(parseRunRow(this.#database.prepare("SELECT * FROM runs WHERE id=?").get(runId)));
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Finish a queued or running run exactly once. */
  finishRun(completion: RunCompletion): Result<Run, RunNotFoundError | JobConflictError | StoreUnavailableError> {
    try {
      const existing = this.#database.prepare("SELECT status FROM runs WHERE id=?").get(completion.runId);
      if (existing === undefined) return failure(new RunNotFoundError(completion.runId));
      if (!isRecord(existing) || (existing.status !== "queued" && existing.status !== "running")) return failure(new JobConflictError("The run is already terminal"));
      let changed: number;
      if (completion.status === "succeeded") {
        changed = Number(this.#database.prepare("UPDATE runs SET status='succeeded',finished_at=?,assistant_text=?,event_log_path=?,usage_json=?,failure_json=NULL WHERE id=? AND status IN ('queued','running')").run(completion.finishedAt, completion.result.assistantText, completion.result.eventLogPath ?? null, JSON.stringify(completion.result.usage), completion.runId).changes);
      } else {
        changed = Number(this.#database.prepare("UPDATE runs SET status=?,finished_at=?,failure_json=?,assistant_text=NULL,usage_json=NULL WHERE id=? AND status IN ('queued','running')").run(completion.status, completion.finishedAt, JSON.stringify(completion.failure), completion.runId).changes);
      }
      if (changed !== 1) return failure(new JobConflictError());
      return success(parseRunRow(this.#database.prepare("SELECT * FROM runs WHERE id=?").get(completion.runId)));
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Mark any persisted running rows interrupted during conservative startup recovery. */
  recoverInterruptedRuns(now: UnixMillis): Result<readonly Run[], StoreUnavailableError> {
    try {
      const rows = this.#database.prepare("SELECT id FROM runs WHERE status='running'").all();
      const recovered: Run[] = [];
      for (const row of rows) {
        if (!isRecord(row)) throw new Error("Invalid run id row");
        const runId = must(parseRunId(row.id));
        const result = this.finishRun({ runId, status: "interrupted", finishedAt: now, failure: { tag: "Interrupted", message: "The scheduler restarted before completion was recorded" } });
        if (result.ok) recovered.push(result.value);
        else throw new Error("Could not recover interrupted run");
      }
      return success(recovered);
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Return the next active scheduled wakeup. */
  getNextWakeup(): Result<UnixMillis | undefined, StoreUnavailableError> {
    try {
      const row = this.#database.prepare("SELECT MIN(next_run_at) AS next_run_at FROM jobs WHERE status='active'").get();
      if (!isRecord(row) || row.next_run_at === null) return success(undefined);
      return success(must(parseUnixMillis(row.next_run_at)));
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** List jobs through their domain projection. */
  listJobs(query: JobQuery = {}): Result<readonly Job[], StoreUnavailableError> {
    try {
      const conditions: string[] = [];
      const values: string[] = [];
      if (!query.includeDeleted) conditions.push("status<>'deleted'");
      if (query.status) { conditions.push("status=?"); values.push(query.status); }
      const sql = `SELECT * FROM jobs${conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`} ORDER BY created_at,id`;
      return success(this.#database.prepare(sql).all(...values).map(parseJobRow));
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** List runs through their domain projection. */
  listRuns(query: RunQuery = {}): Result<readonly Run[], StoreUnavailableError> {
    try {
      const conditions: string[] = [];
      const values: (string | number)[] = [];
      if (query.jobId) { conditions.push("job_id=?"); values.push(query.jobId); }
      if (query.runId) { conditions.push("id=?"); values.push(query.runId); }
      if (query.status) { conditions.push("status=?"); values.push(query.status); }
      if (query.unreadOnly) conditions.push("read_at IS NULL AND status NOT IN ('queued','running')");
      const limit = query.limit === undefined ? 100 : Math.max(1, Math.min(1000, query.limit));
      values.push(limit);
      const sql = `SELECT * FROM runs${conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`} ORDER BY created_at DESC,id DESC LIMIT ?`;
      return success(this.#database.prepare(sql).all(...values).map(parseRunRow));
    } catch (cause) {
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Mark terminal inbox runs as read. */
  markRunsRead(ids: readonly RunId[], at: UnixMillis): Result<void, StoreUnavailableError> {
    try {
      const statement = this.#database.prepare("UPDATE runs SET read_at=? WHERE id=? AND status NOT IN ('queued','running')");
      this.#database.exec("BEGIN IMMEDIATE");
      for (const id of ids) statement.run(at, id);
      this.#database.exec("COMMIT");
      return success(undefined);
    } catch (cause) {
      try { this.#database.exec("ROLLBACK"); } catch { /* transaction was not open */ }
      return failure(new StoreUnavailableError(cause));
    }
  }

  /** Prune terminal rows and event logs by independent age and per-job count limits. */
  pruneRetention(input: StoreRetentionInput): Result<{ readonly runsDeleted: number; readonly logsDeleted: number }, StoreUnavailableError> {
    try {
      const terminal = "status NOT IN ('queued','running')";
      const rows = this.#database.prepare(`SELECT id,job_id,finished_at,event_log_path,ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY finished_at DESC,id DESC) AS run_rank,ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY CASE WHEN event_log_path IS NULL THEN 1 ELSE 0 END,finished_at DESC,id DESC) AS log_rank FROM runs WHERE ${terminal}`).all();
      let runsDeleted = 0;
      let logsDeleted = 0;
      this.#database.exec("BEGIN IMMEDIATE");
      for (const row of rows) {
        if (!isRecord(row)) throw new Error("Invalid retention row");
        const id = requiredString(row, "id");
        const finishedAt = requiredNumber(row, "finished_at");
        const runRank = requiredNumber(row, "run_rank");
        const logRank = requiredNumber(row, "log_rank");
        const logPath = optionalString(row, "event_log_path");
        const deleteRun = finishedAt < input.now - input.runMaxAgeMs || runRank > input.runMaxCountPerJob;
        if (deleteRun) {
          if (logPath) {
            try { unlinkSync(logPath); } catch { /* an already absent retained log is harmless */ }
            logsDeleted += 1;
          }
          this.#database.prepare("DELETE FROM runs WHERE id=?").run(id);
          runsDeleted += 1;
        } else if (logPath && (finishedAt < input.now - input.eventLogMaxAgeMs || logRank > input.eventLogMaxCountPerJob)) {
          try { unlinkSync(logPath); } catch { /* an already absent retained log is harmless */ }
          this.#database.prepare("UPDATE runs SET event_log_path=NULL WHERE id=?").run(id);
          logsDeleted += 1;
        }
      }
      this.#database.exec("COMMIT");
      return success({ runsDeleted, logsDeleted });
    } catch (cause) {
      try { this.#database.exec("ROLLBACK"); } catch { /* transaction was not open */ }
      return failure(new StoreUnavailableError(cause));
    }
  }
}
