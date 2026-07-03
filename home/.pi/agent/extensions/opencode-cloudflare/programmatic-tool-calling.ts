const CONFIG_PATH = "options.programmatic_tool_calling.allowed_callers" as const;
const STATE_PREFIX = "opencode-cloudflare:openai-responses:v1:";

/** JSON value retained verbatim inside a persisted Responses item envelope. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Versioned opaque envelope stored in pi message signatures. */
export interface StoredResponsesItemV1 {
  readonly owner: "opencode-cloudflare";
  readonly protocol: "openai-responses";
  readonly version: 1;
  readonly kind: "output-item";
  readonly item: Readonly<Record<string, JsonValue>>;
}

type Result<T, E> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

/** Safe failure returned when an opaque Responses signature cannot be decoded. */
export class ProgramStateDecodeFailed extends Error {
  readonly _tag = "ProgramStateDecodeFailed" as const;
  readonly reason: "invalid-prefix" | "invalid-json" | "invalid-envelope";

  constructor(reason: "invalid-prefix" | "invalid-json" | "invalid-envelope") {
    super(`Persisted OpenAI Responses state is invalid: ${reason}`);
    this.name = "ProgramStateDecodeFailed";
    this.reason = reason;
  }
}

function isJsonValue(input: unknown): input is JsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean") return true;
  if (typeof input === "number") return Number.isFinite(input);
  if (Array.isArray(input)) return input.every(isJsonValue);
  if (typeof input !== "object") return false;
  return Object.values(input).every(isJsonValue);
}

function isJsonRecord(input: unknown): input is Readonly<Record<string, JsonValue>> {
  return input !== null && typeof input === "object" && !Array.isArray(input) && isJsonValue(input);
}

/** Encode a complete Responses output item for opaque pi session persistence. */
export function encodeStoredResponsesItem(item: Readonly<Record<string, JsonValue>>): string {
  const envelope: StoredResponsesItemV1 = {
    owner: "opencode-cloudflare",
    protocol: "openai-responses",
    version: 1,
    kind: "output-item",
    item,
  };
  return `${STATE_PREFIX}${JSON.stringify(envelope)}`;
}

/** Return whether a pi signature claims ownership by this Responses state codec. */
export function hasStoredResponsesItemPrefix(signature: unknown): boolean {
  return typeof signature === "string" && signature.startsWith(STATE_PREFIX);
}

/** Return whether a persisted assistant message belongs to the selected visible model. */
export function isSameLogicalVisibleModel(
  message: { readonly provider: string; readonly model: string },
  visibleModel: { readonly provider: string; readonly id: string },
): boolean {
  return message.provider === visibleModel.provider && message.model === visibleModel.id;
}

/** Decode and validate an opaque Responses output item from a pi message signature. */
export function decodeStoredResponsesItem(
  signature: unknown,
): Result<StoredResponsesItemV1, ProgramStateDecodeFailed> {
  if (typeof signature !== "string" || !signature.startsWith(STATE_PREFIX)) {
    return { _tag: "err", error: new ProgramStateDecodeFailed("invalid-prefix") };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(signature.slice(STATE_PREFIX.length));
  } catch {
    return { _tag: "err", error: new ProgramStateDecodeFailed("invalid-json") };
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { _tag: "err", error: new ProgramStateDecodeFailed("invalid-envelope") };
  }
  if (
    Reflect.get(decoded, "owner") !== "opencode-cloudflare"
    || Reflect.get(decoded, "protocol") !== "openai-responses"
    || Reflect.get(decoded, "version") !== 1
    || Reflect.get(decoded, "kind") !== "output-item"
  ) {
    return { _tag: "err", error: new ProgramStateDecodeFailed("invalid-envelope") };
  }
  const item = Reflect.get(decoded, "item");
  if (!isJsonRecord(item)) {
    return { _tag: "err", error: new ProgramStateDecodeFailed("invalid-envelope") };
  }

  return {
    _tag: "ok",
    value: {
      owner: "opencode-cloudflare",
      protocol: "openai-responses",
      version: 1,
      kind: "output-item",
      item,
    },
  };
}

/** Programmatic Tool Calling policy resolved from one model's overlay options. */
export type ProgrammaticToolCallingPolicy =
  | { readonly _tag: "Disabled" }
  | {
      readonly _tag: "Enabled";
      readonly allowedCallers:
        | readonly ["programmatic"]
        | readonly ["direct", "programmatic"];
    };

/** Safe startup diagnostic for an invalid Programmatic Tool Calling overlay option. */
export class InvalidProgrammaticToolCallingConfig extends Error {
  readonly _tag = "InvalidProgrammaticToolCallingConfig" as const;
  readonly path: typeof CONFIG_PATH;
  readonly reason: "missing-programmatic" | "invalid-caller" | "invalid-shape";

  constructor(
    path: typeof CONFIG_PATH,
    reason: "missing-programmatic" | "invalid-caller" | "invalid-shape",
  ) {
    super(`Invalid Programmatic Tool Calling configuration at ${path}: ${reason}`);
    this.name = "InvalidProgrammaticToolCallingConfig";
    this.path = path;
    this.reason = reason;
  }
}

/** Parse model options into a disabled or validated Programmatic Tool Calling policy. */
export function parseProgrammaticToolCallingPolicy(options: unknown): ProgrammaticToolCallingPolicy {
  if (options === undefined) {
    return { _tag: "Disabled" };
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return { _tag: "Disabled" };
  }

  const programmatic = Reflect.get(options, "programmatic_tool_calling");
  if (programmatic === undefined) {
    return { _tag: "Disabled" };
  }
  if (programmatic === null || typeof programmatic !== "object" || Array.isArray(programmatic)) {
    throw new InvalidProgrammaticToolCallingConfig(CONFIG_PATH, "invalid-shape");
  }

  const allowedCallers = Reflect.get(programmatic, "allowed_callers");
  if (!Array.isArray(allowedCallers) || allowedCallers.length === 0) {
    throw new InvalidProgrammaticToolCallingConfig(CONFIG_PATH, "invalid-shape");
  }
  if (allowedCallers.some((caller) => caller !== "direct" && caller !== "programmatic")) {
    throw new InvalidProgrammaticToolCallingConfig(CONFIG_PATH, "invalid-caller");
  }
  if (!allowedCallers.includes("programmatic")) {
    throw new InvalidProgrammaticToolCallingConfig(CONFIG_PATH, "missing-programmatic");
  }
  if (allowedCallers.length === 1 && allowedCallers[0] === "programmatic") {
    return { _tag: "Enabled", allowedCallers: ["programmatic"] };
  }
  if (allowedCallers.length === 2 && allowedCallers[0] === "direct" && allowedCallers[1] === "programmatic") {
    return { _tag: "Enabled", allowedCallers: ["direct", "programmatic"] };
  }

  throw new InvalidProgrammaticToolCallingConfig(CONFIG_PATH, "invalid-shape");
}
