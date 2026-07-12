import { spawn } from "node:child_process";

import type { RunNotifier } from "./runtime.ts";

function statusLabel(status: Parameters<RunNotifier["notifyRunFinished"]>[0]["status"]): string {
  switch (status) {
    case "succeeded": return "Succeeded";
    case "timedOut": return "Timed out";
    case "cancelled": return "Cancelled";
    case "failed":
    case "interrupted":
    case "skipped": return "Failed";
    case "blocked":
    case "queued":
    case "running": return "Blocked";
  }
}

/** macOS notification adapter that never includes prompt or agent output. */
export class MacOsNotificationAdapter implements RunNotifier {
  /** Display only the job name and safe terminal status through osascript. */
  async notifyRunFinished(input: Parameters<RunNotifier["notifyRunFinished"]>[0]): Promise<void> {
    await new Promise<void>((resolve) => {
      const script = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
      const child = spawn("/usr/bin/osascript", ["-e", script, "--", input.jobName, statusLabel(input.status)], {
        stdio: "ignore",
      });
      child.once("error", () => resolve());
      child.once("close", () => resolve());
    });
  }
}
