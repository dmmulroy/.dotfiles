import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";

const SOUND_PATH = join(homedir(), ".pi", "agent", "assets", "gow_active_reload.mp3");

export default function (pi: ExtensionAPI) {
  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    try {
      await pi.exec("afplay", [SOUND_PATH]);
    } catch (error) {
      console.warn("[notification] failed to play completion sound:", error);
    }
  });
}
