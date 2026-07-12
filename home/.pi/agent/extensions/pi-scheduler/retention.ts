import { durationDays, type RetentionSummary } from "./domain.ts";
import type { Result } from "./result.ts";
import type { SchedulerStore } from "./store.ts";
import type { StoreUnavailableError } from "./errors.ts";

/** Default independent row and event-log retention limits. */
export const DEFAULT_RETENTION_POLICY = {
  runMaxAge: durationDays(30),
  runMaxCountPerJob: 100,
  eventLogMaxAge: durationDays(7),
  eventLogMaxCountPerJob: 20,
} as const;

/** Apply scheduler retention policy without touching queued or running rows. */
export function pruneSchedulerRetention(
  store: SchedulerStore,
  now: Parameters<SchedulerStore["pruneRetention"]>[0]["now"],
): Result<RetentionSummary, StoreUnavailableError> {
  return store.pruneRetention({
    now,
    runMaxAgeMs: DEFAULT_RETENTION_POLICY.runMaxAge,
    runMaxCountPerJob: DEFAULT_RETENTION_POLICY.runMaxCountPerJob,
    eventLogMaxAgeMs: DEFAULT_RETENTION_POLICY.eventLogMaxAge,
    eventLogMaxCountPerJob: DEFAULT_RETENTION_POLICY.eventLogMaxCountPerJob,
  });
}
