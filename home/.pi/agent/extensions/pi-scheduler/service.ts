import {
  CryptoIdGenerator,
  type Clock,
  type CreateJobInput,
  type IdGenerator,
  type Job,
  type JobId,
  type JobQuery,
  type PinnedModel,
  type RetentionSummary,
  type Run,
  type RunId,
  type RunQuery,
  type SchedulerHealth,
  type UnixMillis,
  type UpdateJobInput,
} from "./domain.ts";
import {
  BackgroundAuthenticationError,
  JobConflictError,
  JobNotFoundError,
  ModelUnavailableError,
  ProjectTrustRequiredError,
  RunNotFoundError,
  StoreUnavailableError,
  type SchedulerError,
} from "./errors.ts";
import { failure, success, type Result } from "./result.ts";
import { nextOccurrence } from "./schedule.ts";
import type { RunCancellation } from "./runtime.ts";
import type { SchedulerStore } from "./store.ts";

/** Background credential preflight used before job activation. */
export interface BackgroundAuthProbe {
  verify(model: PinnedModel): Promise<Result<void, BackgroundAuthenticationError>>;
}

/** Saved project trust preflight used before job activation. */
export interface ProjectTrustProbe {
  verify(cwd: CreateJobInput["cwd"]): Result<void, ProjectTrustRequiredError>;
}

/** Pinned model existence preflight used before job activation. */
export interface ModelAvailabilityProbe {
  verify(model: PinnedModel): Promise<Result<void, ModelUnavailableError>>;
}

/** Scheduler application operations exposed by protocol adapters. */
export interface SchedulerService {
  createJob(input: CreateJobInput): Promise<Result<Job, SchedulerError>>;
  updateJob(id: JobId, input: UpdateJobInput): Promise<Result<Job, SchedulerError>>;
  approveJob(id: JobId): Promise<Result<Job, SchedulerError>>;
  pauseJob(id: JobId): Promise<Result<Job, SchedulerError>>;
  resumeJob(id: JobId): Promise<Result<Job, SchedulerError>>;
  deleteJob(id: JobId): Promise<Result<void, SchedulerError>>;
  runNow(id: JobId): Promise<Result<Run, SchedulerError>>;
  cancelRun(id: RunId): Promise<Result<Run, SchedulerError>>;
  listJobs(query?: JobQuery): Promise<Result<readonly Job[], StoreUnavailableError>>;
  listRuns(query?: RunQuery): Promise<Result<readonly Run[], StoreUnavailableError>>;
  markRunsRead(ids: readonly RunId[]): Promise<Result<void, StoreUnavailableError>>;
  pruneRetention(): Promise<Result<RetentionSummary, StoreUnavailableError>>;
  health(): Promise<SchedulerHealth>;
}

class AllowAuthProbe implements BackgroundAuthProbe {
  async verify(_model: PinnedModel): Promise<Result<void, BackgroundAuthenticationError>> {
    return success(undefined);
  }
}

class AllowTrustProbe implements ProjectTrustProbe {
  verify(_cwd: CreateJobInput["cwd"]): Result<void, ProjectTrustRequiredError> {
    return success(undefined);
  }
}

class AllowModelProbe implements ModelAvailabilityProbe {
  async verify(_model: PinnedModel): Promise<Result<void, ModelUnavailableError>> {
    return success(undefined);
  }
}

/** Dependencies for the scheduler application service. */
export interface SchedulerApplicationDependencies {
  readonly store: SchedulerStore;
  readonly clock: Clock;
  readonly ids?: IdGenerator;
  readonly authProbe?: BackgroundAuthProbe;
  readonly trustProbe?: ProjectTrustProbe;
  readonly modelProbe?: ModelAvailabilityProbe;
  readonly runCancellation?: RunCancellation;
}

/** Application policy for job lifecycle, manual runs, inbox state, and health. */
export class SchedulerApplicationService implements SchedulerService {
  readonly #store: SchedulerStore;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #authProbe: BackgroundAuthProbe;
  readonly #trustProbe: ProjectTrustProbe;
  readonly #modelProbe: ModelAvailabilityProbe;
  readonly #runCancellation?: RunCancellation;

