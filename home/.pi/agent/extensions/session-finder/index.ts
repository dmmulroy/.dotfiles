// Session finder: Telescope-style fuzzy finder over pi sessions.
//
//   /find [query]       search the current session (every branch)
//   /find-all [query]   search every session on this device (SQLite trigram index)
//
// Enter on a result in the current session scrolls the fullscreen transcript to
// it (switching branch first, after confirmation, when it is on another branch).
// Enter on a result in another session asks before loading that session.

import fs from "node:fs";
import path from "node:path";
import { type ExtensionAPI, type ExtensionCommandContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { CurrentSessionSearch } from "./current-search.ts";
import { extractSessionDocParts, type RawSessionEntry } from "./extract.ts";
import { SessionIndexClient } from "./index-client.ts";
import type { SessionSearchHit } from "./index-store.ts";
import { SessionFinderPicker, type SessionFinderScope, type SessionFinderSelection } from "./picker.ts";
import { revealSessionEntry, type RevealTarget } from "./reveal.ts";

// One index worker per pi process. Pi replaces the extension instance on every
// session switch, so the client lives on globalThis rather than in this closure.
const CLIENT_KEY = Symbol.for("dmmulroy.pi.session-finder.client");
type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: SessionIndexClient };

function sessionIndexClient(): SessionIndexClient {
  const global = globalThis as GlobalWithClient;
  global[CLIENT_KEY] ??= new SessionIndexClient(
    path.join(getAgentDir(), "cache", "session-finder", "index.sqlite"),
    path.join(getAgentDir(), "sessions"),
  );
  return global[CLIENT_KEY];
}

async function disposeSessionIndexClient(): Promise<void> {
  const global = globalThis as GlobalWithClient;
  const client = global[CLIENT_KEY];
  delete global[CLIENT_KEY];
  await client?.dispose();
}

/** The interactive TUI. A proxy that follows renderer changes, so it stays valid across session switches. */
let interactiveTui: TUI | undefined;

function revealTargetFor(hit: SessionSearchHit, entry: RawSessionEntry | undefined): RevealTarget {
  const target: RevealTarget = { entryId: hit.entryId, kind: hit.kind, ts: hit.ts };
  if (hit.toolCallId) target.toolCallId = hit.toolCallId;
  if (hit.kind === "user" && entry) {
    const text = extractSessionDocParts(entry).find((part) => part.kind === "user")?.text;
    if (text) target.userText = text;
  }
  return target;
}

type TreeEntry = { id: string; parentId: string | null; timestamp: string };

/**
 * The newest leaf below an entry (or the entry itself when it has no children).
 * Switching branch to this leaf, rather than to the entry, keeps the entry and
 * the rest of its branch in the transcript. Navigating to a user message itself
 * would move its text back into the editor, as /tree does.
 */
function newestLeafUnder(entries: readonly TreeEntry[], entryId: string): string {
  const children = new Map<string, TreeEntry[]>();
  for (const entry of entries) {
    if (!entry.parentId) continue;
    const list = children.get(entry.parentId);
    if (list) list.push(entry);
    else children.set(entry.parentId, [entry]);
  }
  let best: TreeEntry | undefined;
  const stack = [entryId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const kids = children.get(id);
    if (!kids || kids.length === 0) {
      const leaf = entries.find((e) => e.id === id);
      if (leaf && (!best || leaf.timestamp > best.timestamp)) best = leaf;
      continue;
    }
    for (const kid of kids) stack.push(kid.id);
  }
  return best?.id ?? entryId;
}

/** Scroll the transcript once pi has re-rendered it. */
function revealSoon(ctx: Pick<ExtensionCommandContext, "ui">, target: RevealTarget): void {
  setTimeout(() => {
    const tui = interactiveTui;
    if (!tui) return;
    const result = revealSessionEntry(tui, target);
    if (result === "not-fullscreen") {
      ctx.ui.notify("Scrolling to a message needs fullscreen mode. Turn on fullscreen in /settings, or read it in the /find preview.", "info");
    } else if (result === "unsupported") {
      ctx.ui.notify("session-finder: this pi version's transcript layout is not supported; use the preview instead.", "warning");
    } else if (result === "not-found") {
      ctx.ui.notify("Could not find that message in the transcript (pi does not render it, or it is in the editor).", "info");
    }
  }, 50);
}

async function openInCurrentSession(ctx: ExtensionCommandContext, hit: SessionSearchHit): Promise<void> {
  const entry = ctx.sessionManager.getEntry(hit.entryId) as RawSessionEntry | undefined;
  const onBranch = ctx.sessionManager.getBranch().some((e) => e.id === hit.entryId);
  if (!onBranch) {
    const ok = await ctx.ui.confirm(
      "Switch branch?",
      "This message is on another branch of the session. Switch to the newest end of that branch (no summary)?",
    );
    if (!ok) return;
    if (!ctx.isIdle()) {
      ctx.ui.notify("Wait for the agent to finish before switching branch.", "warning");
      return;
    }
    const leafId = newestLeafUnder(ctx.sessionManager.getEntries() as unknown as TreeEntry[], hit.entryId);
    const result = await ctx.navigateTree(leafId, { summarize: false });
    if (result.cancelled) return;
  }
  revealSoon(ctx, revealTargetFor(hit, entry));
}

