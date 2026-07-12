import { createWriteStream } from "node:fs";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { pathToFileURL } from "node:url";

import type { RunUsage, SafeRunFailure } from "./domain.ts";
import type { WorkerRequestDto } from "./worker.ts";

const MAX_EVENT_LINE_BYTES = 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 1_000;
const TERMINATION_GRACE_MS = 1_000;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(value: unknown): WorkerRequestDto | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  const stringKeys = ["token", "runId", "jobId", "name", "cwd", "prompt", "provider", "modelId", "thinkingLevel", "piPath", "eventsPath", "heartbeatPath", "completionPath"] as const;
  if (!stringKeys.every((key) => typeof value[key] === "string")) return undefined;
  if (typeof value.scheduledFor !== "number" || typeof value.timeoutMs !== "number" || typeof value.deadlineAt !== "number" || !Array.isArray(value.tools) || !value.tools.every((tool) => typeof tool === "string")) return undefined;
  return {
    version: 1,
    token: String(value.token), runId: String(value.runId), jobId: String(value.jobId), name: String(value.name),
    scheduledFor: value.scheduledFor, cwd: String(value.cwd), prompt: String(value.prompt), timeoutMs: value.timeoutMs,
    deadlineAt: value.deadlineAt, tools: value.tools, provider: String(value.provider), modelId: String(value.modelId),
    thinkingLevel: String(value.thinkingLevel), piPath: String(value.piPath), eventsPath: String(value.eventsPath),
    heartbeatPath: String(value.heartbeatPath), completionPath: String(value.completionPath),
  };
}

/** Build the exact non-interactive Pi argument allowlist without a trust override or prompt. */
export function buildPiArguments(request: WorkerRequestDto): readonly string[] {
  return [
    "--mode", "json",
    "--no-session",
    "--provider", request.provider,
    "--model", request.modelId,
    "--thinking", request.thinkingLevel,
    "--tools", request.tools.join(","),
  ];
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

function usageFromMessage(message: Readonly<Record<string, unknown>>): RunUsage | undefined {
  const usage = message.usage;
  if (!isRecord(usage) || typeof usage.input !== "number" || typeof usage.output !== "number" || typeof usage.cacheRead !== "number" || typeof usage.cacheWrite !== "number" || !isRecord(usage.cost) || typeof usage.cost.total !== "number") return undefined;
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    costUsd: usage.cost.total,
  };
}

function classifyFailureText(input: string): SafeRunFailure["tag"] | undefined {
  const value = input.toLowerCase();
  if (value.includes("trust")) return "ProjectTrustRequired";
  if (value.includes("unauthorized") || value.includes("authentication") || value.includes("api key") || value.includes("credential") || value.includes("login")) return "AuthenticationUnavailable";
  if (value.includes("model") && (value.includes("not found") || value.includes("unavailable") || value.includes("unknown"))) return "ModelUnavailable";
  return undefined;
}

function classifyFailure(message: Readonly<Record<string, unknown>>): SafeRunFailure["tag"] | undefined {
  return typeof message.errorMessage === "string" ? classifyFailureText(message.errorMessage) : undefined;
}

function assistantText(message: Readonly<Record<string, unknown>>): string | undefined {
  if (!Array.isArray(message.content)) return undefined;
  const text = message.content
    .filter((item): item is Readonly<Record<string, unknown>> => isRecord(item) && item.type === "text" && typeof item.text === "string")
    .map((item) => String(item.text))
    .join("\n");
  return text.length > 0 ? text : undefined;
}

function terminateProcessGroup(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  const killer = setTimeout(() => {
    if (child.exitCode !== null || !child.pid) return;
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  }, TERMINATION_GRACE_MS);
  killer.unref();
}

