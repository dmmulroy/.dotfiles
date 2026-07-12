/** Base shape shared by scheduler expected failures. */
export interface TaggedSchedulerError extends Error {
  readonly _tag: string;
}

/** Indicates malformed schedule or boundary input. */
export class InvalidScheduleError extends Error {
  readonly _tag = "InvalidScheduleError";
  constructor(message = "The schedule is invalid") {
    super(message);
  }
}

/** Indicates a malformed job identifier. */
export class InvalidJobIdError extends Error {
  readonly _tag = "InvalidJobIdError";
  constructor() {
    super("The job identifier is invalid");
  }
}

/** Indicates a malformed run identifier. */
export class InvalidRunIdError extends Error {
  readonly _tag = "InvalidRunIdError";
  constructor() {
    super("The run identifier is invalid");
  }
}

/** Indicates a malformed instant. */
export class InvalidInstantError extends Error {
  readonly _tag = "InvalidInstantError";
  constructor() {
    super("The instant is invalid");
  }
}

/** Indicates a malformed duration. */
export class InvalidDurationError extends Error {
  readonly _tag = "InvalidDurationError";
  constructor() {
    super("The duration is invalid");
  }
}

/** Indicates a malformed absolute path. */
export class InvalidPathError extends Error {
  readonly _tag = "InvalidPathError";
  constructor() {
    super("The path must be absolute");
  }
}

/** Indicates malformed scheduler input. */
export class InvalidInputError extends Error {
  readonly _tag = "InvalidInputError";
  constructor(message = "The scheduler input is invalid") {
    super(message);
  }
}

/** Indicates that a requested job does not exist. */
export class JobNotFoundError extends Error {
  readonly _tag = "JobNotFoundError";
  constructor(readonly jobId: string) {
    super("Scheduled job was not found");
  }
}

/** Indicates that a requested run does not exist. */
export class RunNotFoundError extends Error {
  readonly _tag = "RunNotFoundError";
  constructor(readonly runId: string) {
    super("Scheduled run was not found");
  }
}

/** Indicates that the requested state transition conflicts with current state. */
export class JobConflictError extends Error {
  readonly _tag = "JobConflictError";
  constructor(message = "The scheduler state changed before the operation completed") {
    super(message);
  }
}

/** Indicates that a model-originated mutation needs interactive approval. */
export class ApprovalRequiredError extends Error {
  readonly _tag = "ApprovalRequiredError";
  constructor() {
    super("Interactive approval is required");
  }
}

/** Indicates that the selected project has trust-gated resources and is not saved as trusted. */
export class ProjectTrustRequiredError extends Error {
  readonly _tag = "ProjectTrustRequiredError";
  constructor() {
    super("The project requires an explicit saved Pi trust decision");
  }
}

/** Indicates that background provider authentication is unavailable. */
export class BackgroundAuthenticationError extends Error {
  readonly _tag = "BackgroundAuthenticationError";
  constructor() {
    super("Background authentication is unavailable");
  }
}

/** Indicates that a pinned provider model is no longer available. */
export class ModelUnavailableError extends Error {
  readonly _tag = "ModelUnavailableError";
  constructor() {
    super("The pinned model is unavailable");
  }
}

/** Indicates that the scheduler daemon cannot be reached. */
export class DaemonUnavailableError extends Error {
  readonly _tag = "DaemonUnavailableError";
  constructor() {
    super("The scheduler daemon is unavailable");
  }
}

/** Indicates an expected persistence failure while retaining its internal cause. */
export class StoreUnavailableError extends Error {
  readonly _tag = "StoreUnavailableError";
  constructor(override readonly cause: unknown) {
    super("Scheduler storage is unavailable");
  }
}

/** Indicates malformed or unsupported socket protocol data. */
export class ProtocolError extends Error {
  readonly _tag = "ProtocolError";
  constructor(message = "The scheduler protocol message is invalid") {
    super(message);
  }
}

/** Indicates that a worker process could not be started. */
export class WorkerStartError extends Error {
  readonly _tag = "WorkerStartError";
  constructor(override readonly cause: unknown) {
    super("The scheduled worker could not be started");
  }
}

/** Indicates invalid worker protocol data. */
export class WorkerProtocolError extends Error {
  readonly _tag = "WorkerProtocolError";
  constructor() {
    super("The scheduled worker returned invalid output");
  }
}

/** Expected failures exposed by scheduler protocol methods. */
export type SchedulerError =
  | InvalidScheduleError
  | InvalidJobIdError
  | InvalidRunIdError
  | InvalidInstantError
  | InvalidDurationError
  | InvalidPathError
  | InvalidInputError
  | JobNotFoundError
  | RunNotFoundError
  | JobConflictError
  | ApprovalRequiredError
  | ProjectTrustRequiredError
  | BackgroundAuthenticationError
  | ModelUnavailableError
  | DaemonUnavailableError
  | StoreUnavailableError
  | ProtocolError;