async function openInOtherSession(ctx: ExtensionCommandContext, hit: SessionSearchHit): Promise<void> {
  const title = hit.sessionTitle || path.basename(hit.sessionPath);
  const lines = [title, hit.cwd, "", "The current session stays saved."];
  // Pi has no cross-process lock: a session written to recently may be open in another pi.
  const modifiedMs = (() => {
    try {
      return fs.statSync(hit.sessionPath).mtimeMs;
    } catch {
      return 0;
    }
  })();
  const minutesAgo = (Date.now() - modifiedMs) / 60_000;
  if (modifiedMs && minutesAgo < 15) {
    lines.push(`Warning: changed ${minutesAgo < 1 ? "under a minute" : `${Math.round(minutesAgo)} min`} ago; it may be open in another pi window.`);
  }
  const ok = await ctx.ui.confirm("Load session?", lines.join("\n"));
  if (!ok) return;
  if (!ctx.isIdle()) {
    ctx.ui.notify("Wait for the agent to finish before switching session.", "warning");
    return;
  }
  // Only plain data crosses into withSession: the old ctx is stale after the switch.
  const entryId = hit.entryId;
  const hitData: SessionSearchHit = { ...hit };
  await ctx.switchSession(hit.sessionPath, {
    withSession: async (next) => {
      const entry = next.sessionManager.getEntry(entryId) as RawSessionEntry | undefined;
      const onBranch = next.sessionManager.getBranch().some((e) => e.id === entryId);
      if (!onBranch) {
        const switchBranch = await next.ui.confirm(
          "Switch branch?",
          "The message is on another branch of this session. Switch to the newest end of that branch (no summary)?",
        );
        if (!switchBranch) return;
        await next.navigateTree(newestLeafUnder(next.sessionManager.getEntries() as unknown as TreeEntry[], entryId), { summarize: false });
      }
      revealSoon(next, revealTargetFor(hitData, entry));
    },
  });
}

async function runFinder(ctx: ExtensionCommandContext, scope: SessionFinderScope, initialQuery: string): Promise<void> {
  if (!ctx.hasUI || ctx.mode !== "tui") {
    ctx.ui.notify("/find needs interactive mode", "error");
    return;
  }
  const index = sessionIndexClient();
  index.refresh();

  const sm = ctx.sessionManager;
  const sessionPath = sm.getSessionFile();
  const current = sessionPath
    ? new CurrentSessionSearch({
        sessionPath,
        sessionId: sm.getSessionId(),
        sessionTitle: sm.getSessionName() ?? "",
        cwd: sm.getCwd(),
        entries: sm.getEntries() as unknown as RawSessionEntry[],
        branchEntryIds: new Set(sm.getBranch().map((e) => e.id)),
      })
    : undefined;

  // `blocked` (pi >= 1.6) marks pi as waiting for input; the workspace types may predate it.
  const customOptions = {
    overlay: true,
    overlayOptions: { width: "94%", maxHeight: "92%", anchor: "center" },
    blocked: { kind: "question", message: "Find in sessions" },
  } as const;
  const selection = await ctx.ui.custom<SessionFinderSelection | undefined>(
    (tui, theme, keybindings, done) => {
      interactiveTui = tui;
      return new SessionFinderPicker({
        tui,
        theme,
        keybindings,
        scope,
        current,
        index,
        initialQuery,
        heightRatio: 0.85,
        done,
      });
    },
    customOptions,
  );
  if (!selection) return;

  if (selection.hit.sessionPath === sessionPath) await openInCurrentSession(ctx, selection.hit);
  else await openInOtherSession(ctx, selection.hit);
}

export default function sessionFinder(pi: ExtensionAPI): void {
  pi.registerCommand("find", {
    description: "Find messages in this session (Telescope-style). C-s switches to all sessions.",
    handler: async (args, ctx) => runFinder(ctx, "current", args.trim()),
  });

  pi.registerCommand("find-all", {
    description: "Find messages across every session on this device",
    handler: async (args, ctx) => runFinder(ctx, "all", args.trim()),
  });

  pi.on("session_start", (event) => {
    // Keep the index warm: after startup, index new session data in the background.
    if (event.reason !== "startup") return;
    const timer = setTimeout(() => sessionIndexClient().refresh(), 15_000);
    timer.unref();
  });

  pi.on("session_shutdown", async (event) => {
    // A reload loads new extension code; start a fresh worker with it.
    if (event.reason === "reload") await disposeSessionIndexClient();
  });
}
