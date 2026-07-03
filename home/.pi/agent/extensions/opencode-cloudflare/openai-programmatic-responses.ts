import {
  calculateCost,
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
  decodeStoredResponsesItem,
  encodeStoredResponsesItem,
  hasStoredResponsesItemPrefix,
  isSameLogicalVisibleModel,
  ProgramStateDecodeFailed,
  type JsonValue,
  type ProgrammaticToolCallingPolicy,
} from "./programmatic-tool-calling.ts";

type EnabledPolicy = Extract<ProgrammaticToolCallingPolicy, { readonly _tag: "Enabled" }>;

const MAX_INTERNAL_CONTINUATIONS_PER_TURN = 8;
const MAX_ID_LENGTH = 64;
const DEFAULT_MAX_RETRIES = 0;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type Result<T, E> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

// ---------------------------------------------------------------------------
// Public input contract
// ---------------------------------------------------------------------------

/** Input required by the opt-in OpenAI Responses adapter. */
export interface ProgrammaticResponsesInput {
  readonly visibleModel: Model<string>;
  readonly requestModel: Model<"openai-responses">;
  readonly context: Context;
  readonly options: SimpleStreamOptions;
  readonly policy: EnabledPolicy;
}

/** HTTP request emitted by the Responses adapter. */
export interface ResponsesHttpRequest {
  readonly url: string;
  readonly init: RequestInit;
}

// ---------------------------------------------------------------------------
// Typed failures
// ---------------------------------------------------------------------------

/** Safe transport failure that retains the unclassified cause without rendering it. */
export class ResponsesTransportFailed extends Error {
  readonly _tag = "ResponsesTransportFailed" as const;
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("OpenAI Responses transport failed");
    this.name = "ResponsesTransportFailed";
    this.cause = cause;
  }
}

/** Stable failure reasons for malformed or unsupported Responses protocol data. */
export type ResponsesProtocolFailureReason =
  | "invalid-status"
  | "invalid-usage"
  | "malformed-completion"
  | "malformed-event"
  | "malformed-function-arguments"
  | "malformed-function-call"
  | "malformed-message"
  | "malformed-message-content"
  | "malformed-output-item"
  | "malformed-persisted-function-call"
  | "malformed-program"
  | "malformed-program-caller"
  | "malformed-program-output"
  | "malformed-reasoning"
  | "malformed-sse"
  | "malformed-tool-call-id"
  | "malformed-tool-result-id"
  | "program-caller-mismatch"
  | "program-caller-missing"
  | "response-failed"
  | "unsupported-output-item";

/** Safe failure raised when a required Responses protocol shape is invalid. */
export class ResponsesProtocolFailed extends Error {
  readonly _tag = "ResponsesProtocolFailed" as const;
  readonly reason: ResponsesProtocolFailureReason;

  constructor(reason: ResponsesProtocolFailureReason, message: string) {
    super(message);
    this.name = "ResponsesProtocolFailed";
    this.reason = reason;
  }
}

/** Failure raised when a response requires too many provider-only continuation requests. */
export class ProgramContinuationLimitExceeded extends Error {
  readonly _tag = "ProgramContinuationLimitExceeded" as const;

  constructor() {
    super("OpenAI Responses program continuation limit exceeded");
    this.name = "ProgramContinuationLimitExceeded";
  }
}

/** Safe HTTP rejection that does not retain or render the unknown response body. */
export class ResponsesHttpRejected extends Error {
  readonly _tag = "ResponsesHttpRejected" as const;
  readonly status: number;
  readonly reason: "unauthorized" | "configuration" | "server" | "rejected";

  constructor(
    status: number,
    reason: "unauthorized" | "configuration" | "server" | "rejected",
  ) {
    const message = reason === "unauthorized"
      ? "OpenCode Cloudflare rejected the Access token. Run /login opencode.cloudflare.dev, or refresh OpenCode auth and run /opencode-cf-sync-auth."
      : reason === "configuration"
        ? "OpenCode Cloudflare is missing its upstream API configuration."
        : reason === "server"
          ? `OpenCode Cloudflare returned a server error (HTTP ${status}). Retry shortly; if it persists, run /opencode-cf-doctor.`
          : "OpenAI Responses request was rejected";
    super(message);
    this.name = "ResponsesHttpRejected";
    this.status = status;
    this.reason = reason;
  }
}

/** Failure raised when the API repeats a call id that has already been completed or emitted. */
export class DuplicateFunctionCall extends Error {
  readonly _tag = "DuplicateFunctionCall" as const;
  readonly callId: string;

  constructor(callId: string) {
    // SAFETY: callId is not interpolated into the message to prevent untrusted API values from reaching user-visible errors.
    super("OpenAI Responses function call was already completed");
    this.name = "DuplicateFunctionCall";
    this.callId = callId;
  }
}

// ---------------------------------------------------------------------------
// Transport seam
// ---------------------------------------------------------------------------

/** Intentional HTTP seam used by production fetch and recording test transports. */
export interface ResponsesTransport {
  open(request: ResponsesHttpRequest): Promise<Result<Response, ResponsesTransportFailed>>;
}

