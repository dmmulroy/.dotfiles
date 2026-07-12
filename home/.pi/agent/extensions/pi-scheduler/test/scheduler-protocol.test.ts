import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { UnixSocketSchedulerClient } from "../client.ts";
import { SystemClock } from "../domain.ts";
import { startSchedulerServer } from "../daemon.ts";
import { SchedulerApplicationService } from "../service.ts";
import { SqliteSchedulerStore } from "../store.ts";

test("an approved interval job can be created and listed through a real socket and SQLite store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-"));
  const socketPath = join(directory, "scheduler.sock");
  const store = new SqliteSchedulerStore(join(directory, "scheduler.sqlite"));
  const service = new SchedulerApplicationService({ store, clock: new SystemClock() });
  const server = await startSchedulerServer({ socketPath, service });
  const client = new UnixSocketSchedulerClient(socketPath);

  try {
    const now = Date.now();
    const created = await client.createJob({
      name: "Daily review",
      schedule: { kind: "interval", everyMs: 60_000, anchorAt: now },
      prompt: "Review open work",
      cwd: directory,
      execution: {
        timeoutMs: 900_000,
        tools: ["read", "grep", "find", "ls"],
        model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" },
        overlap: "skip",
        misfire: "fireOnce",
      },
      activate: true,
    });
    assert.equal(created.ok, true);

    const listed = await client.listJobs();
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.value.length, 1);
    assert.equal(listed.value[0]?.name, "Daily review");
    assert.equal(listed.value[0]?.status, "active");
  } finally {
    await server.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
