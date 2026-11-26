// In-memory search over the current session's entries (every branch). Small
// enough to rebuild on each open and filter on every keystroke.

import { fuzzyMatch } from "@earendil-works/pi-tui";
import { extractSessionDocParts, sessionEntryTime, type RawSessionEntry, type SessionDocKind } from "./extract.ts";
import type { SessionDocPreview, SessionSearchHit, SessionSearchResponse } from "./index-store.ts";
import { findTermRanges, kindAllowed, parseSessionSearchQuery, snippetAround, toolAllowed } from "./query.ts";

interface CurrentDoc {
  docId: number;
  entryId: string;
  part: number;
  kind: SessionDocKind;
  tool?: string;
  toolCallId?: string;
  ts: number;
  text: string;
  onBranch: boolean;
}

export interface CurrentSessionSource {
  sessionPath: string;
  sessionId: string;
  sessionTitle: string;
  cwd: string;
  entries: readonly RawSessionEntry[];
  branchEntryIds: ReadonlySet<string>;
}

export class CurrentSessionSearch {
  private readonly docs: CurrentDoc[] = [];

  private readonly source: CurrentSessionSource;

  constructor(source: CurrentSessionSource) {
    this.source = source;
    for (const entry of source.entries) {
      if (typeof entry.id !== "string") continue;
      const ts = sessionEntryTime(entry);
      for (const part of extractSessionDocParts(entry)) {
        const doc: CurrentDoc = {
          docId: this.docs.length,
          entryId: entry.id,
          part: part.part,
          kind: part.kind,
          ts,
          text: part.text,
          onBranch: source.branchEntryIds.has(entry.id),
        };
        if (part.tool) doc.tool = part.tool;
        if (part.toolCallId) doc.toolCallId = part.toolCallId;
        this.docs.push(doc);
      }
    }
  }

  get size(): number {
    return this.docs.length;
  }

  isOnBranch(entryId: string): boolean {
    return this.source.branchEntryIds.has(entryId);
  }

  private toHit(doc: CurrentDoc, ranges: Array<[number, number]>): SessionSearchHit {
    const snippet = snippetAround(doc.text, ranges);
    const hit: SessionSearchHit = {
      docId: doc.docId,
      sessionPath: this.source.sessionPath,
      sessionId: this.source.sessionId,
      sessionTitle: this.source.sessionTitle,
      cwd: this.source.cwd,
      entryId: doc.entryId,
      part: doc.part,
      kind: doc.kind,
      ts: doc.ts,
      snippet: snippet.text,
      snippetRanges: snippet.ranges,
    };
    if (doc.tool) hit.tool = doc.tool;
    if (doc.toolCallId) hit.toolCallId = doc.toolCallId;
    return hit;
  }

  search(input: string, roleFilter: SessionDocKind[], limit: number): SessionSearchResponse {
    const query = parseSessionSearchQuery(input);
    const kinds = query.kinds.length > 0 ? query.kinds : roleFilter;
    const candidates = this.docs.filter((doc) => kindAllowed(doc.kind, kinds) && toolAllowed(doc.tool, query.tool));

    const hits: SessionSearchHit[] = [];
    // Newest first: the end of the session is usually what you are looking for.
    for (let i = candidates.length - 1; i >= 0 && hits.length < limit; i--) {
      const doc = candidates[i]!;
      const ranges = findTermRanges(doc.text, query.terms);
      if (ranges) hits.push(this.toHit(doc, ranges));
    }
    if (hits.length > 0 || query.terms.length === 0) return { hits, candidates: candidates.length, truncated: hits.length >= limit };

    // No literal match: fall back to fuzzy matching on the start of each doc, Telescope style.
    const fuzzyInput = query.terms.join(" ");
    const scored: Array<{ doc: CurrentDoc; score: number }> = [];
    for (const doc of candidates) {
      const head = doc.text.slice(0, 300);
      const match = fuzzyMatch(fuzzyInput, head);
      if (match.matches) scored.push({ doc, score: match.score });
    }
    scored.sort((a, b) => a.score - b.score || b.doc.ts - a.doc.ts);
    return {
      hits: scored.slice(0, limit).map(({ doc }) => this.toHit(doc, [])),
      candidates: candidates.length,
      truncated: scored.length > limit,
    };
  }

  preview(docId: number, input: string): SessionDocPreview | undefined {
    const doc = this.docs[docId];
    if (!doc) return undefined;
    const terms = parseSessionSearchQuery(input).terms;
    const neighbour = (d: CurrentDoc | undefined) => (d ? { kind: d.kind, ...(d.tool ? { tool: d.tool } : {}), text: d.text } : undefined);
    return {
      text: doc.text,
      ranges: findTermRanges(doc.text, terms, 512) ?? [],
      before: [neighbour(this.docs[docId - 2]), neighbour(this.docs[docId - 1])].filter((n) => n !== undefined),
      after: [neighbour(this.docs[docId + 1]), neighbour(this.docs[docId + 2])].filter((n) => n !== undefined),
    };
  }
}