/** Create the production Responses transport backed by global fetch. */
export function createFetchResponsesTransport(): ResponsesTransport {
  return {
    async open(request) {
      try {
        return { _tag: "ok", value: await fetch(request.url, request.init) };
      } catch (cause: unknown) {
        return { _tag: "err", error: new ResponsesTransportFailed(cause) };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// JSON helpers (duplicated from programmatic-tool-calling.ts to keep modules independent)
// ---------------------------------------------------------------------------

function isJsonValue(input: unknown): input is JsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean") return true;
  if (typeof input === "number") return Number.isFinite(input);
  if (Array.isArray(input)) return input.every(isJsonValue);
  if (typeof input !== "object") return false;
  return Object.values(input).every(isJsonValue);
}

function isJsonRecord(input: unknown): input is Readonly<Record<string, JsonValue>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  return Object.values(input).every(isJsonValue);
}

// ---------------------------------------------------------------------------
// Program relationship tracker (F1)
// ---------------------------------------------------------------------------

/**
 * Tracks known program call_ids across persisted history and the current
 * response so caller references can be validated against real programs.
 */
type ProgramCaller = Readonly<Record<string, JsonValue>> | null | undefined;

interface ProgramRelationshipTracker {
  /** All program call_ids seen in persisted context or current response. */
  readonly knownProgramCallIds: ReadonlySet<string>;
  registerProgram(callId: string): void;
  validateCallerReference(caller: ProgramCaller): void;
  validateProgramOutputCallId(callId: string): void;
}

function createProgramRelationshipTracker(): ProgramRelationshipTracker {
  const knownProgramCallIds = new Set<string>();

  return {
    get knownProgramCallIds() {
      return knownProgramCallIds as ReadonlySet<string>;
    },

    registerProgram(callId: string): void {
      knownProgramCallIds.add(callId);
    },

    validateCallerReference(caller: ProgramCaller): void {
      if (caller === undefined || caller === null) return;
      const callerId = caller.caller_id;
      if (typeof callerId === "string" && !knownProgramCallIds.has(callerId)) {
        throw new ResponsesProtocolFailed(
          "program-caller-mismatch",
          "OpenAI Responses program caller references an unknown program",
        );
      }
    },

    validateProgramOutputCallId(callId: string): void {
      if (!knownProgramCallIds.has(callId)) {
        throw new ResponsesProtocolFailed(
          "program-caller-mismatch",
          "OpenAI Responses program output references an unknown program",
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Text signature parsing (F4)
// ---------------------------------------------------------------------------

interface ParsedTextSignature {
  readonly id: string;
  readonly phase?: "commentary" | "final_answer";
}

/** Parse a pi text block signature into its id and optional phase, clamping id length. */
function parseTextSignature(signature: string | undefined, fallbackIndex: number): ParsedTextSignature {
  if (signature === undefined) return { id: `msg_${fallbackIndex}` };
  if (hasStoredResponsesItemPrefix(signature)) {
    const decoded = decodeStoredResponsesItem(signature);
    const item = decoded._tag === "ok" ? decoded.value.item : undefined;
    if (item?.type === "message" && typeof item.id === "string") {
      const id = clampId(item.id);
      return item.phase === "commentary" || item.phase === "final_answer"
        ? { id, phase: item.phase }
        : { id };
    }
    return { id: `msg_${fallbackIndex}` };
  }
  if (!signature.startsWith("{")) return { id: clampId(signature) };
  try {
    const parsed: unknown = JSON.parse(signature);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const id = Reflect.get(parsed, "id");
      const phase = Reflect.get(parsed, "phase");
      if (Reflect.get(parsed, "v") === 1 && typeof id === "string") {
        const result: ParsedTextSignature = { id: clampId(id) };
        if (phase === "commentary" || phase === "final_answer") {
          return { ...result, phase };
        }
        return result;
      }
    }
  } catch {
    // A non-codec signature is treated as an opaque legacy item id.
  }
  return { id: clampId(signature) };
}

function clampId(id: string): string {
  if (id.length <= MAX_ID_LENGTH) return id;
  return id.slice(0, MAX_ID_LENGTH);
}

// ---------------------------------------------------------------------------
// Usage parsing (F6)
// ---------------------------------------------------------------------------

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  const parsed = readNonNegativeInteger(value);
  if (parsed === undefined) {
    throw new ResponsesProtocolFailed("invalid-usage", `OpenAI Responses usage field is invalid: ${field}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Reasoning clamping (F5)
// ---------------------------------------------------------------------------

const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;

/** Clamp a thinking level to the model's supported levels. Replicates pi-ai's clampThinkingLevel. */
function clampThinkingLevel(
  model: Model<string>,
  level: string,
): string {
  if (!model.reasoning) return "off";
  const map = model.thinkingLevelMap;
  // If the requested level is explicitly supported (not mapped to null), use it.
  if (map) {
    const mapped = map[level as keyof typeof map];
    if (mapped === null) {
      // This level is disabled for this model. Find the next higher supported level.
      const idx = THINKING_LEVELS.indexOf(level as typeof THINKING_LEVELS[number]);
      if (idx !== -1) {
        for (let i = idx + 1; i < THINKING_LEVELS.length; i++) {
          const candidate = THINKING_LEVELS[i];
          if (candidate !== undefined && map[candidate] !== null) return candidate;
        }
        // Fall back to lower levels.
        for (let i = idx - 1; i >= 0; i--) {
          const candidate = THINKING_LEVELS[i];
          if (candidate !== undefined && map[candidate] !== null) return candidate;
        }
      }
      return "medium";
    }
  }
  return level;
}

// ---------------------------------------------------------------------------
// Context conversion
// ---------------------------------------------------------------------------

function createOutput(input: ProgrammaticResponsesInput): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: input.requestModel.api,
    provider: input.visibleModel.provider,
    model: input.visibleModel.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

interface ConvertedContext {
  readonly input: Array<Readonly<Record<string, unknown>>>;
  readonly completedCallIds: ReadonlySet<string>;
  readonly tracker: ProgramRelationshipTracker;
}

function decodeOwnedItem(signature: unknown): Readonly<Record<string, JsonValue>> | undefined {
  if (!hasStoredResponsesItemPrefix(signature)) return undefined;
  const decoded = decodeStoredResponsesItem(signature);
  if (decoded._tag === "err") {
    throw decoded.error;
  }
  validateStoredOutputItem(decoded.value.item);
  return decoded.value.item;
}

function parseLegacyReasoningItem(signature: string): Readonly<Record<string, JsonValue>> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(signature);
  } catch {
    return undefined;
  }
  if (!isJsonRecord(parsed)) {
    return undefined;
  }
  return parsed;
}

function projectToolResultToText(message: Context["messages"][number] & { readonly role: "toolResult" }): string {
  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return text.length > 0 ? text : "(see attached image)";
}

/**
 * Flush synthetic function_call_output items for any pending function calls
 * that have not yet received a tool result. This handles branch/fork scenarios
 * where tool results were discarded. (F2)
 */
function flushPendingFunctionCalls(
  pendingCalls: Map<string, { readonly caller: ProgramCaller }>,
  messages: Array<Readonly<Record<string, unknown>>>,
  completedCallIds: Set<string>,
): void {
  for (const [callId, { caller }] of pendingCalls) {
    if (!completedCallIds.has(callId)) {
      messages.push({
        type: "function_call_output",
        call_id: callId,
        output: "No result provided",
        ...(caller === undefined ? {} : { caller }),
      });
      completedCallIds.add(callId);
    }
  }
  pendingCalls.clear();
}

function convertMessages(input: ProgrammaticResponsesInput): ConvertedContext {
  const messages: Array<Readonly<Record<string, unknown>>> = [];
  const functionCalls = new Map<string, Readonly<Record<string, JsonValue>>>();
  const completedCallIds = new Set<string>();
  const tracker = createProgramRelationshipTracker();
  // F2: Track pending function calls per assistant message for orphan detection.
  const pendingCalls = new Map<string, { readonly caller: ProgramCaller }>();

  if (input.context.systemPrompt) {
    messages.push({
      role: input.requestModel.reasoning ? "developer" : "system",
      content: input.context.systemPrompt,
    });
  }

  let messageIndex = 0;
  for (const message of input.context.messages) {
    if (message.role === "user") {
      // F2: Flush orphaned calls before a user message.
      flushPendingFunctionCalls(pendingCalls, messages, completedCallIds);

      if (typeof message.content === "string") {
        messages.push({ role: "user", content: [{ type: "input_text", text: message.content }] });
      } else {
        const content = message.content.map((part) => {
          if (part.type === "text") return { type: "input_text", text: part.text };
          if (!input.requestModel.input.includes("image")) {
            return { type: "input_text", text: "(image omitted: model does not support images)" };
          }
          return {
            type: "input_image",
            detail: "auto",
            image_url: `data:${part.mimeType};base64,${part.data}`,
          };
        });
        if (content.length > 0) {
          messages.push({ role: "user", content });
        }
      }
    } else if (message.role === "assistant") {
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        messageIndex += 1;
        continue;
      }
      // F2: Flush orphaned calls from a previous assistant message before processing the next.
      flushPendingFunctionCalls(pendingCalls, messages, completedCallIds);

      const sameLogicalModel = isSameLogicalVisibleModel(message, input.visibleModel);
      for (const block of message.content) {
        if (block.type === "thinking") {
          if (!sameLogicalModel) {
            if (!block.redacted && block.thinking.trim().length > 0) {
              messages.push({
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: block.thinking, annotations: [] }],
                status: "completed",
                id: `msg_${messageIndex}_thinking`,
              });
            }
            continue;
          }
          if (block.thinkingSignature === undefined) continue;
          const ownedItem = decodeOwnedItem(block.thinkingSignature);
          if (ownedItem !== undefined) {
            // F1: Register program call_ids from persisted state.
            if (ownedItem.type === "program" && typeof ownedItem.call_id === "string") {
              tracker.registerProgram(ownedItem.call_id);
            }
            messages.push(ownedItem);
            continue;
          }
          const legacyItem = parseLegacyReasoningItem(block.thinkingSignature);
          if (legacyItem !== undefined && legacyItem.type === "reasoning") {
            messages.push(legacyItem);
          }
        } else if (block.type === "text") {
          const ownedItem = sameLogicalModel ? decodeOwnedItem(block.textSignature) : undefined;
          if (ownedItem !== undefined) {
            if (ownedItem.type !== "message") {
              throw new ResponsesProtocolFailed(
                "malformed-message",
                "Persisted OpenAI Responses message item is malformed",
              );
            }
            messages.push(ownedItem);
            continue;
          }

          // F4: Parse standard text signatures with phase and clamp id length.
          const parsed = parseTextSignature(block.textSignature, messageIndex);
          messages.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: block.text, annotations: [] }],
            status: "completed",
            id: parsed.id,
            ...(parsed.phase ? { phase: parsed.phase } : {}),
          });
        } else if (block.type === "toolCall") {
          const ownedItem = sameLogicalModel ? decodeOwnedItem(block.thoughtSignature) : undefined;
          if (ownedItem !== undefined) {
            if (ownedItem.type !== "function_call" || typeof ownedItem.call_id !== "string") {
              throw new ResponsesProtocolFailed(
                "malformed-persisted-function-call",
                "Persisted OpenAI Responses function call is malformed",
              );
            }
            const caller = parseProgramCaller(ownedItem.caller);
            // F1: Validate caller reference against known programs.
            tracker.validateCallerReference(caller);
            messages.push(ownedItem);
            functionCalls.set(ownedItem.call_id, ownedItem);
            // F2: Track as pending until a tool result arrives.
            pendingCalls.set(ownedItem.call_id, { caller });
            continue;
          }
          const [callId, itemId] = block.id.split("|");
          if (!callId) {
            throw new ResponsesProtocolFailed("malformed-tool-call-id", "Persisted tool call id is malformed");
          }
          const functionCall: Readonly<Record<string, JsonValue>> = {
            type: "function_call",
            ...(itemId ? { id: itemId } : {}),
            call_id: callId,
            name: block.name,
            arguments: JSON.stringify(block.arguments),
          };
          messages.push(functionCall);
          functionCalls.set(callId, functionCall);
          // F2: Track as pending (no caller for non-owned items).
          pendingCalls.set(callId, { caller: undefined });
        }
      }
    } else {
      const [callId] = message.toolCallId.split("|");
      if (!callId) {
        throw new ResponsesProtocolFailed("malformed-tool-result-id", "Persisted tool result id is malformed");
      }
      const functionCall = functionCalls.get(callId);
      const caller = functionCall === undefined ? undefined : parseProgramCaller(functionCall.caller);
      messages.push({
        type: "function_call_output",
        call_id: callId,
        output: projectToolResultToText(message),
        ...(caller === undefined ? {} : { caller }),
      });
      completedCallIds.add(callId);
      // F2: Mark as completed so orphan flush skips it.
      pendingCalls.delete(callId);
    }
    messageIndex += 1;
  }

  // F2: Flush any remaining orphaned calls at the end of context.
  flushPendingFunctionCalls(pendingCalls, messages, completedCallIds);

  return { input: messages, completedCallIds, tracker };
}

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

function buildPayload(
  input: ProgrammaticResponsesInput,
  replayInput: ReadonlyArray<Readonly<Record<string, unknown>>>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: input.requestModel.id,
    input: replayInput,
    stream: true,
    store: false,
  };

  if (input.options.maxTokens !== undefined) {
    payload.max_output_tokens = input.options.maxTokens;
  }
  if (input.options.temperature !== undefined) {
    payload.temperature = input.options.temperature;
  }
  payload.tools = [
    ...(input.context.tools ?? []).map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
      allowed_callers: input.policy.allowedCallers,
    })),
    { type: "programmatic_tool_calling" },
  ];

  // Stateless reasoning requests must retain encrypted reasoning for replay.
  if (input.requestModel.reasoning) {
    payload.include = ["reasoning.encrypted_content"];
  }

  // F5: Clamp reasoning level through model's supported levels.
  if (input.requestModel.reasoning && input.options.reasoning) {
    const clamped = clampThinkingLevel(input.requestModel, input.options.reasoning);
    // SAFETY: clampThinkingLevel returns a value from THINKING_LEVELS or the input, which are valid ModelThinkingLevel keys.
    const effort = input.requestModel.thinkingLevelMap?.[clamped as keyof NonNullable<typeof input.requestModel.thinkingLevelMap>] ?? clamped;
    payload.reasoning = {
      effort,
      summary: "auto",
    };
  } else if (input.requestModel.reasoning && input.requestModel.thinkingLevelMap?.off !== null) {
    payload.reasoning = {
      effort: input.requestModel.thinkingLevelMap?.off ?? "none",
    };
  }

  // F5: Project prompt cache key from session ID.
  if (input.options.sessionId) {
    const raw = input.options.sessionId;
    payload.prompt_cache_key = raw.length <= MAX_ID_LENGTH ? raw : raw.slice(0, MAX_ID_LENGTH);
  }

  if (input.options.metadata !== undefined) {
    payload.metadata = input.options.metadata;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function responseHeadersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function parseHttpRejection(response: Response): Promise<ResponsesHttpRejected> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }
  const errorCode = body !== null && typeof body === "object" && !Array.isArray(body)
    ? Reflect.get(body, "error")
    : undefined;
  if (response.status === 401 || errorCode === "Unauthorized") {
    return new ResponsesHttpRejected(response.status, "unauthorized");
  }
  if (errorCode === "Configuration Error") {
    return new ResponsesHttpRejected(response.status, "configuration");
  }
  if (response.status >= 500) {
    return new ResponsesHttpRejected(response.status, "server");
  }
  return new ResponsesHttpRejected(response.status, "rejected");
}

// F5: Per-request signal that composes caller cancellation with a fresh timeout.
function createRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { readonly signal: AbortSignal | undefined; readonly cleanup: () => void } {
  if (timeoutMs === undefined) {
    return { signal: callerSignal, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(new Error("OpenAI Responses request timed out")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

function parseSseFrame(frame: string): unknown | undefined {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    throw new ResponsesProtocolFailed("malformed-sse", "OpenAI Responses SSE data is malformed");
  }
}

async function* parseSse(response: Response): AsyncGenerator<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ResponsesProtocolFailed("malformed-sse", "OpenAI Responses response body is empty");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r(?!$)/g, "\n");
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary === -1) break;
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseFrame(frame);
        if (event !== undefined) yield event;
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (buffer.trim().length > 0) {
      const event = parseSseFrame(buffer);
      if (event !== undefined) yield event;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed or aborted; releasing the lock is still required.
    }
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Output item parsing and validation
// ---------------------------------------------------------------------------

function parseOutputItem(event: unknown): Readonly<Record<string, JsonValue>> | undefined {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new ResponsesProtocolFailed("malformed-event", "OpenAI Responses stream event is malformed");
  }
  const eventType = Reflect.get(event, "type");
  if (eventType !== "response.output_item.added" && eventType !== "response.output_item.done") {
    return undefined;
  }
  const item = Reflect.get(event, "item");
  if (!isJsonRecord(item)) {
    throw new ResponsesProtocolFailed("malformed-output-item", "OpenAI Responses output item is malformed");
  }
  if (
    item.type !== "reasoning"
    && item.type !== "message"
    && item.type !== "function_call"
    && item.type !== "program"
    && item.type !== "program_output"
  ) {
    // F7: Do not interpolate the untrusted item type into the error message.
    throw new ResponsesProtocolFailed(
      "unsupported-output-item",
      "OpenAI Responses output item type is unsupported",
    );
  }
  if (eventType === "response.output_item.done") {
    validateStoredOutputItem(item);
    return item;
  }
  return undefined;
}

function validateStoredOutputItem(item: Readonly<Record<string, JsonValue>>): void {
  switch (item.type) {
    case "reasoning":
      if (typeof item.id !== "string") {
        throw new ResponsesProtocolFailed("malformed-reasoning", "OpenAI Responses reasoning item is malformed");
      }
      readReasoningText(item.summary);
      readReasoningText(item.content);
      return;
    case "program":
      if (
        typeof item.id !== "string"
        || typeof item.call_id !== "string"
        || typeof item.code !== "string"
        || typeof item.fingerprint !== "string"
      ) {
        throw new ResponsesProtocolFailed("malformed-program", "OpenAI Responses program item is malformed");
      }
      return;
    case "function_call":
      if (
        typeof item.id !== "string"
        || typeof item.call_id !== "string"
        || typeof item.name !== "string"
        || typeof item.arguments !== "string"
      ) {
        throw new ResponsesProtocolFailed("malformed-function-call", "OpenAI Responses function call item is malformed");
      }
      parseFunctionArguments(item.arguments);
      parseProgramCaller(item.caller);
      return;
    case "program_output":
      if (
        typeof item.id !== "string"
        || typeof item.call_id !== "string"
        || typeof item.result !== "string"
        || (item.status !== "completed" && item.status !== "incomplete")
      ) {
        throw new ResponsesProtocolFailed(
          "malformed-program-output",
          "OpenAI Responses program output item is malformed",
        );
      }
      return;
    case "message":
      if (typeof item.id !== "string" || item.role !== "assistant" || item.content === undefined) {
        throw new ResponsesProtocolFailed("malformed-message", "OpenAI Responses message item is malformed");
      }
      parseMessageText(item.content);
      return;
    default:
      // F7: Do not interpolate the untrusted item type.
      throw new ResponsesProtocolFailed(
        "unsupported-output-item",
        "OpenAI Responses output item type is unsupported",
      );
  }
}

function readReasoningText(parts: JsonValue | undefined): string {
  if (parts === undefined) return "";
  if (!Array.isArray(parts)) {
    throw new ResponsesProtocolFailed("malformed-reasoning", "OpenAI Responses reasoning item is malformed");
  }
  const text: string[] = [];
  for (const part of parts) {
    if (!isJsonRecord(part) || typeof part.text !== "string") {
      throw new ResponsesProtocolFailed("malformed-reasoning", "OpenAI Responses reasoning item is malformed");
    }
    text.push(part.text);
  }
  return text.join("\n\n");
}

// ---------------------------------------------------------------------------
// Output item projection
// ---------------------------------------------------------------------------

function projectReasoningItem(
  item: Readonly<Record<string, JsonValue>>,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
): boolean {
  if (item.type !== "reasoning") return false;
  if (typeof item.id !== "string") {
    throw new ResponsesProtocolFailed("malformed-reasoning", "OpenAI Responses reasoning item is malformed");
  }
  const thinking = readReasoningText(item.summary) || readReasoningText(item.content);
  output.content.push({
    type: "thinking",
    thinking,
    thinkingSignature: encodeStoredResponsesItem(item),
  });
  const contentIndex = output.content.length - 1;
  stream.push({ type: "thinking_start", contentIndex, partial: output });
  if (thinking.length > 0) {
    stream.push({ type: "thinking_delta", contentIndex, delta: thinking, partial: output });
  }
  stream.push({ type: "thinking_end", contentIndex, content: thinking, partial: output });
  return true;
}

function projectProgramItem(
  item: Readonly<Record<string, JsonValue>>,
  output: AssistantMessage,
  tracker: ProgramRelationshipTracker,
): boolean {
  if (item.type !== "program") return false;
  if (
    typeof item.id !== "string"
    || typeof item.call_id !== "string"
    || typeof item.code !== "string"
    || typeof item.fingerprint !== "string"
  ) {
    throw new ResponsesProtocolFailed("malformed-program", "OpenAI Responses program item is malformed");
  }
  // F1: Register the program so later function calls can reference it.
  tracker.registerProgram(item.call_id);
  output.content.push({
    type: "thinking",
    thinking: "",
    redacted: true,
    thinkingSignature: encodeStoredResponsesItem(item),
  });
  return true;
}

function parseFunctionArguments(value: string): Record<string, JsonValue> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ResponsesProtocolFailed(
      "malformed-function-arguments",
      "OpenAI Responses function arguments are malformed",
    );
  }
  if (!isJsonRecord(parsed)) {
    throw new ResponsesProtocolFailed(
      "malformed-function-arguments",
      "OpenAI Responses function arguments are malformed",
    );
  }
  return { ...parsed };
}

function parseProgramCaller(
  value: JsonValue | undefined,
): ProgramCaller {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isJsonRecord(value) || value.type !== "program" || typeof value.caller_id !== "string") {
    throw new ResponsesProtocolFailed("malformed-program-caller", "OpenAI Responses program caller is malformed");
  }
  return { ...value };
}

function projectFunctionCallItem(
  item: Readonly<Record<string, JsonValue>>,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  seenCallIds: Set<string>,
  programmaticOnly: boolean,
  tracker: ProgramRelationshipTracker,
): boolean {
  if (item.type !== "function_call") return false;
  if (
    typeof item.id !== "string"
    || typeof item.call_id !== "string"
    || typeof item.name !== "string"
    || typeof item.arguments !== "string"
  ) {
    throw new ResponsesProtocolFailed("malformed-function-call", "OpenAI Responses function call item is malformed");
  }
  if (seenCallIds.has(item.call_id)) {
    throw new DuplicateFunctionCall(item.call_id);
  }

  const caller = parseProgramCaller(item.caller);

  // F1: Use the policy discriminant, not the presence of programs in this response.
  // Under programmatic-only policy, every function call must have a caller.
  if (programmaticOnly && (caller === undefined || caller === null)) {
    throw new ResponsesProtocolFailed(
      "program-caller-missing",
      "OpenAI Responses program caller is missing",
    );
  }

  // F1: Validate that the caller references a known program.
  tracker.validateCallerReference(caller);

  const toolCall = {
    type: "toolCall" as const,
    id: `${item.call_id}|${item.id}`,
    name: item.name,
    arguments: parseFunctionArguments(item.arguments),
    thoughtSignature: encodeStoredResponsesItem(item),
  };
  seenCallIds.add(item.call_id);
  output.content.push(toolCall);
  const contentIndex = output.content.length - 1;
  stream.push({ type: "toolcall_start", contentIndex, partial: output });
  stream.push({ type: "toolcall_delta", contentIndex, delta: item.arguments, partial: output });
  stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: output });
  output.stopReason = "toolUse";
  return true;
}

function projectProgramOutputItem(
  item: Readonly<Record<string, JsonValue>>,
  output: AssistantMessage,
  tracker: ProgramRelationshipTracker,
): boolean {
  if (item.type !== "program_output") return false;
  if (
    typeof item.id !== "string"
    || typeof item.call_id !== "string"
    || typeof item.result !== "string"
    || (item.status !== "completed" && item.status !== "incomplete")
  ) {
    throw new ResponsesProtocolFailed("malformed-program-output", "OpenAI Responses program output item is malformed");
  }
  // F1: Validate that the program_output references a known program.
  tracker.validateProgramOutputCallId(item.call_id);
  output.content.push({
    type: "thinking",
    thinking: "",
    redacted: true,
    thinkingSignature: encodeStoredResponsesItem(item),
  });
  return true;
}

function parseMessageText(content: JsonValue): string {
  if (!Array.isArray(content)) {
    throw new ResponsesProtocolFailed("malformed-message", "OpenAI Responses message item is malformed");
  }
  let text = "";
  for (const part of content) {
    if (!isJsonRecord(part)) {
      throw new ResponsesProtocolFailed("malformed-message", "OpenAI Responses message item is malformed");
    }
    if (part.type === "output_text" && typeof part.text === "string") {
      text += part.text;
    } else if (part.type === "refusal" && typeof part.refusal === "string") {
      text += part.refusal;
    } else {
      throw new ResponsesProtocolFailed(
        "malformed-message-content",
        "OpenAI Responses message content is malformed",
      );
    }
  }
  return text;
}

function projectMessageItem(
  item: Readonly<Record<string, JsonValue>>,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
): boolean {
  if (item.type !== "message") return false;
  if (typeof item.id !== "string" || item.role !== "assistant" || item.content === undefined) {
    throw new ResponsesProtocolFailed("malformed-message", "OpenAI Responses message item is malformed");
  }
  const text = parseMessageText(item.content);
  const block = {
    type: "text" as const,
    text,
    textSignature: encodeStoredResponsesItem(item),
  };
  output.content.push(block);
  const contentIndex = output.content.length - 1;
  stream.push({ type: "text_start", contentIndex, partial: output });
  if (text.length > 0) {
    stream.push({ type: "text_delta", contentIndex, delta: text, partial: output });
  }
  stream.push({ type: "text_end", contentIndex, content: text, partial: output });
  return true;
}

function projectOutputItem(
  item: Readonly<Record<string, JsonValue>>,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  seenCallIds: Set<string>,
  programmaticOnly: boolean,
  tracker: ProgramRelationshipTracker,
): void {
  if (projectReasoningItem(item, output, stream)) return;
  if (projectProgramItem(item, output, tracker)) return;
  if (
    projectFunctionCallItem(
      item,
      output,
      stream,
      seenCallIds,
      programmaticOnly,
      tracker,
    )
  ) return;
  if (projectProgramOutputItem(item, output, tracker)) return;
  if (projectMessageItem(item, output, stream)) return;
  // F7: Do not interpolate the untrusted item type.
  throw new ResponsesProtocolFailed(
    "unsupported-output-item",
    "OpenAI Responses output item type is unsupported",
  );
}

// ---------------------------------------------------------------------------
// Response event processing
// ---------------------------------------------------------------------------

type ResponseTerminalStatus = "completed" | "incomplete";

function applyResponseEvent(
  event: unknown,
  output: AssistantMessage,
  model: Model<string>,
): ResponseTerminalStatus | undefined {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new ResponsesProtocolFailed("malformed-event", "OpenAI Responses stream event is malformed");
  }
  const eventType = Reflect.get(event, "type");
  if (eventType === "response.created") {
    const createdResponse = Reflect.get(event, "response");
    const createdId = createdResponse !== null && typeof createdResponse === "object" && !Array.isArray(createdResponse)
      ? Reflect.get(createdResponse, "id")
      : undefined;
    if (typeof createdId === "string") output.responseId = createdId;
    return undefined;
  }
  if (eventType === "error" || eventType === "response.failed") {
    // F7: Do not interpolate untrusted error codes into the message.
    throw new ResponsesProtocolFailed("response-failed", "OpenAI Responses request failed");
  }
  if (eventType !== "response.completed" && eventType !== "response.incomplete") return undefined;
  const response = Reflect.get(event, "response");
  if (response === null || typeof response !== "object" || Array.isArray(response)) {
    throw new ResponsesProtocolFailed("malformed-completion", "OpenAI Responses completion is malformed");
  }

  const responseId = Reflect.get(response, "id");
  if (typeof responseId === "string") {
    output.responseId = responseId;
  }

  // F6: Parse and validate usage with non-negative integer checks.
  const usage = Reflect.get(response, "usage");
  if (usage !== null && typeof usage === "object" && !Array.isArray(usage)) {
    const rawInput = requireNonNegativeInteger(Reflect.get(usage, "input_tokens"), "input_tokens");
    const outputTokens = requireNonNegativeInteger(Reflect.get(usage, "output_tokens"), "output_tokens");

    const details = Reflect.get(usage, "input_tokens_details");
    const cached = details !== null && typeof details === "object" && !Array.isArray(details)
      ? (readNonNegativeInteger(Reflect.get(details, "cached_tokens")) ?? 0)
      : 0;

    // Cached tokens should not exceed input tokens.
    const safeCached = Math.min(cached, rawInput);

    output.usage.input += Math.max(0, rawInput - safeCached);
    output.usage.output += outputTokens;
    output.usage.cacheRead += safeCached;

    const rawTotal = readNonNegativeInteger(Reflect.get(usage, "total_tokens"));
    output.usage.totalTokens += rawTotal ?? (rawInput + outputTokens);
    calculateCost(model, output.usage);
  }

  const status = Reflect.get(response, "status");
  if (status === "completed") {
    if (output.stopReason !== "toolUse") output.stopReason = "stop";
    return "completed";
  } else if (status === "incomplete") {
    output.stopReason = "length";
    return "incomplete";
  } else if (status === "failed" || status === "cancelled") {
    throw new ResponsesProtocolFailed("response-failed", "OpenAI Responses request failed");
  } else {
    throw new ResponsesProtocolFailed("invalid-status", "OpenAI Responses completion status is invalid");
  }
}

// ---------------------------------------------------------------------------
// Safe error rendering
// ---------------------------------------------------------------------------

function safeErrorMessage(error: unknown): string {
  if (
    error instanceof ResponsesTransportFailed
    || error instanceof ResponsesProtocolFailed
    || error instanceof ResponsesHttpRejected
    || error instanceof DuplicateFunctionCall
    || error instanceof ProgramContinuationLimitExceeded
    || error instanceof ProgramStateDecodeFailed
  ) {
    return error.message;
  }
  return "OpenAI Responses request failed";
}

// ---------------------------------------------------------------------------
// Pre-stream retry (F5)
// ---------------------------------------------------------------------------

async function openWithRetry(
  transport: ResponsesTransport,
  request: ResponsesHttpRequest,
  maxRetries: number,
  maxRetryDelayMs: number,
): Promise<Result<Response, ResponsesTransportFailed>> {
  let lastResult: Result<Response, ResponsesTransportFailed> | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await transport.open(request);
    lastResult = result;
    if (result._tag === "err") return result;
    const response = result.value;
    if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt >= maxRetries) return result;

    // Parse Retry-After header.
    const retryAfter = response.headers.get("retry-after");
    let delayMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
    if (retryAfter) {
      const parsed = Number(retryAfter);
      if (Number.isFinite(parsed) && parsed > 0) {
        delayMs = parsed * 1000;
      }
    }
    if (delayMs > maxRetryDelayMs && maxRetryDelayMs > 0) {
      // Server requested delay exceeds our cap; fail immediately.
      return result;
    }
    // Consume the body before retrying to prevent resource leaks.
    try { await response.text(); } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  // SAFETY: The loop always executes at least once (attempt=0), so lastResult is always set.
  return lastResult as Result<Response, ResponsesTransportFailed>;
}

// ---------------------------------------------------------------------------
// Main streamer
// ---------------------------------------------------------------------------

/** Create an OpenAI Programmatic Tool Calling streamer with an explicit HTTP transport. */
export function createProgrammaticOpenAIResponsesStreamer(
  transport: ResponsesTransport,
): (input: ProgrammaticResponsesInput) => AssistantMessageEventStream {
  return (input) => {
    const stream = createAssistantMessageEventStream();
    const output = createOutput(input);

    void (async () => {
      try {
        const converted = convertMessages(input);
        const replayInput: Array<Readonly<Record<string, unknown>>> = [...converted.input];
        const seenCallIds = new Set(converted.completedCallIds);
        const tracker = converted.tracker;
        const headers = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(input.requestModel.headers ?? {}),
          ...(input.options.headers ?? {}),
          Authorization: `Bearer ${input.options.apiKey ?? ""}`,
        };
        const maxRetries = input.options.maxRetries ?? DEFAULT_MAX_RETRIES;
        const maxRetryDelayMs = input.options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
        let internalContinuations = 0;
        let started = false;

        while (true) {
          // F5: Create a fresh timeout signal per request, not once for all continuations.
          const requestSignal = createRequestSignal(input.options.signal, input.options.timeoutMs);
          try {
            let payload: unknown = buildPayload(input, replayInput);
            const replacedPayload = await input.options.onPayload?.(payload, input.requestModel);
            if (replacedPayload !== undefined) {
              payload = replacedPayload;
            }
            if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
              throw new Error("OpenAI Responses payload hook returned an invalid payload");
            }
            const finalPayload = { ...payload, store: false };

            // F5: Pre-stream retry for retryable HTTP errors.
            const opened = await openWithRetry(transport, {
              url: `${input.requestModel.baseUrl.replace(/\/$/, "")}/responses`,
              init: {
                method: "POST",
                headers,
                body: JSON.stringify(finalPayload),
                signal: requestSignal.signal,
              },
            }, maxRetries, maxRetryDelayMs);
            if (opened._tag === "err") {
              throw opened.error;
            }

            const response = opened.value;
            await input.options.onResponse?.({
              status: response.status,
              headers: responseHeadersToRecord(response.headers),
            }, input.requestModel);
            if (!response.ok) {
              throw await parseHttpRejection(response);
            }
            if (!started) {
              started = true;
              stream.push({ type: "start", partial: output });
            }

            const responseItems: Array<Readonly<Record<string, JsonValue>>> = [];
            let hasFunctionCall = false;
            let hasFinalMessage = false;
            let terminalStatus: ResponseTerminalStatus | undefined;
            const programmaticOnly = input.policy.allowedCallers.length === 1;

            for await (const event of parseSse(response)) {
              const item = parseOutputItem(event);
              if (item !== undefined) {
                responseItems.push(item);
                hasFunctionCall ||= item.type === "function_call";
                hasFinalMessage ||= item.type === "message";
              }
              const eventTerminalStatus = applyResponseEvent(event, output, input.visibleModel);
              if (eventTerminalStatus !== undefined) {
                terminalStatus = eventTerminalStatus;
              }
            }

            if (terminalStatus === undefined) {
              throw new ResponsesProtocolFailed(
                "malformed-completion",
                "OpenAI Responses stream ended without a terminal response event",
              );
            }
            if (input.options.signal?.aborted) {
              throw new Error("OpenAI Responses request aborted");
            }

            // Do not expose executable program state or function calls from an
            // incomplete response. Pi executes any returned tool call regardless
            // of stop reason, while the Responses contract requires handling the
            // incomplete response before continuing client-owned work.
            const projectableItems = terminalStatus === "completed"
              ? responseItems
              : responseItems.filter((item) => item.type === "reasoning" || item.type === "message");
            for (const item of projectableItems) {
              projectOutputItem(
                item,
                output,
                stream,
                seenCallIds,
                programmaticOnly,
                tracker,
              );
            }

            // F3: Never continue internally or execute calls after truncation.
            if (terminalStatus === "incomplete") break;

            // Break out when we have function calls or a final message.
            if (hasFunctionCall || hasFinalMessage) break;

            // Internal continuation: response completed but produced no calls or message.
            if (internalContinuations >= MAX_INTERNAL_CONTINUATIONS_PER_TURN) {
              throw new ProgramContinuationLimitExceeded();
            }
            internalContinuations += 1;
            replayInput.push(...responseItems);
          } finally {
            requestSignal.cleanup();
          }
        }

        if (output.stopReason !== "stop" && output.stopReason !== "length" && output.stopReason !== "toolUse") {
          throw new Error("OpenAI Responses stream ended in an invalid state");
        }
        stream.push({ type: "done", reason: output.stopReason, message: output });
        stream.end();
      } catch (error: unknown) {
        output.stopReason = input.options.signal?.aborted ? "aborted" : "error";
        output.errorMessage = safeErrorMessage(error);
        stream.push({ type: "error", reason: output.stopReason, error: output });
        stream.end();
      }
    })();

    return stream;
  };
}

const streamWithFetch = createProgrammaticOpenAIResponsesStreamer(createFetchResponsesTransport());

/** Stream an opted-in OpenAI Responses request through hosted Programmatic Tool Calling. */
export function streamProgrammaticOpenAIResponses(
  input: ProgrammaticResponsesInput,
): AssistantMessageEventStream {
  return streamWithFetch(input);
}