  /** Create an application service over explicit persistence and platform seams. */
  constructor(dependencies: SchedulerApplicationDependencies) {
    this.#store = dependencies.store;
    this.#clock = dependencies.clock;
    this.#ids = dependencies.ids ?? new CryptoIdGenerator();
    this.#authProbe = dependencies.authProbe ?? new AllowAuthProbe();
    this.#trustProbe = dependencies.trustProbe ?? new AllowTrustProbe();
    this.#modelProbe = dependencies.modelProbe ?? new AllowModelProbe();
    this.#runCancellation = dependencies.runCancellation;
  }

  async #preflight(input: Pick<CreateJobInput, "cwd" | "execution">): Promise<Result<void, ProjectTrustRequiredError | BackgroundAuthenticationError | ModelUnavailableError>> {
    const trust = this.#trustProbe.verify(input.cwd);
    if (!trust.ok) return trust;
    const model = await this.#modelProbe.verify(input.execution.model);
    if (!model.ok) return model;
    return this.#authProbe.verify(input.execution.model);
  }

  #getJob(id: JobId): Result<Job, JobNotFoundError | StoreUnavailableError> {
    const jobs = this.#store.listJobs({ includeDeleted: true });
    if (!jobs.ok) return jobs;
    const job = jobs.value.find((candidate) => candidate.id === id);
    return job ? success(job) : failure(new JobNotFoundError(id));
  }

  #next(job: Pick<Job, "schedule">, now: UnixMillis): Result<UnixMillis, SchedulerError> {
    return nextOccurrence(job.schedule, now);
  }

  /** Create a draft, or preflight and create an active job. */
  async createJob(input: CreateJobInput): Promise<Result<Job, SchedulerError>> {
    if (input.activate) {
      const preflight = await this.#preflight(input);
      if (!preflight.ok) return preflight;
    }
    const now = this.#clock.now();
    const next = input.activate ? this.#next(input, now) : success(undefined);
    if (!next.ok) return next;
    return this.#store.createJob({
      ...input,
      id: this.#ids.jobId(),
      createdAt: now,
      updatedAt: now,
      ...(next.value === undefined ? {} : { nextRunAt: next.value }),
    });
  }

  /** Replace explicitly supplied job fields while preserving legal state invariants. */
  async updateJob(id: JobId, input: UpdateJobInput): Promise<Result<Job, SchedulerError>> {
    const existing = this.#getJob(id);
    if (!existing.ok) return existing;
    if (existing.value.status === "deleted") return failure(new JobConflictError("Deleted jobs cannot be edited"));
    const merged: CreateJobInput = {
      name: input.name ?? existing.value.name,
      schedule: input.schedule ?? existing.value.schedule,
      prompt: input.prompt ?? existing.value.prompt,
      cwd: input.cwd ?? existing.value.cwd,
      execution: input.execution ?? existing.value.execution,
      activate: existing.value.status === "active",
    };
    if (merged.activate) {
      const preflight = await this.#preflight(merged);
      if (!preflight.ok) return preflight;
    }
    const now = this.#clock.now();
    const next = merged.activate ? this.#next(merged, now) : success(undefined);
    if (!next.ok) return next;
    return this.#store.transitionJob({
      kind: "update",
      id,
      at: now,
      input: merged,
      status: existing.value.status,
      ...(existing.value.status === "blocked" ? { blockReason: existing.value.blockReason } : {}),
      ...(next.value === undefined ? {} : { nextRunAt: next.value }),
    });
  }

  /** Preflight and activate a draft or blocked job. */
  async approveJob(id: JobId): Promise<Result<Job, SchedulerError>> {
    const existing = this.#getJob(id);
    if (!existing.ok) return existing;
    const preflight = await this.#preflight(existing.value);
    if (!preflight.ok) return preflight;
    const now = this.#clock.now();
    const next = this.#next(existing.value, now);
    if (!next.ok) return next;
    return this.#store.transitionJob({ kind: "approve", id, at: now, nextRunAt: next.value });
  }

  /** Pause an active job without cancelling its current run. */
  async pauseJob(id: JobId): Promise<Result<Job, SchedulerError>> {
    return this.#store.transitionJob({ kind: "pause", id, at: this.#clock.now() });
  }

  /** Preflight and reactivate a paused or blocked job from the next future occurrence. */
  async resumeJob(id: JobId): Promise<Result<Job, SchedulerError>> {
    const existing = this.#getJob(id);
    if (!existing.ok) return existing;
    const preflight = await this.#preflight(existing.value);
    if (!preflight.ok) return preflight;
    const now = this.#clock.now();
    const next = this.#next(existing.value, now);
    if (!next.ok) return next;
    return this.#store.transitionJob({ kind: "resume", id, at: now, nextRunAt: next.value });
  }

  /** Soft-delete a job while preserving its history. */
  async deleteJob(id: JobId): Promise<Result<void, SchedulerError>> {
    const deleted = this.#store.transitionJob({ kind: "delete", id, at: this.#clock.now() });
    return deleted.ok ? success(undefined) : deleted;
  }

  /** Queue one immediate occurrence when the job has no active or queued run. */
  async runNow(id: JobId): Promise<Result<Run, SchedulerError>> {
    return this.#store.claimManualRun(id, this.#ids.runId(), this.#clock.now());
  }

  /** Persist cancellation for a queued run; running cancellation is owned by the dispatcher. */
  async cancelRun(id: RunId): Promise<Result<Run, SchedulerError>> {
    const runs = this.#store.listRuns({ runId: id });
    if (!runs.ok) return runs;
    const run = runs.value[0];
    if (!run) return failure(new RunNotFoundError(id));
    if (run.status === "running") {
      return this.#runCancellation
        ? this.#runCancellation.cancel(id)
        : failure(new JobConflictError("The running supervisor is unavailable"));
    }
    if (run.status !== "queued") return failure(new JobConflictError("Only a queued or running run can be cancelled"));
    return this.#store.finishRun({
      runId: id,
      status: "cancelled",
      finishedAt: this.#clock.now(),
      failure: { tag: "Cancelled", message: "The scheduled run was cancelled" },
    });
  }

  /** List persisted jobs without exposing storage rows. */
  async listJobs(query: JobQuery = {}): Promise<Result<readonly Job[], StoreUnavailableError>> {
    return this.#store.listJobs(query);
  }

  /** List persisted runs without exposing storage rows. */
  async listRuns(query: RunQuery = {}): Promise<Result<readonly Run[], StoreUnavailableError>> {
    return this.#store.listRuns(query);
  }

  /** Mark terminal inbox entries as read. */
  async markRunsRead(ids: readonly RunId[]): Promise<Result<void, StoreUnavailableError>> {
    return this.#store.markRunsRead(ids, this.#clock.now());
  }

  /** Apply the default 30-day/100-run and 7-day/20-log retention limits. */
  async pruneRetention(): Promise<Result<RetentionSummary, StoreUnavailableError>> {
    return this.#store.pruneRetention({
      now: this.#clock.now(),
      runMaxAgeMs: 30 * 86_400_000,
      runMaxCountPerJob: 100,
      eventLogMaxAgeMs: 7 * 86_400_000,
      eventLogMaxCountPerJob: 20,
    });
  }

  /** Report process, database, and next-wakeup status. */
  async health(): Promise<SchedulerHealth> {
    const wakeup = this.#store.getNextWakeup();
    return {
      status: wakeup.ok ? "ok" : "degraded",
      version: 1,
      pid: process.pid,
      database: wakeup.ok ? "ok" : "unavailable",
      ...(wakeup.ok && wakeup.value !== undefined ? { nextWakeup: wakeup.value } : {}),
    };
  }
}
