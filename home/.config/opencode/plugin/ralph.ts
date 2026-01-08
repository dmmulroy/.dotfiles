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

interface Feature {
  category: string;
  description: string;
  steps: string[]; // verification steps - how to test it works
  passes: boolean;
}

interface PRDContext {
  patterns: string[];
  keyFiles: string[];
  nonGoals: string[];
}

interface PRD {
  branchName: string;
  features: Feature[];
  context?: PRDContext;
}

interface RalphFileState {
  active: boolean;
  sessionID: string;
  projectDir: string;
  branchName: string;
  iteration: number;
  maxIterations: number;
  errorCount: number;
  maxErrors: number;
  vcsType: VCSType;
  startedAt: string;
  sessionHistory: string[]; // track all session IDs for debugging
}

interface RalphStartArgs {
  branch: string;
  iterations?: number;
}

type OpencodeClient = PluginInput["client"];

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_ERRORS = 3;
const RALPH_STATE_DIR = ".opencode/state/ralph";
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

function getDate(): string {
  return new Date().toISOString().split("T")[0] ?? new Date().toDateString();
}

// =============================================================================
// Path Helpers - .opencode/state/ralph/<branch>/{prd.json,progress.txt,state.json}
// =============================================================================

function getBranchDir(projectDir: string, branchName: string): string {
  return path.join(projectDir, RALPH_STATE_DIR, branchName);
}

function getPrdPath(projectDir: string, branchName: string): string {
  return path.join(getBranchDir(projectDir, branchName), "prd.json");
}

function getProgressPath(projectDir: string, branchName: string): string {
  return path.join(getBranchDir(projectDir, branchName), "progress.txt");
}

function getStatePath(projectDir: string, branchName: string): string {
  return path.join(getBranchDir(projectDir, branchName), "state.json");
}

function ensureBranchDir(projectDir: string, branchName: string): void {
  const branchDir = getBranchDir(projectDir, branchName);
  if (!fs.existsSync(branchDir)) {
    fs.mkdirSync(branchDir, { recursive: true });
  }
}

// =============================================================================
// State File Operations
// =============================================================================

function readState(projectDir: string, branchName: string): RalphFileState | null {
  const statePath = getStatePath(projectDir, branchName);
  if (!fs.existsSync(statePath)) return null;
  try {
    const content = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(content) as RalphFileState;
  } catch {
    return null;
  }
}

