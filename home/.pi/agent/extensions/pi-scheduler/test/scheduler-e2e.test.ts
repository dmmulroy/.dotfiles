import assert from "node:assert/strict";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseAbsolutePath, parseDurationMs, parseJobId, parseToolName, parseUnixMillis, SystemClock } from "../domain.ts";
import { RunDispatcher, SchedulerRuntime, type RunNotifier } from "../runtime.ts";
import { failure, success } from "../result.ts";
import { SqliteSchedulerStore } from "../store.ts";
import { SupervisedPiWorker, type AgentWorker } from "../worker.ts";

function value<V>(result: { readonly ok: true; readonly value: V } | { readonly ok: false }): V {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected successful parse");
  return result.value;
}

test("a due occurrence completes through SQLite, a real supervisor, notification, and inbox", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-e2e-"));
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixture-pi.mjs");
  await chmod(fixture, 0o755);
  const clock = new SystemClock();
  const controller = new AbortController();
  const notifications: string[] = [];
  const notifier: RunNotifier = {
    async notifyRunFinished(input) {
      notifications.push(`${input.jobName}:${input.status}`);
      controller.abort();
    },
  };
  const worker = new SupervisedPiWorker({
    nodePath: process.execPath,
    supervisorPath: join(dirname(fileURLToPath(import.meta.url)), "..", "worker-supervisor.ts"),
    piPath: fixture,
    runsDirectory: join(directory, "runs"),
    committer: {
      async commit(runId, supervisor) {
        const marked = store.markRunning(runId, clock.now(), supervisor);
        return marked.ok ? success(undefined) : marked;
      },
    },
  });
  const dispatcher = new RunDispatcher({ store, clock, worker, notifier });
  const runtime = new SchedulerRuntime({ store, clock, dispatcher, runsDirectory: join(directory, "runs") });
  const now = clock.now();
  store.createJob({
    id: value(parseJobId("job_e2e_test")), name: "E2E", prompt: "scheduled prompt", cwd: value(parseAbsolutePath(directory)),
    schedule: { kind: "interval", every: value(parseDurationMs(86_400_000)), anchorAt: now },
    execution: { timeout: value(parseDurationMs(10_000)), tools: [value(parseToolName("read"))], model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" }, overlap: "skip", misfire: "fireOnce" },
    activate: true, nextRunAt: now, createdAt: value(parseUnixMillis(now)), updatedAt: value(parseUnixMillis(now)),
  });
  try {
    await runtime.run(controller.signal);
    const inbox = store.listRuns({ unreadOnly: true });
    assert.equal(inbox.ok, true);
    if (!inbox.ok) return;
    assert.equal(inbox.value.length, 1);
    assert.equal(inbox.value[0]?.status, "succeeded");
    if (inbox.value[0]?.status === "succeeded") assert.match(inbox.value[0].result.assistantText, /scheduled prompt/);
    assert.deepEqual(notifications, ["E2E:succeeded"]);
  } finally {
    await dispatcher.cancelAll();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("revoked project trust blocks a due job before Pi starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-e2e-"));
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  const clock = new SystemClock();
  let starts = 0;
  const worker: AgentWorker = {
    async run() { starts += 1; throw new Error("Worker should not start"); },
    async cleanupArtifacts() {},
  };
  const dispatcher = new RunDispatcher({
    store,
    clock,
    worker,
    preflight: { async verify() { return failure({ tag: "ProjectTrustRequired" as const, message: "Saved project trust is required" }); } },
  });
  const now = clock.now();
  const jobId = value(parseJobId("job_trust_test"));
  store.createJob({
    id: jobId, name: "Trust", prompt: "test", cwd: value(parseAbsolutePath(directory)),
    schedule: { kind: "interval", every: value(parseDurationMs(86_400_000)), anchorAt: now },
    execution: { timeout: value(parseDurationMs(10_000)), tools: [value(parseToolName("read"))], model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" }, overlap: "skip", misfire: "fireOnce" },
    activate: true, nextRunAt: now, createdAt: now, updatedAt: now,
  });
  try {
    const claimed = store.claimDueRuns(now, 1);
    assert.equal(claimed.ok, true);
    const run = claimed.ok ? claimed.value[0] : undefined;
    assert.equal(run?.status, "queued");
    if (run?.status === "queued") await dispatcher.dispatch(run);
    assert.equal(starts, 0);
    const jobs = store.listJobs({ includeDeleted: true });
    assert.equal(jobs.ok, true);
    assert.equal(jobs.ok ? jobs.value[0]?.status : undefined, "blocked");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
