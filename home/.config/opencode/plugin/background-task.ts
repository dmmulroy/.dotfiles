// import type { Plugin, PluginInput, ToolDefinition } from "@opencode-ai/plugin";
// import { tool } from "@opencode-ai/plugin";
//
// // =============================================================================
// // Types
// // =============================================================================
//
// type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled";
//
// interface TaskProgress {
//   toolCalls: number;
//   lastTool?: string;
//   lastUpdate: Date;
// }
//
// interface BackgroundTask {
//   id: string;
//   sessionID: string;
//   parentSessionID: string;
//   description: string;
//   prompt: string;
//   agent: string;
//   status: BackgroundTaskStatus;
//   startedAt: Date;
//   completedAt?: Date;
//   error?: string;
//   progress?: TaskProgress;
// }
//
// interface LaunchInput {
//   description: string;
//   prompt: string;
//   agent: string;
//   parentSessionID: string;
// }
//
// interface BackgroundTaskArgs {
//   description: string;
//   prompt: string;
//   agent?: string;
// }
//
// interface BackgroundOutputArgs {
//   task_id: string;
//   block?: boolean;
//   timeout?: number;
// }
//
// interface BackgroundCancelArgs {
//   task_id?: string;
//   all?: boolean;
// }
//
// type OpencodeClient = PluginInput["client"];
//
// // =============================================================================
// // Constants
// // =============================================================================
//
// const DEFAULT_AGENT = "general";
// const TASK_TTL_MS = 30 * 60 * 1000; // 30 minutes
// const POLL_INTERVAL_MS = 3000;
//
// // =============================================================================
// // Utilities
// // =============================================================================
//
// function formatDuration(start: Date, end?: Date): string {
//   const duration = (end ?? new Date()).getTime() - start.getTime();
//   const seconds = Math.floor(duration / 1000);
//   const minutes = Math.floor(seconds / 60);
//   const hours = Math.floor(minutes / 60);
//
//   if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
//   if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
//   return `${seconds}s`;
// }
//
// function generateTaskId(): string {
//   return `bg_${crypto.randomUUID().slice(0, 8)}`;
// }
//
// function delay(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }
//
// // =============================================================================
// // Formatters
// // =============================================================================
//
// const MAX_RESULT_CHARS = 8000;
//
// const fmt = {
//   launched: (t: BackgroundTask) =>
//     `[bg:${t.id}] launched "${t.description}" → background_output({ task_id: "${t.id}" })`,
//
//   completed: (t: BackgroundTask, duration: string) =>
//     `[bg:${t.id}] "${t.description}" completed (${duration}) → background_output({ task_id: "${t.id}" })`,
//
//   failed: (t: BackgroundTask) =>
//     `[bg:${t.id}] "${t.description}" failed: ${t.error ?? "Unknown error"}`,
//
//   status: (t: BackgroundTask, duration: string) =>
//     `[bg:${t.id}] "${t.description}" ${t.status} (${duration}) agent=${t.agent}${t.error ? ` error=${t.error}` : ""}`,
//
//   result: (t: BackgroundTask, duration: string, output: string) => {
//     const truncated = output.length > MAX_RESULT_CHARS;
//     const content = truncated ? output.slice(0, MAX_RESULT_CHARS) : output;
//     return `[bg:${t.id}] result (${duration})${truncated ? " [truncated]" : ""}:\n${content}`;
//   },
//
//   resultError: (t: BackgroundTask, error: string) =>
//     `[bg:${t.id}] error: ${error}`,
//
//   error: (msg: string) => `[bg] error: ${msg}`,
//
//   cancelled: (id: string) => `[bg:${id}] cancelled`,
//
//   cancelledMulti: (count: number) =>
//     `[bg] cancelled ${count} task${count !== 1 ? "s" : ""}`,
// };
//
// // =============================================================================
// // BackgroundManager
// // =============================================================================
//
// class BackgroundManager {
//   private tasks: Map<string, BackgroundTask> = new Map();
//   private client: OpencodeClient;
//   private directory: string;
//   private pollingInterval?: ReturnType<typeof setInterval>;
//
//   constructor(ctx: PluginInput) {
//     this.client = ctx.client;
//     this.directory = ctx.directory;
//   }
//
//   async launch(input: LaunchInput): Promise<BackgroundTask> {
//     const agent = input.agent?.trim() || DEFAULT_AGENT;
//
//     const createResult = await this.client.session.create({
//       body: {
//         parentID: input.parentSessionID,
//         title: `Background: ${input.description}`,
//       },
//     });
//
//     if (createResult.error) {
//       throw new Error(
//         `Failed to create session: ${JSON.stringify(createResult.error)}`,
//       );
//     }
//
//     const sessionID = (createResult.data as { id: string; }).id;
//
//     const task: BackgroundTask = {
//       id: generateTaskId(),
//       sessionID,
//       parentSessionID: input.parentSessionID,
//       description: input.description,
//       prompt: input.prompt,
//       agent,
//       status: "running",
//       startedAt: new Date(),
//       progress: { toolCalls: 0, lastUpdate: new Date() },
//     };
//
//     this.tasks.set(task.id, task);
//     this.startPolling();
//
//     // Fire and forget
//     this.client.session
//       .prompt({
//         path: { id: sessionID },
//         body: {
//           agent,
//           tools: { task: false, background_task: false },
//           parts: [{ type: "text", text: input.prompt }],
//         },
//       })
//       .catch((error: unknown) => {
//         const t = this.tasks.get(task.id);
//         if (t) {
//           t.status = "error";
//           t.error = error instanceof Error ? error.message : String(error);
//           t.completedAt = new Date();
//           this.notifyParentSession(t);
//         }
//       });
//
//     return task;
//   }
//
//   getTask(id: string): BackgroundTask | undefined {
//     return this.tasks.get(id);
//   }
//
//   findBySession(sessionID: string): BackgroundTask | undefined {
//     for (const task of this.tasks.values()) {
//       if (task.sessionID === sessionID) return task;
//     }
//     return undefined;
//   }
//
//   getTasksByParent(parentSessionID: string): BackgroundTask[] {
//     return Array.from(this.tasks.values()).filter(
//       (t) => t.parentSessionID === parentSessionID,
//     );
//   }
//
//   async handleEvent(event: {
//     type: string;
//     properties?: Record<string, unknown>;
//   }): Promise<void> {
//     if (event.type === "session.idle") {
//       const sessionID = event.properties?.sessionID as string | undefined;
//       if (!sessionID) return;
//
//       const task = this.findBySession(sessionID);
//       if (!task || task.status !== "running") return;
//
//       const hasIncompleteTodos = await this.checkSessionTodos(sessionID);
//       if (hasIncompleteTodos) return;
//
//       task.status = "completed";
//       task.completedAt = new Date();
//       this.notifyParentSession(task);
//     }
//
//     if (event.type === "session.deleted") {
//       const info = event.properties?.info as { id?: string; } | undefined;
//       const sessionID = info?.id;
//       if (!sessionID) return;
//
//       const task = this.findBySession(sessionID);
//       if (!task) return;
//
//       if (task.status === "running") {
//         task.status = "cancelled";
//         task.completedAt = new Date();
//         task.error = "Session deleted";
//       }
//       this.tasks.delete(task.id);
//     }
//   }
//
//   private async checkSessionTodos(sessionID: string): Promise<boolean> {
//     try {
//       const response = await this.client.session.todo({
//         path: { id: sessionID },
//       });
//       const todos = ((response as { data?: unknown; }).data ??
//         response) as Array<{ status: string; }>;
//       if (!Array.isArray(todos) || todos.length === 0) return false;
//       return todos.some(
//         (t) => t.status !== "completed" && t.status !== "cancelled",
//       );
//     } catch {
//       return false;
//     }
//   }
//
//   private async notifyParentSession(task: BackgroundTask): Promise<void> {
//     const duration = formatDuration(task.startedAt, task.completedAt);
//
//     try {
//       await this.client.tui.showToast({
//         body: {
//           message: `Background task "${task.description}" ${task.status}`,
//           variant: task.status === "completed" ? "success" : "error",
//         },
//       });
//     } catch { }
//
//     const message =
//       task.status === "completed"
//         ? fmt.completed(task, duration)
//         : fmt.failed(task);
//
//     setTimeout(async () => {
//       try {
//         await this.client.session.prompt({
//           path: { id: task.parentSessionID },
//           body: { parts: [{ type: "text", text: message }] },
//           query: { directory: this.directory },
//         });
//       } catch { }
//       this.tasks.delete(task.id);
//     }, 200);
//   }
//
//   private startPolling(): void {
//     if (this.pollingInterval) return;
//     this.pollingInterval = setInterval(
//       () => this.pollRunningTasks(),
//       POLL_INTERVAL_MS,
//     );
//     this.pollingInterval.unref();
//   }
//
//   private stopPolling(): void {
//     if (this.pollingInterval) {
//       clearInterval(this.pollingInterval);
//       this.pollingInterval = undefined;
//     }
//   }
//
//   private async pollRunningTasks(): Promise<void> {
//     this.pruneStale();
//     if (!this.hasRunningTasks()) {
//       this.stopPolling();
//       return;
//     }
//
//     try {
//       const statusResult = await this.client.session.status();
//       const allStatuses = ((statusResult as { data?: unknown; }).data ??
//         {}) as Record<string, { type: string; }>;
//
//       for (const task of this.tasks.values()) {
//         if (task.status !== "running") continue;
//         const sessionStatus = allStatuses[task.sessionID];
//         if (!sessionStatus) continue;
//
//         if (sessionStatus.type === "idle") {
//           const hasIncompleteTodos = await this.checkSessionTodos(
//             task.sessionID,
//           );
//           if (hasIncompleteTodos) continue;
//           task.status = "completed";
//           task.completedAt = new Date();
//           this.notifyParentSession(task);
//         }
//       }
//     } catch { }
//   }
//
//   private pruneStale(): void {
//     const now = Date.now();
//     for (const [taskId, task] of this.tasks.entries()) {
//       if (now - task.startedAt.getTime() > TASK_TTL_MS) {
//         task.status = "error";
//         task.error = "Task timed out";
//         task.completedAt = new Date();
//         this.tasks.delete(taskId);
//       }
//     }
//   }
//
//   private hasRunningTasks(): boolean {
//     for (const task of this.tasks.values()) {
//       if (task.status === "running") return true;
//     }
//     return false;
//   }
// }
//
// // =============================================================================
// // Formatting
// // =============================================================================
//
// function formatTaskStatus(task: BackgroundTask): string {
//   return fmt.status(task, formatDuration(task.startedAt, task.completedAt));
// }
//
// async function formatTaskResult(
//   task: BackgroundTask,
//   client: OpencodeClient,
// ): Promise<string> {
//   const duration = formatDuration(task.startedAt, task.completedAt);
//
//   try {
//     const messagesResult = await client.session.messages({
//       path: { id: task.sessionID },
//     });
//     const messages = ((messagesResult as { data?: unknown; }).data ??
//       messagesResult) as Array<{
//         info?: { role?: string; };
//         parts?: Array<{ type?: string; text?: string; }>;
//       }>;
//
//     if (!Array.isArray(messages) || messages.length === 0) {
//       return fmt.result(task, duration, "(No messages found)");
//     }
//
//     const assistantMessages = messages.filter(
//       (m) => m.info?.role === "assistant",
//     );
//     const lastMessage = assistantMessages[assistantMessages.length - 1];
//     const textParts =
//       lastMessage?.parts?.filter((p) => p.type === "text") ?? [];
//     const textContent = textParts.map((p) => p.text ?? "").join("\n");
//
//     return fmt.result(task, duration, textContent || "(No text output)");
//   } catch (error) {
//     return fmt.resultError(
//       task,
//       error instanceof Error ? error.message : String(error),
//     );
//   }
// }
//
// // =============================================================================
// // Tool Factories
// // =============================================================================
//
// function createBackgroundTask(manager: BackgroundManager): ToolDefinition {
//   return tool({
//     description:
//       "Run agent task in background. Returns task_id immediately; notifies on completion.",
//     args: {
//       description: tool.schema.string().describe("Short task description"),
//       prompt: tool.schema.string().describe("Full prompt for the agent"),
//       agent: tool.schema
//         .string()
//         .optional()
//         .describe("Agent: general (default), explore, build, plan"),
//     },
//     async execute(args: BackgroundTaskArgs, ctx) {
//       try {
//         const task = await manager.launch({
//           description: args.description,
//           prompt: args.prompt,
//           agent: args.agent || DEFAULT_AGENT,
//           parentSessionID: ctx.sessionID,
//         });
//         return fmt.launched(task);
//       } catch (error) {
//         return fmt.error(
//           error instanceof Error ? error.message : String(error),
//         );
//       }
//     },
//   });
// }
//
// function createBackgroundOutput(
//   manager: BackgroundManager,
//   client: OpencodeClient,
// ): ToolDefinition {
//   return tool({
//     description: "Get output from background task.",
//     args: {
//       task_id: tool.schema.string().describe("Task ID"),
//       block: tool.schema
//         .boolean()
//         .optional()
//         .describe("Wait for completion (default: false)"),
//       timeout: tool.schema
//         .number()
//         .optional()
//         .describe("Max wait ms (default: 60000)"),
//     },
//     async execute(args: BackgroundOutputArgs) {
//       const task = manager.getTask(args.task_id);
//       if (!task) return fmt.error(`Task not found: ${args.task_id}`);
//
//       if (task.status === "completed")
//         return await formatTaskResult(task, client);
//       if (task.status === "error" || task.status === "cancelled")
//         return formatTaskStatus(task);
//       if (!args.block) return formatTaskStatus(task);
//
//       const timeoutMs = Math.min(args.timeout ?? 60000, 600000);
//       const startTime = Date.now();
//
//       while (Date.now() - startTime < timeoutMs) {
//         await delay(1000);
//         const t = manager.getTask(args.task_id);
//         if (!t) return fmt.error("Task deleted");
//         if (t.status === "completed") return await formatTaskResult(t, client);
//         if (t.status === "error" || t.status === "cancelled")
//           return formatTaskStatus(t);
//       }
//
//       return formatTaskStatus(manager.getTask(args.task_id)!);
//     },
//   });
// }
//
// function createBackgroundCancel(
//   manager: BackgroundManager,
//   client: OpencodeClient,
// ): ToolDefinition {
//   return tool({
//     description: "Cancel running background task(s).",
//     args: {
//       task_id: tool.schema.string().optional().describe("Task ID to cancel"),
//       all: tool.schema
//         .boolean()
//         .optional()
//         .describe("Cancel all running tasks"),
//     },
//     async execute(args: BackgroundCancelArgs, ctx) {
//       if (args.all) {
//         const tasks = manager
//           .getTasksByParent(ctx.sessionID)
//           .filter((t) => t.status === "running");
//         for (const task of tasks) {
//           client.session
//             .abort({ path: { id: task.sessionID } })
//             .catch(() => { });
//           task.status = "cancelled";
//           task.completedAt = new Date();
//         }
//         return fmt.cancelledMulti(tasks.length);
//       }
//
//       if (!args.task_id) return fmt.error("Provide task_id or all=true");
//
//       const task = manager.getTask(args.task_id);
//       if (!task) return fmt.error("Task not found");
//       if (task.status !== "running") return fmt.error("Task not running");
//
//       client.session.abort({ path: { id: task.sessionID } }).catch(() => { });
//       task.status = "cancelled";
//       task.completedAt = new Date();
//       return fmt.cancelled(task.id);
//     },
//   });
// }
//
// // =============================================================================
// // Plugin Export
// // =============================================================================
//
// export const BackgroundTaskPlugin: Plugin = async (ctx) => {
//   const manager = new BackgroundManager(ctx);
//
//   return {
//     event: async ({ event }) => {
//       await manager.handleEvent(event);
//     },
//     tool: {
//       background_task: createBackgroundTask(manager),
//       background_output: createBackgroundOutput(manager, ctx.client),
//       background_cancel: createBackgroundCancel(manager, ctx.client),
//     },
//   };
// };
