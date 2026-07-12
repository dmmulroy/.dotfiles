import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { SchedulerClient } from "../client.ts";
import { parseAbsolutePath, parseDurationMs, parseJobId, parseToolName, parseUnixMillis } from "../domain.ts";
import { ProtocolError } from "../errors.ts";
import { registerScheduleCommands } from "../extension/commands.ts";
import { failure, success } from "../result.ts";

function value<V>(result: { readonly ok: true; readonly value: V } | { readonly ok: false }): V {
  if (!result.ok) throw new Error("Invalid fixture value");
  return result.value;
}

const client: SchedulerClient = {
  async listJobs() {
    return success([{
      id: value(parseJobId("job_extension_test")),
      name: "Extension test",
      status: "active" as const,
      schedule: { kind: "interval" as const, every: value(parseDurationMs(60_000)), anchorAt: value(parseUnixMillis(1_000)) },
      prompt: "test",
      cwd: value(parseAbsolutePath("/tmp")),
      execution: {
        timeout: value(parseDurationMs(60_000)), tools: [value(parseToolName("read"))],
        model: { provider: "test", modelId: "public-test-model", thinkingLevel: "off" as const }, overlap: "skip" as const, misfire: "fireOnce" as const,
      },
      nextRunAt: value(parseUnixMillis(61_000)), createdAt: value(parseUnixMillis(0)), updatedAt: value(parseUnixMillis(0)),
    }]);
  },
  async health() { return success({ status: "ok" as const, version: 1 as const, pid: 1, database: "ok" as const }); },
  async createJob() { return failure(new ProtocolError()); },
  async jobAction() { return failure(new ProtocolError()); },
  async updateJob() { return failure(new ProtocolError()); },
  async listRuns() { return success([]); },
  async getRun() { return failure(new ProtocolError()); },
  async cancelRun() { return failure(new ProtocolError()); },
  async markRunsRead() { return success(undefined); },
};

export default function fixture(pi: ExtensionAPI): void {
  registerScheduleCommands(pi, { client, extensionDirectory: "/tmp/pi-scheduler" });
}
