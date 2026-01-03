import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Ralph Wiggum Plugin for OpenCode
 * Port of Anthropic's official Claude Code plugin
 *
 * Creates self-referential AI loops for iterative development.
 * Claude works on the same task repeatedly until completion.
 *
 * Usage:
 *   /ralph-loop "Build a REST API" --max-iterations 50 --completion-promise "COMPLETE"
 *   /cancel-ralph
 */

const STATE_FILE = ".opencode/ralph-loop.local.md";

interface RalphState {
  active: boolean;
  iteration: number;
  max_iterations: number;
  completion_promise: string;
  started_at: string;
  prompt: string;
}

function getStatePath(dir: string): string {
  return join(dir, STATE_FILE);
}

function parseState(content: string): RalphState | null {
  // Parse YAML frontmatter
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const yaml = match[1];
  const prompt = match[2]?.trim() || "";
  const data: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      data[key] = val;
    }
  }

  const iteration = parseInt(data.iteration || "0", 10);
  const max_iterations = parseInt(data.max_iterations || "0", 10);

  if (isNaN(iteration) || isNaN(max_iterations)) return null;

  return {
    active: data.active === "true",
    iteration,
    max_iterations,
    completion_promise: data.completion_promise || "DONE",
    started_at: data.started_at || new Date().toISOString(),
    prompt,
  };
}

function readState(dir: string): RalphState | null {
  const path = getStatePath(dir);
  if (!existsSync(path)) return null;

  try {
    return parseState(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeState(dir: string, state: RalphState): void {
  const path = getStatePath(dir);
  const folder = dirname(path);

  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }

  const content = `---
active: ${state.active}
iteration: ${state.iteration}
max_iterations: ${state.max_iterations}
completion_promise: "${state.completion_promise}"
started_at: "${state.started_at}"
---

${state.prompt}
`;

  writeFileSync(path, content, "utf-8");
}

function clearState(dir: string): void {
  const path = getStatePath(dir);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
}

function checkCompletion(text: string, promise: string): boolean {
  // Extract text from <promise> tags, normalize whitespace
  const match = text.match(/<promise>([\s\S]*?)<\/promise>/i);
  if (!match) return false;

  const found = match[1].trim().replace(/\s+/g, " ");
  const expected = promise.trim().replace(/\s+/g, " ");

  return found === expected;
}

export const RalphWiggumPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;

      const props = event.properties as Record<string, unknown> | undefined;
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      const state = readState(ctx.directory);
      if (!state || !state.active) return;

      // Get last assistant message to check for completion
      let lastOutput = "";
      try {
        const res = await ctx.client.session.messages({
          path: { id: sessionID },
          query: { directory: ctx.directory },
        });

        const messages = ((res as { data?: unknown[] }).data ?? []) as Array<{
          info?: { role?: string };
          parts?: Array<{ type: string; text?: string }>;
        }>;

        const assistantMsgs = messages.filter((m) => m.info?.role === "assistant");
        const last = assistantMsgs[assistantMsgs.length - 1];

        if (last?.parts) {
          lastOutput = last.parts
            .filter((p) => p.type === "text" && p.text)
            .map((p) => p.text)
            .join("\n");
        }
      } catch {
        // ignore API errors
      }

      // Check completion promise
      if (checkCompletion(lastOutput, state.completion_promise)) {
        console.log(`[ralph] Completion detected: <promise>${state.completion_promise}</promise>`);
        clearState(ctx.directory);
        return;
      }

      // Check max iterations
      if (state.max_iterations > 0 && state.iteration >= state.max_iterations) {
        console.log(`[ralph] Max iterations (${state.max_iterations}) reached`);
        clearState(ctx.directory);
        return;
      }

      // Continue loop - increment and feed same prompt back
      state.iteration += 1;
      writeState(ctx.directory, state);

      const maxStr = state.max_iterations > 0 ? String(state.max_iterations) : "unlimited";
      const systemMsg = `Ralph iteration ${state.iteration}/${maxStr} | To complete: output <promise>${state.completion_promise}</promise> (ONLY when TRUE)`;

      console.log(`[ralph] ${systemMsg}`);

      try {
        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [
              { type: "text", text: `[${systemMsg}]\n\n${state.prompt}` },
            ],
          },
          query: { directory: ctx.directory },
        });
      } catch (err) {
        console.error("[ralph] Failed to continue loop:", err);
      }
    },
  };
};
