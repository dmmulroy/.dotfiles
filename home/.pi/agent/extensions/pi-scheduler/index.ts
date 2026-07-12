import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { UnixSocketSchedulerClient } from "./client.ts";
import { registerScheduleCommands } from "./extension/commands.ts";
import { registerScheduledTaskTool } from "./extension/tool.ts";

/** Register scheduler commands and, outside workers, its optional model tool. */
export default function schedulerExtension(pi: ExtensionAPI): void {
  if (process.env.PI_SCHEDULER_WORKER === "1") return;
  const extensionDirectory = dirname(fileURLToPath(import.meta.url));
  const client = new UnixSocketSchedulerClient(join(homedir(), ".pi", "agent", "scheduler", "scheduler.sock"));
  registerScheduleCommands(pi, { client, extensionDirectory });
  registerScheduledTaskTool(pi, client);
}
