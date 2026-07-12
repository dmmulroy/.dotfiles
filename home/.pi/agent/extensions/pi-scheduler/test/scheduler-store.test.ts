import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseAbsolutePath,
  parseDurationMs,
  parseJobId,
  parseRunId,
  parseToolName,
  parseUnixMillis,
  type ExecutionPolicy,
  type Schedule,
} from "../domain.ts";
import { SqliteSchedulerStore } from "../store.ts";

function value<V>(result: { readonly ok: true; readonly value: V } | { readonly ok: false }): V {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected successful parse");
  return result.value;
}

const execution: ExecutionPolicy = {
  timeout: value(parseDurationMs(60_000)),
  tools: [value(parseToolName("read"))],
  model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" },
  overlap: "skip",
  misfire: "fireOnce",
};

test("claiming a due interval creates one run and advances from the scheduled occurrence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-store-"));
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  try {
    const schedule: Schedule = { kind: "interval", every: value(parseDurationMs(1_000)), anchorAt: value(parseUnixMillis(1_000)) };
    const created = store.createJob({
      id: value(parseJobId("job_store_test")),
      name: "tick",
      schedule,
      prompt: "tick",
      cwd: value(parseAbsolutePath(directory)),
      execution,
      activate: true,
      nextRunAt: value(parseUnixMillis(1_000)),
      createdAt: value(parseUnixMillis(0)),
      updatedAt: value(parseUnixMillis(0)),
    });
    assert.equal(created.ok, true);

    const first = store.claimDueRuns(value(parseUnixMillis(1_000)), 10);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.value.length, 1);
    assert.equal(first.value[0]?.scheduledFor, 1_000);

    const jobs = store.listJobs();
    assert.equal(jobs.ok, true);
    if (!jobs.ok) return;
    assert.equal(jobs.value[0]?.status, "active");
    if (jobs.value[0]?.status === "active") assert.equal(jobs.value[0].nextRunAt, 2_000);

    const duplicate = store.claimDueRuns(value(parseUnixMillis(1_000)), 10);
    assert.equal(duplicate.ok, true);
    if (duplicate.ok) assert.equal(duplicate.value.length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("queueOne coalesces ticks while a run is active", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-store-"));
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  try {
    const schedule: Schedule = { kind: "interval", every: value(parseDurationMs(1_000)), anchorAt: value(parseUnixMillis(1_000)) };
    store.createJob({
      id: value(parseJobId("job_queue_test")), name: "queue", schedule, prompt: "tick",
      cwd: value(parseAbsolutePath(directory)), execution: { ...execution, overlap: "queueOne" }, activate: true,
      nextRunAt: value(parseUnixMillis(1_000)), createdAt: value(parseUnixMillis(0)), updatedAt: value(parseUnixMillis(0)),
    });
    const first = store.claimDueRuns(value(parseUnixMillis(1_000)), 10);
    assert.equal(first.ok, true);
    if (!first.ok || !first.value[0]) return;
    store.markRunning(first.value[0].id, value(parseUnixMillis(1_000)), { pid: 123, token: "token" });

    store.claimDueRuns(value(parseUnixMillis(2_000)), 10);
    store.claimDueRuns(value(parseUnixMillis(4_000)), 10);
    const runs = store.listRuns({ jobId: value(parseJobId("job_queue_test")) });
    assert.equal(runs.ok, true);
    if (!runs.ok) return;
    assert.equal(runs.value.length, 2);
    const queued = runs.value.find((run) => run.status === "queued");
    assert.equal(queued?.missedOccurrences, 2);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("retention independently limits terminal rows and event logs without removing queued work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-store-"));
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  try {
    const jobId = value(parseJobId("job_retention_test"));
    const schedule: Schedule = { kind: "interval", every: value(parseDurationMs(1_000)), anchorAt: value(parseUnixMillis(1_000)) };
    store.createJob({ id: jobId, name: "retain", schedule, prompt: "tick", cwd: value(parseAbsolutePath(directory)), execution, activate: false, createdAt: value(parseUnixMillis(0)), updatedAt: value(parseUnixMillis(0)) });
    for (let index = 1; index <= 3; index += 1) {
      const runId = value(parseRunId(`run_retention_${index}`));
      const at = value(parseUnixMillis(index * 1_000));
      const claimed = store.claimManualRun(jobId, runId, at);
      assert.equal(claimed.ok, true);
      const running = store.markRunning(runId, at, { pid: 100 + index, token: `token-${index}` });
      assert.equal(running.ok, true);
      const log = join(directory, `${index}.jsonl`);
      await writeFile(log, "{}\n", "utf8");
      const finished = store.finishRun({ runId, status: "succeeded", finishedAt: at, result: { assistantText: String(index), usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }, eventLogPath: value(parseAbsolutePath(log)) } });
      assert.equal(finished.ok, true);
    }
    const queuedId = value(parseRunId("run_retention_queued"));
    store.claimManualRun(jobId, queuedId, value(parseUnixMillis(4_000)));
    const pruned = store.pruneRetention({ now: value(parseUnixMillis(5_000)), runMaxAgeMs: 100_000, runMaxCountPerJob: 2, eventLogMaxAgeMs: 100_000, eventLogMaxCountPerJob: 1 });
    assert.deepEqual(pruned, { ok: true, value: { runsDeleted: 1, logsDeleted: 2 } });
    const runs = store.listRuns({ jobId, limit: 10 });
    assert.equal(runs.ok, true);
    if (!runs.ok) return;
    assert.equal(runs.value.length, 3);
    assert.equal(runs.value.some((run) => run.status === "queued"), true);
    const successes = runs.value.filter((run) => run.status === "succeeded");
    assert.equal(successes.filter((run) => run.result.eventLogPath !== undefined).length, 1);
    await assert.rejects(access(join(directory, "1.jsonl")));
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a skip misfire advances without creating a run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-store-"));
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  try {
    const schedule: Schedule = { kind: "interval", every: value(parseDurationMs(1_000)), anchorAt: value(parseUnixMillis(1_000)) };
    store.createJob({
      id: value(parseJobId("job_skip_test")), name: "skip", schedule, prompt: "tick",
      cwd: value(parseAbsolutePath(directory)), execution: { ...execution, misfire: "skip" }, activate: true,
      nextRunAt: value(parseUnixMillis(1_000)), createdAt: value(parseUnixMillis(0)), updatedAt: value(parseUnixMillis(0)),
    });
    const claimed = store.claimDueRuns(value(parseUnixMillis(5_000)), 10);
    assert.equal(claimed.ok, true);
    if (claimed.ok) assert.equal(claimed.value.length, 0);
    const runs = store.listRuns();
    assert.equal(runs.ok, true);
    if (runs.ok) assert.equal(runs.value.length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
