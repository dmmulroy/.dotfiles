import assert from "node:assert/strict";
import test from "node:test";

import { parseUnixMillis } from "../domain.ts";
import { nextOccurrence, parseSchedule } from "../schedule.ts";

function instant(value: string) {
  const parsed = parseUnixMillis(Date.parse(value));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Invalid test instant");
  return parsed.value;
}

test("cron skips a spring-forward gap", () => {
  const schedule = parseSchedule({ kind: "cron", expression: "30 2 * * *", timezone: "America/New_York" });
  assert.equal(schedule.ok, true);
  if (!schedule.ok) return;
  const next = nextOccurrence(schedule.value, instant("2026-03-08T05:00:00.000Z"));
  assert.equal(next.ok, true);
  if (next.ok) assert.equal(next.value, Date.parse("2026-03-09T06:30:00.000Z"));
});

test("cron runs a fall-back overlap once at its first occurrence", () => {
  const schedule = parseSchedule({ kind: "cron", expression: "30 1 * * *", timezone: "America/New_York" });
  assert.equal(schedule.ok, true);
  if (!schedule.ok) return;
  const first = nextOccurrence(schedule.value, instant("2026-11-01T04:00:00.000Z"));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.value, Date.parse("2026-11-01T05:30:00.000Z"));
  const afterFirst = nextOccurrence(schedule.value, first.value);
  assert.equal(afterFirst.ok, true);
  if (afterFirst.ok) assert.equal(afterFirst.value, Date.parse("2026-11-02T06:30:00.000Z"));
});

test("schedule parsing rejects relative paths at the create boundary", async () => {
  const { parseCreateJobInput } = await import("../protocol.ts");
  const parsed = parseCreateJobInput({
    name: "bad path",
    schedule: { kind: "interval", everyMs: 1000, anchorAt: Date.now() },
    prompt: "test",
    cwd: "relative",
    execution: { timeoutMs: 1000, tools: ["read"], model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" }, overlap: "skip", misfire: "fireOnce" },
    activate: false,
  });
  assert.equal(parsed.ok, false);
});
