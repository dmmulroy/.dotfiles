// Scroll pi's fullscreen transcript to a session entry.
//
// Pi has no public API for this (as of 1.6). This reaches into internals:
//   tui.layoutRoot (fullscreen renderer) → primary ScrollView (the transcript)
//   → document Container → chat Container → per-message components.
// Message components carry `messageId` (the entry id) when rendered from the
// session file; live ones may not, so assistant messages also match on their
// timestamp, user messages on their text, and tool components on toolCallId.
//
// Every step is duck-typed and checked. When anything is missing it reports
// "unsupported" and the caller falls back to the picker preview.

import type { TUI } from "@earendil-works/pi-tui";
import type { SessionDocKind } from "./extract.ts";

export interface RevealTarget {
  entryId: string;
  kind: SessionDocKind;
  toolCallId?: string;
  /** Message timestamp (ms), for live assistant components without messageId. */
  ts: number;
  /** User message text, for live user components without messageId. */
  userText?: string;
}

export type RevealResult = "revealed" | "not-fullscreen" | "unsupported" | "not-found";

type AnyComponent = {
  constructor?: { name?: string };
  children?: unknown;
  child?: unknown;
  entries?: unknown;
  render?: (width: number) => readonly string[];
  [key: string]: unknown;
};

interface ScrollViewLike extends AnyComponent {
  primary: boolean;
  child: AnyComponent;
  scrollTo(top: number, options?: { disableFollow?: boolean }): void;
  getContentWidth(width: number): number;
  viewportHeight: number;
}

function childrenOf(node: AnyComponent): AnyComponent[] {
  const out: AnyComponent[] = [];
  if (Array.isArray(node.children)) out.push(...(node.children as AnyComponent[]));
  if (node.child && typeof node.child === "object") out.push(node.child as AnyComponent);
  if (Array.isArray(node.entries)) {
    for (const entry of node.entries as Array<{ component?: AnyComponent }>) if (entry?.component) out.push(entry.component);
  }
  return [...new Set(out)];
}

function isScrollView(node: AnyComponent): node is ScrollViewLike {
  return (
    typeof node.scrollTo === "function" &&
    typeof node.getContentWidth === "function" &&
    node.primary === true &&
    typeof node.child === "object" &&
    node.child !== null
  );
}

function findTranscript(root: AnyComponent): ScrollViewLike | undefined {
  const stack = [root];
  const seen = new Set<AnyComponent>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (isScrollView(node)) return node;
    stack.push(...childrenOf(node));
  }
  return undefined;
}

function matchesTarget(node: AnyComponent, target: RevealTarget): boolean {
  if (node.messageId === target.entryId) return true;
  const name = node.constructor?.name ?? "";
  if ((target.kind === "toolCall" || target.kind === "toolResult") && target.toolCallId) {
    return node.toolCallId === target.toolCallId;
  }
  if (target.kind === "assistant" && name === "AssistantMessageComponent" && node.messageId === undefined) {
    const last = node.lastMessage as { timestamp?: number } | undefined;
    return last?.timestamp === target.ts;
  }
  if (target.kind === "user" && name === "UserMessageComponent" && node.messageId === undefined && target.userText) {
    return node.text === target.userText;
  }
  return false;
}

/**
 * Line offset of the target inside `node`, walking only plain Containers
 * (whose render is the concatenation of their children).
 */
function locate(node: AnyComponent, target: RevealTarget, width: number): number | undefined {
  if (!Array.isArray(node.children)) return undefined;
  let offset = 0;
  let found: number | undefined;
  for (const child of node.children as AnyComponent[]) {
    if (matchesTarget(child, target)) found = offset; // keep the last match: duplicates favour the newest
    else if (found === undefined && child.constructor?.name === "Container") {
      const inner = locate(child, target, width);
      if (inner !== undefined) found = offset + inner;
    }
    offset += child.render?.(width).length ?? 0;
  }
  return found;
}

export function revealSessionEntry(tui: TUI, target: RevealTarget): RevealResult {
  if (tui.mode !== "fullscreen") return "not-fullscreen";
  const root = (tui as unknown as { layoutRoot?: AnyComponent }).layoutRoot;
  if (!root) return "unsupported";
  const transcript = findTranscript(root);
  if (!transcript) return "unsupported";
  const document = transcript.child;
  if (document.constructor?.name !== "Container") return "unsupported";
  const width = transcript.getContentWidth(tui.terminal.columns);
  const offset = locate(document, target, width);
  if (offset === undefined) return "not-found";
  // Leave a line of context above the message.
  transcript.scrollTo(Math.max(0, offset - 1), { disableFollow: true });
  tui.requestRender();
  return "revealed";
}
