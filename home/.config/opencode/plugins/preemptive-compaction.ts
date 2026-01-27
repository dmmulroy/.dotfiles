import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Types
// =============================================================================

interface AssistantMessageInfo {
  id: string;
  sessionID: string;
  role: "assistant";
  modelID: string;
  providerID: string;
  finish?: string;
  summary?: boolean;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}

interface CompactionConfig {
  enabled: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const THRESHOLD = 0.8;
const COOLDOWN_MS = 60_000; // 1 minute between compactions per session
const CONTINUE_DELAY_MS = 500;

const CLAUDE_MODEL_PATTERN = /claude-(opus|sonnet|haiku)/i;
const CLAUDE_CONTEXT_LIMIT =
  process.env.ANTHROPIC_1M_CONTEXT === "true" ||
    process.env.VERTEX_ANTHROPIC_1M_CONTEXT === "true"
    ? 1_000_000
    : 200_000;

const STATE_DIR = ".opencode/state";
const CONFIG_FILE = "preemptive-compaction.json";

// =============================================================================
// Config Persistence
// =============================================================================

function getConfigPath(directory: string): string {
  return path.join(directory, STATE_DIR, CONFIG_FILE);
}

function ensureStateDir(directory: string): void {
  const stateDir = path.join(directory, STATE_DIR);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

function readConfig(directory: string): CompactionConfig {
  const configPath = getConfigPath(directory);
  if (!fs.existsSync(configPath)) {
    return { enabled: true }; // Enabled by default
  }
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as CompactionConfig;
  } catch {
    return { enabled: true };
  }
}

function writeConfig(directory: string, config: CompactionConfig): void {
  ensureStateDir(directory);
  const configPath = getConfigPath(directory);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// =============================================================================
// State (In-Memory)
// =============================================================================

const lastCompactionTime = new Map<string, number>();
const inProgress = new Set<string>();

// =============================================================================
// Helpers
// =============================================================================

function isSupportedModel(modelID: string): boolean {
  return CLAUDE_MODEL_PATTERN.test(modelID);
}

function getContextLimit(_modelID: string): number {
  // Could extend to check model-specific limits
  return CLAUDE_CONTEXT_LIMIT;
}

function calculateUsage(tokens: AssistantMessageInfo["tokens"]): number {
  return tokens.input + tokens.cache.read + tokens.output;
}

async function showToast(
  client: PluginInput["client"],
  message: string,
  variant: "info" | "success" | "warning" | "error",
): Promise<void> {
  try {
    await client.tui.showToast({ body: { message, variant } });
  } catch {
    // TUI may not be available
  }
}

// =============================================================================
// Event Handler
// =============================================================================

async function handleMessageUpdated(
  event: { type: string; properties?: Record<string, unknown>; },
  client: PluginInput["client"],
  directory: string,
): Promise<void> {
  if (event.type !== "message.updated") return;

  // Check if enabled
  const config = readConfig(directory);
  if (!config.enabled) return;

  const info = event.properties?.info as AssistantMessageInfo | undefined;
  if (!info) return;

  // Must be finished assistant message
  if (info.role !== "assistant") return;
  if (!info.finish) return;
  if (!info.tokens) return;
  if (!info.modelID || !info.providerID) return;

  // Skip summary messages (already compacted)
  if (info.summary) return;

  const sessionID = info.sessionID;

  // Check if supported model
  if (!isSupportedModel(info.modelID)) return;

  // Check if already in progress
  if (inProgress.has(sessionID)) return;

  // Check cooldown
  const lastTime = lastCompactionTime.get(sessionID) ?? 0;
  if (Date.now() - lastTime < COOLDOWN_MS) return;

  // Calculate usage ratio
  const used = calculateUsage(info.tokens);
  const limit = getContextLimit(info.modelID);
  const ratio = used / limit;

  if (ratio < THRESHOLD) return;

  // Trigger compaction
  inProgress.add(sessionID);
  lastCompactionTime.set(sessionID, Date.now());

  const pct = (ratio * 100).toFixed(0);
  await showToast(client, `Context at ${pct}% - compacting...`, "warning");

  try {
    await client.session.summarize({
      path: { id: sessionID },
      body: {
        providerID: info.providerID,
        modelID: info.modelID,
      },
      query: { directory },
    });

    await showToast(client, "Compaction complete", "success");

    // Inject continue after brief delay
    setTimeout(async () => {
      try {
        await client.session.prompt({
          path: { id: sessionID },
          body: { parts: [{ type: "text", text: "Continue" }] },
          query: { directory },
        });
      } catch {
        // Session may be gone
      }
    }, CONTINUE_DELAY_MS);
  } catch (error) {
    await showToast(
      client,
      `Compaction failed: ${error instanceof Error ? error.message : "Unknown"}`,
      "error",
    );
  } finally {
    inProgress.delete(sessionID);
  }
}

function handleSessionDeleted(
  event: { type: string; properties?: Record<string, unknown>; },
): void {
  if (event.type !== "session.deleted") return;

  const info = event.properties?.info as { id?: string; } | undefined;
  if (info?.id) {
    lastCompactionTime.delete(info.id);
    inProgress.delete(info.id);
  }
}

// =============================================================================
// Tools
// =============================================================================

function createCompactToggle(directory: string) {
  return tool({
    description: "Toggle preemptive compaction on/off. Returns new state.",
    args: {
      enabled: tool.schema
        .boolean()
        .optional()
        .describe("Set enabled state (toggles if omitted)"),
    },
    async execute(args: { enabled?: boolean; }) {
      const config = readConfig(directory);
      const newEnabled = args.enabled ?? !config.enabled;
      writeConfig(directory, { enabled: newEnabled });
      return `[compact] preemptive compaction ${newEnabled ? "enabled" : "disabled"}`;
    },
  });
}

function createCompactStatus(directory: string) {
  return tool({
    description: "Check preemptive compaction status.",
    args: {},
    async execute() {
      const config = readConfig(directory);
      const activeSessions = inProgress.size;
      const threshold = `${(THRESHOLD * 100).toFixed(0)}%`;
      const limit = CLAUDE_CONTEXT_LIMIT.toLocaleString();

      const lines = [
        `[compact] ${config.enabled ? "enabled" : "disabled"}`,
        `  threshold: ${threshold}`,
        `  context limit: ${limit} tokens`,
        `  cooldown: ${COOLDOWN_MS / 1000}s`,
        `  active compactions: ${activeSessions}`,
      ];

      return lines.join("\n");
    },
  });
}

// =============================================================================
// Plugin Export
// =============================================================================

export const PreemptiveCompactionPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      await handleMessageUpdated(event, ctx.client, ctx.directory);
      handleSessionDeleted(event);
    },
    tool: {
      pcompact_toggle: createCompactToggle(ctx.directory),
      pcompact_status: createCompactStatus(ctx.directory),
    },
  };
};
