import { appendFile } from "node:fs/promises";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { SchedulerClient } from "../client.ts";
import { ProtocolError } from "../errors.ts";
import { registerScheduledTaskTool } from "../extension/tool.ts";
import { failure, success } from "../result.ts";

const client: SchedulerClient = {
  async jobAction(action, id) {
    const path = process.env.PI_SCHEDULER_TEST_RECORD;
    if (path) await appendFile(path, `${action}:${id}\n`, "utf8");
    return success(undefined);
  },
  async listJobs() { return success([]); },
  async health() { return success({ status: "ok" as const, version: 1 as const, pid: 1, database: "ok" as const }); },
  async createJob() { return failure(new ProtocolError()); },
  async updateJob() { return failure(new ProtocolError()); },
  async listRuns() { return success([]); },
  async getRun() { return failure(new ProtocolError()); },
  async cancelRun() { return failure(new ProtocolError()); },
  async markRunsRead() { return success(undefined); },
};

export default function fixture(pi: ExtensionAPI): void {
  registerScheduledTaskTool(pi, client);
}
