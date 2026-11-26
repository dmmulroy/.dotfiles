// Turns pi session entries into searchable docs. Shared by the main thread and
// the index worker, so it imports nothing from pi and uses only erasable
// TypeScript syntax (the worker runs under Node's native type stripping).

export type SessionDocKind = "user" | "assistant" | "toolCall" | "toolResult";

/** One searchable piece of an entry. An assistant entry yields a text part and one part per tool call. */
export interface SessionDocPart {
  /** 0 is the message text; 1..n are the assistant's tool calls in order. */
  part: number;
  kind: SessionDocKind;
  tool?: string;
  /** Tool call id, so the transcript reveal can find the tool component. */
  toolCallId?: string;
  text: string;
}

type ContentBlock = { type?: string; text?: string; name?: string; id?: string; arguments?: unknown };

interface RawMessage {
  role?: string;
  content?: unknown;
  toolName?: string;
  toolCallId?: string;
  command?: string;
  output?: string;
  timestamp?: number;
}

export interface RawSessionEntry {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: RawMessage;
}

function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const texts: string[] = [];
  for (const block of content as ContentBlock[]) {
    if (block && block.type === "text" && typeof block.text === "string") texts.push(block.text);
  }
  return texts.join("\n");
}

function formatArgumentValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Tool call as text: `name: <primary argument>` on the first line (the bash command,
 * the file path…), then the other arguments as `key: value`, strings unescaped.
 */
export function formatToolCall(name: string, args: unknown): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args === undefined ? name : `${name}: ${formatArgumentValue(args)}`;
  const record = args as Record<string, unknown>;
  const primaryKeys = ["command", "path", "file_path", "url", "query", "pattern", "code"];
  const primaryKey = primaryKeys.find((key) => typeof record[key] === "string");
  const lines = [primaryKey ? `${name}: ${record[primaryKey] as string}` : name];
  for (const [key, value] of Object.entries(record)) {
    if (key === primaryKey || value === undefined) continue;
    lines.push(`${key}: ${formatArgumentValue(value)}`);
  }
  return lines.join("\n");
}

/** Searchable parts of one session entry. Non-message entries and system messages yield nothing. */
export function extractSessionDocParts(entry: RawSessionEntry): SessionDocPart[] {
  if (entry.type !== "message" || !entry.message) return [];
  const message = entry.message;
  switch (message.role) {
    case "user": {
      const text = textOfContent(message.content);
      return text ? [{ part: 0, kind: "user", text }] : [];
    }
    case "assistant": {
      const parts: SessionDocPart[] = [];
      const text = textOfContent(message.content);
      if (text) parts.push({ part: 0, kind: "assistant", text });
      if (Array.isArray(message.content)) {
        let index = 0;
        for (const block of message.content as ContentBlock[]) {
          if (!block || block.type !== "toolCall") continue;
          index += 1;
          const name = typeof block.name === "string" ? block.name : "tool";
          const part: SessionDocPart = { part: index, kind: "toolCall", tool: name, text: formatToolCall(name, block.arguments) };
          if (typeof block.id === "string") part.toolCallId = block.id;
          parts.push(part);
        }
      }
      return parts;
    }
    case "toolResult": {
      const text = textOfContent(message.content);
      if (!text) return [];
      const part: SessionDocPart = { part: 0, kind: "toolResult", text };
      if (typeof message.toolName === "string") part.tool = message.toolName;
      if (typeof message.toolCallId === "string") part.toolCallId = message.toolCallId;
      return [part];
    }
    case "bashExecution": {
      // `!command` run by the user from the editor.
      const text = [message.command ?? "", message.output ?? ""].filter(Boolean).join("\n");
      return text ? [{ part: 0, kind: "toolResult", tool: "user-bash", text }] : [];
    }
    default:
      return [];
  }
}

/** Entry time in ms: the message timestamp, else the entry's ISO timestamp. */
export function sessionEntryTime(entry: RawSessionEntry): number {
  const messageTime = entry.message?.timestamp;
  if (typeof messageTime === "number") return messageTime;
  const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
