import assert from "node:assert/strict";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseAbsolutePath,
  parseDurationMs,
  parseJobId,
  parseRunId,
  parseToolName,
  parseUnixMillis,
  type AgentRunInput,
} from "../domain.ts";
import { success } from "../result.ts";
import { SupervisedPiWorker } from "../worker.ts";

function value<V>(result: { readonly ok: true; readonly value: V } | { readonly ok: false }): V {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected successful parse");
  return result.value;
}

function workerInput(directory: string, timeoutMs = 10_000): AgentRunInput {
  return {
    runId: value(parseRunId("run_worker_test")),
    jobId: value(parseJobId("job_worker_test")),
    name: "worker",
    scheduledFor: value(parseUnixMillis(Date.now())),
    cwd: value(parseAbsolutePath(directory)),
    prompt: "private prompt",
    execution: {
      timeout: value(parseDurationMs(timeoutMs)),
      tools: [value(parseToolName("read"))],
      model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" },
      overlap: "skip",
      misfire: "fireOnce",
    },
  };
}

test("a supervised worker commits before sending the prompt through stdin and persists parsed output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-worker-"));
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixture-pi.mjs");
  await chmod(fixture, 0o755);
  const commits: Array<{ pid: number; token: string }> = [];
  const worker = new SupervisedPiWorker({
    nodePath: process.execPath,
    supervisorPath: join(dirname(fileURLToPath(import.meta.url)), "..", "worker-supervisor.ts"),
    piPath: fixture,
    runsDirectory: directory,
    committer: {
      async commit(_runId, supervisor) {
        commits.push(supervisor);
        return success(undefined);
      },
    },
  });
  try {
    const output = await worker.run(workerInput(directory), new AbortController().signal);
    assert.equal(output.ok, true);
    if (!output.ok) return;
    assert.equal(commits.length, 1);
    assert.match(output.value.finalAssistantText ?? "", /completed: private prompt/);
    assert.equal(output.value.usage.inputTokens, 3);
    assert.equal(output.value.usage.costUsd, 0.033);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the supervisor enforces the original timeout for a hanging Pi process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-scheduler-worker-"));
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixture-pi.mjs");
  await chmod(fixture, 0o755);
  const worker = new SupervisedPiWorker({
    nodePath: process.execPath,
    supervisorPath: join(dirname(fileURLToPath(import.meta.url)), "..", "worker-supervisor.ts"),
    piPath: fixture,
    runsDirectory: directory,
    environment: { FIXTURE_HANG: "1" },
    committer: { async commit() { return success(undefined); } },
  });
  try {
    const output = await worker.run(workerInput(directory, 300), new AbortController().signal);
    assert.equal(output.ok, true);
    if (output.ok) assert.equal(output.value.terminalStatus, "timedOut");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
