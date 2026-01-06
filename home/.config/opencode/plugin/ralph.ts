import type {
  Plugin,
  PluginInput,
  ToolDefinition,
} from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Types
// =============================================================================

type VCSType = "git" | "jj";

interface UserStory {
  category: string;
  description: string;
  steps: string[];
  passes: boolean;
}

interface PRD {
  branchName: string;
  userStories: UserStory[];
}

interface RalphFileState {
  active: boolean;
  sessionID: string;
  prdPath: string;
  progressPath: string;
  iteration: number;
  maxIterations: number;
  errorCount: number;
  maxErrors: number;
  vcsType: VCSType;
  branchName: string;
  startedAt: string;
}

interface RalphStartArgs {
  prd: string;
  iterations?: number;
}

type OpencodeClient = PluginInput["client"];

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_ERRORS = 3;
const STATE_DIR = ".opencode/state";
const STATE_FILE = "ralph.json";
const COMPLETE_SIGNAL = "<promise>COMPLETE</promise>";

// =============================================================================
// Utilities
// =============================================================================

function formatDuration(startedAt: string): string {
  const duration = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getProgressPath(prdPath: string): string {
  const dir = path.dirname(prdPath);
  return path.join(dir, "progress.txt");
}

function getDate(): string {
  return new Date().toISOString().split("T")[0] ?? new Date().toDateString();
}

// =============================================================================
// State File Operations
// =============================================================================

function getStatePath(directory: string): string {
  return path.join(directory, STATE_DIR, STATE_FILE);
}

function ensureStateDir(directory: string): void {
  const stateDir = path.join(directory, STATE_DIR);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

function readState(directory: string): RalphFileState | null {
  const statePath = getStatePath(directory);
  if (!fs.existsSync(statePath)) return null;
  try {
    const content = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(content) as RalphFileState;
  } catch {
    return null;
  }
}

function writeState(directory: string, state: RalphFileState): void {
  ensureStateDir(directory);
  const statePath = getStatePath(directory);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function clearState(directory: string): void {
  const statePath = getStatePath(directory);
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

// =============================================================================
// Formatters
// =============================================================================

const fmt = {
  started: (state: RalphFileState, storyCount: number) =>
    `[ralph] started - ${storyCount} stories, max ${state.maxIterations} iterations, vcs=${state.vcsType}`,

  completed: (state: RalphFileState) =>
    `[ralph] completed all stories in ${formatDuration(state.startedAt)}`,

  stopped: (state: RalphFileState) =>
    `[ralph] stopped after iteration ${state.iteration}`,

  maxReached: (state: RalphFileState) =>
    `[ralph] max iterations (${state.maxIterations}) reached`,

  maxErrors: (state: RalphFileState) =>
    `[ralph] max errors (${state.maxErrors}) reached after ${state.errorCount} failures`,

  status: (state: RalphFileState) => {
    const duration = formatDuration(state.startedAt);
    return `[ralph] ${state.active ? "running" : "stopped"} - iteration ${state.iteration}/${state.maxIterations} errors=${state.errorCount}/${state.maxErrors} (${duration})`;
  },

  error: (msg: string) => `[ralph] error: ${msg}`,
  noActive: () => `[ralph] no active loop`,
};

// =============================================================================
// Prompt Builders
// =============================================================================

function buildInitialPrompt(
  prd: PRD,
  state: RalphFileState,
): string {
  const branchSetup =
    state.vcsType === "jj"
      ? `Verify you're on the ralph change. If not: jj new -m "ralph: ${prd.branchName}"`
      : `Verify you're on branch ${prd.branchName}. If not, create/checkout it.`;

  const commitCmd =
    state.vcsType === "jj"
      ? `jj describe -m "feat: [ID] - [title]" && jj new`
      : `git add -A && git commit -m "feat: [ID] - [title]"`;

  return `Read the PRD at ${state.prdPath} and progress at ${state.progressPath}.

${branchSetup}

Find the highest-priority feature to work on and work only on that feature.
This should be the one YOU decide has the highest priority - not necessarily first.

1. Check types pass (typecheck/tsc)
2. Check tests pass
3. Update the PRD marking the feature done
4. Append your progress to ${state.progressPath} - leave a note for the next person
5. Commit: ${commitCmd}

ONLY WORK ON A SINGLE FEATURE.

Iteration ${state.iteration}/${state.maxIterations}.

If ALL stories pass, output: ${COMPLETE_SIGNAL}
`;
}

function buildContinuationPrompt(state: RalphFileState): string {
  const branchCheck =
    state.vcsType === "jj"
      ? `Verify you're on the ralph change for branch "${state.branchName}". If not, navigate to it.`
      : `Verify you're on branch "${state.branchName}". If not, checkout it.`;

  const commitCmd =
    state.vcsType === "jj"
      ? `jj describe -m "feat: [ID] - [title]" && jj new`
      : `git add -A && git commit -m "feat: [ID] - [title]"`;

  return `[RALPH LOOP - ITERATION ${state.iteration}/${state.maxIterations}]

Previous iteration did not complete all stories. Continue working.

${branchCheck}

Read ${state.prdPath} for current status.
Read ${state.progressPath} for learnings.

Continue from where you left off. Complete one feature, then:
1. Check types pass
2. Check tests pass  
3. Update PRD marking feature done
4. Append progress to ${state.progressPath}
5. Commit: ${commitCmd}

When ALL stories have passes: true, output: ${COMPLETE_SIGNAL}
`;
}

// =============================================================================
// Core Logic
// =============================================================================

async function detectVCS($: PluginInput["$"]): Promise<VCSType> {
  try {
    const result = await $`test -d .jj && echo jj || echo git`;
    const output = result.stdout.toString().trim();
    return output === "jj" ? "jj" : "git";
  } catch {
    return "git";
  }
}

async function readPRD(client: OpencodeClient, prdPath: string): Promise<PRD> {
  const result = await client.file.read({ query: { path: prdPath } });
  const data = (result as { data?: { content?: string } }).data;
  const content = data?.content;

  if (!content) {
    throw new Error(`Could not read ${prdPath}`);
  }

  const prd = JSON.parse(content) as PRD;

  if (!prd.branchName || !Array.isArray(prd.userStories)) {
    throw new Error("Invalid prd.json structure");
  }

  return prd;
}

async function ensureProgressFile(
  $: PluginInput["$"],
  client: OpencodeClient,
  progressPath: string,
  branchName: string,
): Promise<void> {
  try {
    await client.file.read({ query: { path: progressPath } });
  } catch {
    const content = `# Ralph Progress Log
Started: ${getDate()}
Branch: ${branchName}

## Codebase Patterns
<!-- Ralph will add discovered patterns here -->

## Key Files
<!-- Ralph will add important files here -->

---
`;
    await $`echo ${content} > ${progressPath}`;
  }
}

async function checkForCompletion(
  client: OpencodeClient,
  sessionID: string,
): Promise<boolean> {
  try {
    const messagesResult = await client.session.messages({
      path: { id: sessionID },
    });

    const messages = ((messagesResult as { data?: unknown }).data ??
      messagesResult) as Array<{
      info?: { role?: string };
      parts?: Array<{ type?: string; text?: string }>;
    }>;

    if (!Array.isArray(messages) || messages.length === 0) return false;

    // Check last assistant message for completion signal
    const assistantMessages = messages.filter(
      (m) => m.info?.role === "assistant",
    );
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const textParts =
      lastMessage?.parts?.filter((p) => p.type === "text") ?? [];
    const textContent = textParts.map((p) => p.text ?? "").join("\n");

    return textContent.includes(COMPLETE_SIGNAL);
  } catch {
    return false;
  }
}

async function showToast(
  client: OpencodeClient,
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
// Tool Factories
// =============================================================================

function createRalphStart(
  client: OpencodeClient,
  directory: string,
  $: PluginInput["$"],
): ToolDefinition {
  return tool({
    description: `Start Ralph coding loop. Returns initial prompt for agent to execute.
PRD schema: { branchName: string, userStories: [{ category, description, steps: string[], passes: boolean }] }`,
    args: {
      prd: tool.schema.string().describe("Path to prd.json file"),
      iterations: tool.schema
        .number()
        .optional()
        .describe(`Max iterations (default: ${DEFAULT_MAX_ITERATIONS})`),
    },
    async execute(args: RalphStartArgs, ctx) {
      try {
        // Check for existing active loop
        const existing = readState(directory);
        if (existing?.active) {
          return fmt.error(
            `Loop already active. Use ralph_stop first or wait for completion.`,
          );
        }

        const prd = await readPRD(client, args.prd);
        const vcsType = await detectVCS($);
        const progressPath = getProgressPath(args.prd);

        await ensureProgressFile($, client, progressPath, prd.branchName);

        const incompleteCount = prd.userStories.filter((s) => !s.passes).length;
        if (incompleteCount === 0) {
          return fmt.error("No incomplete stories found");
        }

        const state: RalphFileState = {
          active: true,
          sessionID: ctx.sessionID,
          prdPath: args.prd,
          progressPath,
          iteration: 1,
          maxIterations: args.iterations ?? DEFAULT_MAX_ITERATIONS,
          errorCount: 0,
          maxErrors: DEFAULT_MAX_ERRORS,
          vcsType,
          branchName: prd.branchName,
          startedAt: new Date().toISOString(),
        };

        writeState(directory, state);

        await showToast(client, `Ralph started: ${incompleteCount} stories`, "info");

        // Return status message + initial prompt for agent to execute
        const statusMsg = fmt.started(state, incompleteCount);
        const prompt = buildInitialPrompt(prd, state);

        return `${statusMsg}\n\n---\n\n${prompt}`;
      } catch (error) {
        return fmt.error(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

function createRalphStatus(
  client: OpencodeClient,
  directory: string,
): ToolDefinition {
  return tool({
    description: "Check Ralph loop status with PRD progress summary.",
    args: {},
    async execute() {
      const state = readState(directory);
      if (!state) {
        return fmt.noActive();
      }

      const results: string[] = [fmt.status(state)];

      // Try to read PRD for completion stats
      try {
        const prdResult = await client.file.read({
          query: { path: state.prdPath },
        });
        const prdData = (prdResult as { data?: { content?: string } }).data;
        if (prdData?.content) {
          const prd = JSON.parse(prdData.content) as PRD;
          const total = prd.userStories.length;
          const done = prd.userStories.filter((s) => s.passes).length;
          const nextStory = prd.userStories.find((s) => !s.passes);
          results.push(`  PRD: ${done}/${total} stories complete`);
          if (nextStory) {
            results.push(`  Next: ${nextStory.description.slice(0, 60)}`);
          }
        }
      } catch {
        // PRD read failed, skip details
      }

      return results.join("\n");
    },
  });
}

function createRalphStop(directory: string): ToolDefinition {
  return tool({
    description: "Stop Ralph loop.",
    args: {},
    async execute() {
      const state = readState(directory);
      if (!state?.active) {
        return fmt.noActive();
      }

      state.active = false;
      writeState(directory, state);

      return fmt.stopped(state);
    },
  });
}

// =============================================================================
// Event Handler
// =============================================================================

async function handleSessionIdle(
  event: { type: string; properties?: Record<string, unknown> },
  client: OpencodeClient,
  directory: string,
): Promise<void> {
  if (event.type !== "session.idle") return;

  const sessionID = event.properties?.sessionID as string | undefined;
  if (!sessionID) return;

  const state = readState(directory);
  if (!state?.active) return;
  if (state.sessionID !== sessionID) return;

  // Check for completion signal
  const complete = await checkForCompletion(client, sessionID);

  if (complete) {
    clearState(directory);
    await showToast(client, "Ralph complete!", "success");
    return;
  }

  // Check max iterations
  if (state.iteration >= state.maxIterations) {
    clearState(directory);
    await showToast(client, fmt.maxReached(state), "warning");
    return;
  }

  // Continue to next iteration
  state.iteration++;
  state.errorCount = 0; // Reset error count on successful iteration
  writeState(directory, state);

  await showToast(
    client,
    `Ralph iteration ${state.iteration}/${state.maxIterations}`,
    "info",
  );

  const prompt = buildContinuationPrompt(state);

  await client.session.prompt({
    path: { id: sessionID },
    body: { parts: [{ type: "text", text: prompt }] },
    query: { directory },
  });
}

async function handleSessionError(
  event: { type: string; properties?: Record<string, unknown> },
  client: OpencodeClient,
  directory: string,
): Promise<void> {
  if (event.type !== "session.error") return;

  const sessionID = event.properties?.sessionID as string | undefined;
  if (!sessionID) return;

  const state = readState(directory);
  if (!state?.active) return;
  if (state.sessionID !== sessionID) return;

  state.errorCount++;

  if (state.errorCount >= state.maxErrors) {
    state.active = false;
    writeState(directory, state);
    await showToast(client, fmt.maxErrors(state), "error");
    return;
  }

  // Retry - inject continuation prompt
  writeState(directory, state);

  await showToast(
    client,
    `Ralph error ${state.errorCount}/${state.maxErrors}, retrying...`,
    "warning",
  );

  const prompt = buildContinuationPrompt(state);

  await client.session.prompt({
    path: { id: sessionID },
    body: { parts: [{ type: "text", text: prompt }] },
    query: { directory },
  });
}

// =============================================================================
// Plugin Export
// =============================================================================

export const RalphPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      await handleSessionIdle(event, ctx.client, ctx.directory);
      await handleSessionError(event, ctx.client, ctx.directory);
    },
    tool: {
      ralph_start: createRalphStart(ctx.client, ctx.directory, ctx.$),
      ralph_status: createRalphStatus(ctx.client, ctx.directory),
      ralph_stop: createRalphStop(ctx.directory),
    },
  };
};
