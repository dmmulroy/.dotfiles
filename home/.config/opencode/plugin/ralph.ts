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
  id: string; // unique identifier, e.g. "setup-1", "core-auth"
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
  compacting: boolean; // true when waiting for compaction to complete
  model?: { providerID: string; modelID: string }; // model for compaction
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

  return `You are Ralph, an autonomous coding agent. Iteration ${state.iteration}/${state.maxIterations}.

## Phase 1: Get Your Bearings

1. **Read progress log**: ${progressPath}
   - **READ "Codebase Patterns" SECTION FIRST** - critical learnings
   - Check what's been done previously

2. **Read the feature list**: ${prdPath}
   - Each feature has \`id\`, \`category\`, \`description\`, \`steps\`
   - Features with \`passes: false\` need work
   - Check \`context\` for patterns, key files, non-goals

3. **Check history**: ${gitLogCmd}

4. **Verify environment**: run tests to ensure codebase works

## Phase 2: Choose ONE Feature

Pick the next incomplete feature (\`passes: false\`). Consider dependencies.

## Phase 3: Implement

1. Implement the feature
2. **Verify using the \`steps\`** - these are your test cases
3. Run feedback loops: format, lint, typecheck, tests
4. All verification steps must pass

## Phase 4: Update State & STOP

1. ${branchSetup}
2. Update ${prdPath}: set \`passes: true\` for completed feature
3. APPEND to ${progressPath} using this format:

\`\`\`
## Iteration ${state.iteration} - [feature.id]
- What was implemented
- Files changed
- **Learnings:** patterns discovered, gotchas encountered

If you discover a REUSABLE pattern, also add it to "## Codebase Patterns" at TOP.
---
\`\`\`

4. Commit: ${commitCmd}
5. **STOP HERE** - end your response. Next iteration handles next feature.

---

**CRITICAL**: Work on ONE feature, then STOP. Never edit/remove features (only change \`passes\`).

When ALL features have \`passes: true\`, output: ${COMPLETE_SIGNAL}
`;
}

function buildContinuationPrompt(state: RalphFileState): string {
  const prdPath = getPrdPath(state.projectDir, state.branchName);
  const progressPath = getProgressPath(state.projectDir, state.branchName);
  
  const commitCmd =
    state.vcsType === "jj"
      ? `jj describe -m "feat(<scope>): <description>" && jj new`
      : `git add -A && git commit -m "feat(<scope>): <description>"`;

  return `[RALPH - ITERATION ${state.iteration}/${state.maxIterations}]

Context was compacted. Summary above contains your progress.

## Continue

1. Read ${progressPath} - **"Codebase Patterns" section FIRST**
2. Read ${prdPath} - find next feature with \`passes: false\`
3. **Implement** ONE feature until \`steps\` pass
4. **Feedback loops**: format, lint, typecheck, tests
5. **Update PRD**: set \`passes: true\`
6. **Append to progress**:
   \`\`\`
   ## Iteration ${state.iteration} - [feature.id]
   - What was implemented
   - **Learnings:** patterns, gotchas
   ---
   \`\`\`
7. **Commit**: ${commitCmd}
8. **STOP** - end your response. Next iteration handles next feature.

When ALL features have \`passes: true\`: ${COMPLETE_SIGNAL}
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
Branch: ${branchName}
Started: ${getDate()}

## Codebase Patterns
<!-- READ THIS FIRST - Consolidate reusable patterns here -->

---
<!-- Iteration logs below - APPEND ONLY -->
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
PRD schema: { branchName: string, features: [{ id: string, category: string, description: string, steps: string[], passes: boolean }], context?: { patterns, keyFiles, nonGoals } }`,
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
          compacting: false,
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
        const featureId = nextFeature.id ?? nextFeature.category;
        results.push(`  Next: [${featureId}] ${nextFeature.description.slice(0, 50)}`);
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

/** Get model info from session's last user message */
async function getSessionModel(
  client: OpencodeClient,
  sessionID: string,
): Promise<{ providerID: string; modelID: string } | null> {
  try {
    const result = await client.session.messages({ path: { id: sessionID } });
    const messages = ((result as { data?: unknown }).data ?? result) as Array<{
      info?: { role?: string; model?: { providerID?: string; modelID?: string } };
    }>;
    
    // Find last user message with model info
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;
      const model = msg.info?.model;
      if (msg.info?.role === "user" && model?.providerID && model?.modelID) {
        return { providerID: model.providerID, modelID: model.modelID };
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

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

  // If we just finished compacting, send continuation prompt
  if (state.compacting) {
    state.compacting = false;
    state.errorCount = 0;
    writeState(projectDir, state.branchName, state);

    await showToast(
      client,
      `Ralph ${state.branchName}: iteration ${state.iteration}/${state.maxIterations}`,
      "info",
    );

    const prompt = buildContinuationPrompt(state);
    await client.session.prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: prompt }] },
      query: { directory: state.projectDir },
    });
    return;
  }

  // Iteration complete - trigger compaction before next iteration
  state.iteration++;
  state.compacting = true;
  
  // Get model from session if not cached
  if (!state.model) {
    state.model = await getSessionModel(client, sessionID) ?? undefined;
  }
  
  writeState(projectDir, state.branchName, state);

  await showToast(
    client,
    `Ralph ${state.branchName}: compacting before iteration ${state.iteration}`,
    "info",
  );

  // Trigger compaction - session will go idle again when done
  if (state.model) {
    await client.session.summarize({
      path: { id: sessionID },
      body: {
        providerID: state.model.providerID,
        modelID: state.model.modelID,
      },
      query: { directory: state.projectDir },
    });
  } else {
    // Fallback: skip compaction if no model info, just continue
    state.compacting = false;
    writeState(projectDir, state.branchName, state);
    
    const prompt = buildContinuationPrompt(state);
    await client.session.prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: prompt }] },
      query: { directory: state.projectDir },
    });
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