/** Run one supervisor process from a persisted request file. */
export async function runWorkerSupervisor(requestPath: string): Promise<void> {
  const requestText = await readFile(requestPath, "utf8");
  let decoded: unknown;
  try { decoded = JSON.parse(requestText); }
  catch { throw new Error("Invalid worker request"); }
  const request = parseRequest(decoded);
  if (!request) throw new Error("Invalid worker request");

  let started = false;
  let cancelled = false;
  let timedOut = false;
  let child: ChildProcessWithoutNullStreams | undefined;
  let finalAssistantText: string | undefined;
  let usage: RunUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
  let invalidOutput = false;
  let classifiedFailure: SafeRunFailure["tag"] | undefined;

  await new Promise<void>((resolve, reject) => {
    const beforeStartDeadline = setTimeout(() => reject(new Error("Supervisor start acknowledgement timed out")), Math.max(0, request.deadlineAt - Date.now()));
    const rejectBeforeStart = () => {
      clearTimeout(beforeStartDeadline);
      reject(new Error("Supervisor start was rejected"));
    };
    const start = () => {
      if (started) return;
      started = true;
      clearTimeout(beforeStartDeadline);
      const eventStream = createWriteStream(request.eventsPath, { encoding: "utf8", mode: 0o600, flags: "a" });
      child = spawn(request.piPath, [...buildPiArguments(request)], {
        cwd: request.cwd,
        detached: true,
        env: { ...process.env, PI_SCHEDULER_WORKER: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderrBuffer = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        if (stderrBuffer.length < 16_384) stderrBuffer += chunk.slice(0, 16_384 - stderrBuffer.length);
      });
      child.stdin.end(request.prompt);
      void rm(requestPath, { force: true }).catch(() => undefined);
      let stdoutBuffer = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        if (!stdoutBuffer.includes("\n") && Buffer.byteLength(stdoutBuffer) > MAX_EVENT_LINE_BYTES) {
          invalidOutput = true;
          if (child) terminateProcessGroup(child);
          return;
        }
        while (true) {
          const newline = stdoutBuffer.indexOf("\n");
          if (newline < 0) break;
          const line = stdoutBuffer.slice(0, newline);
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          if (Buffer.byteLength(line) > MAX_EVENT_LINE_BYTES) { invalidOutput = true; continue; }
          eventStream.write(`${line}\n`);
          let event: unknown;
          try { event = JSON.parse(line); }
          catch { invalidOutput = true; continue; }
          if (!isRecord(event) || event.type !== "message_end" || !isRecord(event.message) || event.message.role !== "assistant") continue;
          finalAssistantText = assistantText(event.message) ?? finalAssistantText;
          const messageUsage = usageFromMessage(event.message);
          if (messageUsage) {
            usage = {
              inputTokens: usage.inputTokens + messageUsage.inputTokens,
              outputTokens: usage.outputTokens + messageUsage.outputTokens,
              cacheReadTokens: usage.cacheReadTokens + messageUsage.cacheReadTokens,
              cacheWriteTokens: usage.cacheWriteTokens + messageUsage.cacheWriteTokens,
              costUsd: usage.costUsd + messageUsage.costUsd,
            };
          }
          if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
            invalidOutput = true;
            classifiedFailure = classifyFailure(event.message) ?? classifiedFailure;
          }
        }
      });
      const heartbeat = setInterval(() => {
        void writeAtomic(request.heartbeatPath, { version: 1, token: request.token, pid: process.pid, at: Date.now() }).catch(() => undefined);
      }, HEARTBEAT_INTERVAL_MS);
      heartbeat.unref();
      const deadline = setTimeout(() => {
        timedOut = true;
        if (child) terminateProcessGroup(child);
      }, Math.max(0, request.deadlineAt - Date.now()));
      deadline.unref();
      child.once("error", reject);
      child.once("close", (code) => {
        clearInterval(heartbeat);
        classifiedFailure = classifiedFailure ?? classifyFailureText(stderrBuffer);
        clearTimeout(deadline);
        eventStream.end(() => {
          const exitCode = code ?? 1;
          const terminalStatus = timedOut ? "timedOut" : cancelled ? "cancelled" : exitCode === 0 && !invalidOutput && finalAssistantText !== undefined ? "succeeded" : "failed";
          void writeAtomic(request.completionPath, {
            version: 1,
            token: request.token,
            runId: request.runId,
            terminalStatus,
            exitCode,
            ...(finalAssistantText === undefined ? {} : { finalAssistantText }),
            usage,
            ...(classifiedFailure === undefined ? {} : { failureTag: classifiedFailure }),
            eventLogPath: request.eventsPath,
            finishedAt: Date.now(),
          }).then(resolve, reject);
        });
      });
    };
    process.on("message", (message: unknown) => {
      if (!isRecord(message) || message.token !== request.token || typeof message.type !== "string") return;
      if (message.type === "start") start();
      else if (message.type === "reject") rejectBeforeStart();
      else if (message.type === "cancel") {
        cancelled = true;
        if (child) terminateProcessGroup(child);
        else rejectBeforeStart();
      }
    });
    process.once("disconnect", () => {
      if (!started) rejectBeforeStart();
    });
    process.send?.({ type: "ready", token: request.token, pid: process.pid });
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const requestPath = process.argv[2];
  if (!requestPath) process.exitCode = 2;
  else runWorkerSupervisor(requestPath).then(
    () => { process.exitCode = 0; if (process.connected) process.disconnect(); },
    () => { process.exitCode = 1; if (process.connected) process.disconnect(); },
  );
}