function writeState(projectDir: string, branchName: string, state: RalphFileState): void {
  ensureBranchDir(projectDir, branchName);
  const statePath = getStatePath(projectDir, branchName);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function clearState(projectDir: string, branchName: string): void {
  const statePath = getStatePath(projectDir, branchName);
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

/** Find active loop by sessionID across all branches */
function findActiveLoopBySession(projectDir: string, sessionID: string): RalphFileState | null {
  const ralphDir = path.join(projectDir, RALPH_STATE_DIR);
  if (!fs.existsSync(ralphDir)) return null;
  
  const branches = fs.readdirSync(ralphDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const branch of branches) {
    const state = readState(projectDir, branch);
    if (state?.active && state.sessionID === sessionID) {
      return state;
    }
  }
  return null;
}

// =============================================================================
// Formatters
// =============================================================================

const fmt = {
  started: (state: RalphFileState, featureCount: number) =>
    `[ralph] started - ${featureCount} features, max ${state.maxIterations} iterations, vcs=${state.vcsType}`,

  completed: (state: RalphFileState) =>
    `[ralph] completed all features in ${formatDuration(state.startedAt)}`,

  stopped: (state: RalphFileState) =>
    `[ralph] stopped after iteration ${state.iteration}`,

  maxReached: (state: RalphFileState) =>
    `[ralph] max iterations (${state.maxIterations}) reached`,

  maxErrors: (state: RalphFileState) =>
    `[ralph] max errors (${state.maxErrors}) reached after ${state.errorCount} failures`,

  status: (state: RalphFileState) => {
    const duration = formatDuration(state.startedAt);
    return `[ralph:${state.branchName}] ${state.active ? "running" : "stopped"} - iter ${state.iteration}/${state.maxIterations} errors=${state.errorCount}/${state.maxErrors} (${duration})`;
  },

  error: (msg: string) => `[ralph] error: ${msg}`,
  noActive: () => `[ralph] no active loop`,
};

// =============================================================================
// Prompt Builders
// =============================================================================

function buildInitialPrompt(state: RalphFileState): string {
  const prdPath = getPrdPath(state.projectDir, state.branchName);
  const progressPath = getProgressPath(state.projectDir, state.branchName);
  
  const gitLogCmd = state.vcsType === "jj" ? "jj log --limit 10" : "git log --oneline -10";
  const branchSetup =
    state.vcsType === "jj"
      ? `jj new -m "ralph: ${state.branchName}"`
      : `git checkout -b ${state.branchName} 2>/dev/null || git checkout ${state.branchName}`;
  const commitCmd =
    state.vcsType === "jj"
      ? `jj describe -m "feat(<scope>): <description>" && jj new`
      : `git add -A && git commit -m "feat(<scope>): <description>"`;

  return `You are Ralph, an autonomous coding agent. Your goal: implement all features until passes: true.

## Phase 1: Get Your Bearings

1. **Read the feature list**: ${prdPath}
   - Each feature has \`steps\` (verification steps - how to test it works)
   - Features with \`passes: false\` need work
   - Check \`context\` for patterns, key files, non-goals

2. **Read progress log**: ${progressPath}
   - What's been done previously
   - Learnings and discoveries
   - Patterns found in the codebase

3. **Check git history**: ${gitLogCmd}
   - See recent commits and changes
   - Understand what state the code is in

4. **Verify environment works**
   - Run any existing tests to ensure codebase is in working state
   - If something is broken, fix it first

## Phase 2: Choose a Feature

**YOU decide** which feature to implement. Consider:
- Dependencies (what must exist first?)
- Foundational work (database before API, API before UI)
- What you learned from exploring

## Phase 3: Implement

1. Implement the feature
2. **Verify using the \`steps\` from the feature** - these are your test cases
3. Run feedback loops: format, lint, typecheck, tests
4. All verification steps must pass

## Phase 4: Update State

1. Update ${prdPath}: set \`passes: true\` for the completed feature
2. APPEND to ${progressPath}: what you did, what you learned (do NOT overwrite)
3. ${branchSetup}
4. Commit: ${commitCmd}

---

**IMPORTANT**: 
- Work on ONE feature per iteration
- Never edit or remove features from the PRD (only change \`passes\`)
- Steps are verification criteria, not implementation instructions

Iteration ${state.iteration}/${state.maxIterations}.

When ALL features have passes: true, output: ${COMPLETE_SIGNAL}
`;
}

function buildContinuationPrompt(state: RalphFileState): string {
  const prdPath = getPrdPath(state.projectDir, state.branchName);
  const progressPath = getProgressPath(state.projectDir, state.branchName);
  
  const gitLogCmd = state.vcsType === "jj" ? "jj log --limit 10" : "git log --oneline -10";
  const branchCheck =
    state.vcsType === "jj"
      ? `Verify you're on the ralph change for "${state.branchName}".`
      : `Verify you're on branch "${state.branchName}".`;
  const commitCmd =
    state.vcsType === "jj"
      ? `jj describe -m "feat(<scope>): <description>" && jj new`
      : `git add -A && git commit -m "feat(<scope>): <description>"`;

  return `[RALPH - ITERATION ${state.iteration}/${state.maxIterations}]

You are Ralph. This is a FRESH SESSION - get your bearings from files.

## Get Your Bearings

1. Read ${prdPath} - features with passes: false need work
2. Read ${progressPath} - what's been done, learnings
3. Run: ${gitLogCmd} - see recent changes
4. Verify environment: run tests to ensure code works

${branchCheck}

## Your Task

1. **Choose** an incomplete feature (YOU decide based on dependencies)
2. **Implement** until all verification \`steps\` pass
3. **Verify** using the steps (these are your test cases)
4. **Feedback loops**: format, lint, typecheck, tests
5. **Update PRD**: set passes: true
6. **Append to progress**: what you did, what you learned
7. **Commit**: ${commitCmd}

Work on ONE feature. Never edit/remove features (only change passes).

When ALL features pass: ${COMPLETE_SIGNAL}
`;
}

// =============================================================================
// Core Logic
// =============================================================================

async function detectVCS($: PluginInput["$"]): Promise<VCSType> {
  try {
    const result = await $`test -d .jj && echo jj || echo git`.quiet();
    const output = result.stdout.toString().trim();
    return output === "jj" ? "jj" : "git";
  } catch {
    return "git";
  }
}

async function readPRD(prdPath: string): Promise<PRD> {
  if (!fs.existsSync(prdPath)) {
    throw new Error(`PRD file not found: ${prdPath}`);
  }

  const content = fs.readFileSync(prdPath, "utf-8");
  const prd = JSON.parse(content) as PRD;

  if (!prd.branchName || !Array.isArray(prd.features)) {
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
    await $`echo ${content} > ${progressPath}`.quiet();
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
  projectDir: string,
  $: PluginInput["$"],
): ToolDefinition {
  return tool({
    description: `Start Ralph coding loop for a branch. PRD must exist at .opencode/state/ralph/<branch>/prd.json.
PRD schema: { branchName: string, features: [{ id, category, description, steps: string[], passes: boolean }] }`,
    args: {
      branch: tool.schema.string().describe("Branch name (matches folder in .opencode/state/ralph/<branch>/)"),
      iterations: tool.schema
        .number()
        .optional()
        .describe(`Max iterations (default: ${DEFAULT_MAX_ITERATIONS})`),
    },
    async execute(args: RalphStartArgs, ctx) {
      try {
        const branchName = args.branch;
        
        // Check for existing active loop on this branch
        const existing = readState(projectDir, branchName);
        if (existing?.active) {
          return fmt.error(
            `Loop already active for ${branchName}. Use ralph_stop first or wait for completion.`,
          );
        }

        const prdPath = getPrdPath(projectDir, branchName);
        const prd = await readPRD(prdPath);
        
        // Validate branchName matches
        if (prd.branchName !== branchName) {
          return fmt.error(
            `PRD branchName "${prd.branchName}" doesn't match folder "${branchName}"`,
          );
        }
        
        const vcsType = await detectVCS($);
        const progressPath = getProgressPath(projectDir, branchName);

        await ensureProgressFile($, client, progressPath, branchName);

        const incompleteCount = prd.features.filter((s) => !s.passes).length;
        if (incompleteCount === 0) {
          return fmt.error("No incomplete stories found");
        }

        const state: RalphFileState = {
          active: true,
          sessionID: ctx.sessionID,
          projectDir,
          branchName,
          iteration: 1,
          maxIterations: args.iterations ?? DEFAULT_MAX_ITERATIONS,
          errorCount: 0,
          maxErrors: DEFAULT_MAX_ERRORS,
          vcsType,
          startedAt: new Date().toISOString(),
          sessionHistory: [ctx.sessionID],
        };

        writeState(projectDir, branchName, state);

        await showToast(client, `Ralph started: ${branchName} (${incompleteCount} stories)`, "info");

        // Return status message + initial prompt for agent to execute
        const statusMsg = fmt.started(state, incompleteCount);
        const prompt = buildInitialPrompt(state);

        return `${statusMsg}\n\n---\n\n${prompt}`;
      } catch (error) {
        return fmt.error(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

function createRalphStatus(
  client: OpencodeClient,
  projectDir: string,
): ToolDefinition {
  return tool({
    description: "Check Ralph loop status with PRD progress summary. Lists all active loops if no branch specified.",
    args: {
      branch: tool.schema.string().optional().describe("Branch name (optional - lists all if omitted)"),
    },
    async execute(args: { branch?: string }) {
      // If branch specified, show that branch's status
      if (args.branch) {
        const state = readState(projectDir, args.branch);
        if (!state) {
          return fmt.noActive();
        }
        return await formatBranchStatus(client, projectDir, state);
      }
      
      // Otherwise list all active loops
      const ralphDir = path.join(projectDir, RALPH_STATE_DIR);
      if (!fs.existsSync(ralphDir)) {
        return fmt.noActive();
      }
      
      const branches = fs.readdirSync(ralphDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      const results: string[] = [];
      for (const branch of branches) {
        const state = readState(projectDir, branch);
        if (state?.active) {
          results.push(await formatBranchStatus(client, projectDir, state));
        }
      }
      
      if (results.length === 0) {
        return fmt.noActive();
      }
      
      return results.join("\n\n");
    },
  });
}

async function formatBranchStatus(
  client: OpencodeClient,
  projectDir: string,
  state: RalphFileState,
): Promise<string> {
  const results: string[] = [fmt.status(state)];

  // Try to read PRD for completion stats
  try {
    const prdPath = getPrdPath(projectDir, state.branchName);
    const prdResult = await client.file.read({
      query: { path: prdPath },
    });
    const prdData = (prdResult as { data?: { content?: string } }).data;
    if (prdData?.content) {
      const prd = JSON.parse(prdData.content) as PRD;
      const total = prd.features.length;
      const done = prd.features.filter((f) => f.passes).length;
      const nextFeature = prd.features.find((f) => !f.passes);
      results.push(`  PRD: ${done}/${total} features complete`);
      if (nextFeature) {
        results.push(`  Next: [${nextFeature.category}] ${nextFeature.description.slice(0, 50)}`);
      }
    }
  } catch {
    // PRD read failed, skip details
  }

  return results.join("\n");
}

function createRalphStop(projectDir: string): ToolDefinition {
  return tool({
    description: "Stop Ralph loop for a branch.",
    args: {
      branch: tool.schema.string().describe("Branch name to stop"),
    },
    async execute(args: { branch: string }) {
      const state = readState(projectDir, args.branch);
      if (!state?.active) {
        return fmt.noActive();
      }

      state.active = false;
      writeState(projectDir, args.branch, state);

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
  projectDir: string,
): Promise<void> {
  if (event.type !== "session.idle") return;

  const sessionID = event.properties?.sessionID as string | undefined;
  if (!sessionID) return;

  // Find which branch this session belongs to
  const state = findActiveLoopBySession(projectDir, sessionID);
  if (!state) return;

  // Check for completion signal
  const complete = await checkForCompletion(client, sessionID);

  if (complete) {
    clearState(projectDir, state.branchName);
    await showToast(client, `Ralph complete: ${state.branchName}`, "success");
    return;
  }

  // Check max iterations
  if (state.iteration >= state.maxIterations) {
    clearState(projectDir, state.branchName);
    await showToast(client, fmt.maxReached(state), "warning");
    return;
  }

  // Increment iteration
  state.iteration++;
  state.errorCount = 0;

  const oldSessionID = sessionID;

  // Create fresh session for next iteration (progress.txt carries learnings forward)
  const sessionTitle = `ralph: ${state.branchName} (iteration ${state.iteration})`;
  const newSessionResult = await client.session.create({
    body: { title: sessionTitle },
  });

  const newSession = (newSessionResult as { data?: { id?: string } }).data ?? newSessionResult;
  const newSessionID = (newSession as { id?: string }).id;

  if (!newSessionID) {
    await showToast(client, "Failed to create new session", "error");
    state.active = false;
    writeState(projectDir, state.branchName, state);
    return;
  }

  // Update state with new session
  state.sessionID = newSessionID;
  state.sessionHistory.push(newSessionID);
  writeState(projectDir, state.branchName, state);

  await showToast(
    client,
    `Ralph ${state.branchName}: iteration ${state.iteration}/${state.maxIterations}`,
    "info",
  );

  // Send prompt to new session
  const prompt = buildContinuationPrompt(state);

  await client.session.prompt({
    path: { id: newSessionID },
    body: { parts: [{ type: "text", text: prompt }] },
    query: { directory: state.projectDir },
  });

  // Cleanup old session (optional - keeps history cleaner)
  try {
    await client.session.delete({ path: { id: oldSessionID } });
  } catch {
    // Deletion failed, not critical
  }
}

async function handleSessionError(
  event: { type: string; properties?: Record<string, unknown> },
  client: OpencodeClient,
  projectDir: string,
): Promise<void> {
  if (event.type !== "session.error") return;

  const sessionID = event.properties?.sessionID as string | undefined;
  if (!sessionID) return;

  // Find which branch this session belongs to
  const state = findActiveLoopBySession(projectDir, sessionID);
  if (!state) return;

  state.errorCount++;

  if (state.errorCount >= state.maxErrors) {
    state.active = false;
    writeState(projectDir, state.branchName, state);
    await showToast(client, fmt.maxErrors(state), "error");
    return;
  }

  // Retry - inject continuation prompt
  writeState(projectDir, state.branchName, state);

  await showToast(
    client,
    `Ralph ${state.branchName}: error ${state.errorCount}/${state.maxErrors}, retrying...`,
    "warning",
  );

  const prompt = buildContinuationPrompt(state);

  await client.session.prompt({
    path: { id: sessionID },
    body: { parts: [{ type: "text", text: prompt }] },
    query: { directory: state.projectDir },
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
