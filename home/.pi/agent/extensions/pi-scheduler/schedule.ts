import { Cron } from "croner";

import {
  brandCronExpression,
  brandIanaTimeZone,
  parseDurationMs,
  parseUnixMillis,
  type CronExpression,
  type IanaTimeZone,
  type Schedule,
  type UnixMillis,
} from "./domain.ts";
import { InvalidScheduleError } from "./errors.ts";
import { failure, success, type Result } from "./result.ts";

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/** Parse a runtime-supported IANA timezone. */
export function parseIanaTimeZone(input: unknown): Result<IanaTimeZone, InvalidScheduleError> {
  if (typeof input !== "string" || input.length === 0) {
    return failure(new InvalidScheduleError("The timezone is invalid"));
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input }).format(0);
    return success(brandIanaTimeZone(input));
  } catch {
    return failure(new InvalidScheduleError("The timezone is invalid"));
  }
}

/** Parse exactly a five-field Croner expression for a specific timezone. */
export function parseCronExpression(
  input: unknown,
  timezone: IanaTimeZone,
): Result<CronExpression, InvalidScheduleError> {
  if (typeof input !== "string" || input.trim().split(/\s+/u).length !== 5) {
    return failure(new InvalidScheduleError("Cron schedules require exactly five fields"));
  }
  const expression = input.trim();
  try {
    const cron = new Cron(expression, { timezone, paused: true, mode: "5-part" });
    cron.stop();
    return success(brandCronExpression(expression));
  } catch {
    return failure(new InvalidScheduleError("The cron expression is invalid"));
  }
}

/** Parse a schedule boundary object and capture the supplied default timezone once. */
export function parseSchedule(
  input: unknown,
  defaultTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Result<Schedule, InvalidScheduleError> {
  if (!isRecord(input)) return failure(new InvalidScheduleError());
  if (input.kind === "interval") {
    const every = parseDurationMs(input.every ?? input.everyMs);
    const anchorAt = parseUnixMillis(input.anchorAt);
    if (!every.ok || !anchorAt.ok) return failure(new InvalidScheduleError("The interval schedule is invalid"));
    return success({ kind: "interval", every: every.value, anchorAt: anchorAt.value });
  }
  if (input.kind === "cron") {
    const timezone = parseIanaTimeZone(input.timezone ?? defaultTimezone);
    if (!timezone.ok) return timezone;
    const expression = parseCronExpression(input.expression ?? input.cron, timezone.value);
    if (!expression.ok) return expression;
    return success({ kind: "cron", expression: expression.value, timezone: timezone.value });
  }
  return failure(new InvalidScheduleError());
}

function cronFor(schedule: Extract<Schedule, { readonly kind: "cron" }>): Cron {
  return new Cron(schedule.expression, {
    timezone: schedule.timezone,
    paused: true,
    mode: "5-part",
  });
}

/** Find the first schedule occurrence strictly later than `after`. */
export function nextOccurrence(
  schedule: Schedule,
  after: UnixMillis,
): Result<UnixMillis, InvalidScheduleError> {
  if (schedule.kind === "interval") {
    const next =
      schedule.anchorAt > after
        ? schedule.anchorAt
        : schedule.anchorAt + (Math.floor((after - schedule.anchorAt) / schedule.every) + 1) * schedule.every;
    const parsed = parseUnixMillis(next);
    return parsed.ok ? parsed : failure(new InvalidScheduleError("The interval occurrence overflowed"));
  }
  try {
    const cron = cronFor(schedule);
    let cursor = new Date(after);
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const next = cron.nextRun(cursor);
      if (next === null) {
        cron.stop();
        return failure(new InvalidScheduleError("The cron schedule has no next occurrence"));
      }
      if (cron.match(next)) {
        cron.stop();
        const parsed = parseUnixMillis(next.getTime());
        return parsed.ok ? parsed : failure(new InvalidScheduleError("The cron occurrence is invalid"));
      }
      cursor = next;
    }
    cron.stop();
    return failure(new InvalidScheduleError("The cron schedule did not produce a matching occurrence"));
  } catch {
    return failure(new InvalidScheduleError());
  }
}

/** Advance from a claimed occurrence until the returned occurrence is later than `now`. */
export function advancePast(
  schedule: Schedule,
  occurrence: UnixMillis,
  now: UnixMillis,
): Result<UnixMillis, InvalidScheduleError> {
  if (schedule.kind === "interval") {
    const steps = Math.floor((now - occurrence) / schedule.every) + 1;
    const next = occurrence + Math.max(1, steps) * schedule.every;
    const parsed = parseUnixMillis(next);
    return parsed.ok ? parsed : failure(new InvalidScheduleError("The interval occurrence overflowed"));
  }
  return nextOccurrence(schedule, now);
}

/** Count schedule occurrences from `first` through `now`, inclusive. */
export function countOccurrencesThrough(
  schedule: Schedule,
  first: UnixMillis,
  now: UnixMillis,
): Result<number, InvalidScheduleError> {
  if (first > now) return success(0);
  if (schedule.kind === "interval") return success(Math.floor((now - first) / schedule.every) + 1);
  let count = 1;
  let cursor = first;
  while (count < 100_000) {
    const next = nextOccurrence(schedule, cursor);
    if (!next.ok) return next;
    if (next.value > now) return success(count);
    count += 1;
    cursor = next.value;
  }
  return failure(new InvalidScheduleError("Too many missed cron occurrences"));
}
