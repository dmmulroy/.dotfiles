import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tool } from "@opencode-ai/plugin";

const CONFIG_DIR = join(homedir(), ".config/opencode/state");
const CONFIG_PATH = join(CONFIG_DIR, "notifications.json");

const readEnabled = () => {
  if (!existsSync(CONFIG_PATH)) {
    return true;
  }

  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return typeof parsed?.enabled === "boolean" ? parsed.enabled : true;
  } catch {
    return true;
  }
};

const writeEnabled = (enabled) => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ enabled }, null, 2));
};

const normalizeToggleValue = (value) => {
  if (!value || value.trim() === "") {
    return "toggle";
  }

  const normalized = value.trim().toLowerCase();

  if (["toggle", "flip"].includes(normalized)) {
    return "toggle";
  }

  if (["on", "enable", "enabled", "true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["off", "disable", "disabled", "false", "0", "no"].includes(normalized)) {
    return false;
  }

  throw new Error("Invalid value. Use on, off, or toggle.");
};

const NOTIFICATIONS_COMMAND_TEMPLATE = `Manage OpenCode notification sounds.

Call the notification_toggle tool exactly once.
Pass value="$ARGUMENTS".

Accepted values: on, off, toggle (also enable/disable/true/false).
If value is empty, it toggles.

Return only the tool output.`;

export const NotificationPlugin = async ({ $, client }) => {
  const soundPath = join(homedir(), ".config/opencode/sounds/gow_active_reload.mp3");
  let enabled = readEnabled();

  // Check if a session is a main (non-subagent) session
  const isMainSession = async (sessionID) => {
    try {
      const result = await client.session.get({ path: { id: sessionID } });
      const session = result.data ?? result;
      return !session.parentID;
    } catch {
      // If we can't fetch the session, assume it's main to avoid missing notifications
      return true;
    }
  };

  return {
    config: async (config) => {
      config.command = config.command ?? {};
      config.command.notifications = config.command.notifications ?? {
        description: "Enable/disable notification sounds",
        template: NOTIFICATIONS_COMMAND_TEMPLATE,
      };
    },

    event: async ({ event }) => {
      if (!enabled) {
        return;
      }

      // Only notify for main session events, not background subagents
      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID;
        if (await isMainSession(sessionID)) {
          await $`afplay ${soundPath}`;
        }
      }

      // Permission prompt created
      if (event.type === "permission.asked") {
        await $`afplay ${soundPath}`;
      }
    },

    tool: {
      notification_toggle: tool({
        description: "Enable/disable notification sounds. Toggles if value is omitted.",
        args: {
          value: tool.schema
            .string()
            .optional()
            .describe("on | off | toggle (or enable/disable/true/false)"),
        },
        async execute(args) {
          const requested = normalizeToggleValue(args.value);
          const nextEnabled = requested === "toggle" ? !enabled : requested;

          enabled = nextEnabled;
          writeEnabled(nextEnabled);

          return `[notify] notifications ${nextEnabled ? "enabled" : "disabled"}`;
        },
      }),
    },
  };
};
