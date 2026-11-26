// Query syntax for the session finder. Shared by the main thread and the index
// worker: no pi imports, erasable TypeScript only.
//
//   u:  user:              user messages
//   a:  llm:  assistant:   assistant text
//   t:  tool:              tool calls and results; t:bash limits to one tool
//   tc: call:              tool calls only (tc:edit)
//   tr: result:            tool results only (tr:bash)
//   cwd:<text>             session working directory contains <text> (all-sessions mode)
//   "two words"            one literal term
//
// Every other word is a term. A doc matches when it contains every term.
// Terms are case-insensitive unless they contain an uppercase letter (smart case).

import type { SessionDocKind } from "./extract.ts";

export interface SessionSearchQuery {
  terms: string[];
  /** Empty means every kind. */
  kinds: SessionDocKind[];
  /** Lowercased tool name filter for tool kinds. */
  tool?: string;
  /** Lowercased cwd substring filter. */
  cwd?: string;
}

const ALL_KINDS: SessionDocKind[] = ["user", "assistant", "toolCall", "toolResult"];

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"?|(\S+)/g;
  for (const match of input.matchAll(pattern)) {
    const token = match[1] ?? match[2];
    if (token) tokens.push(match[1] !== undefined ? `\u0000${token}` : token);
  }
  return tokens;
}

export function parseSessionSearchQuery(input: string): SessionSearchQuery {
  const query: SessionSearchQuery = { terms: [], kinds: [] };
  const kinds = new Set<SessionDocKind>();
  for (const token of tokenize(input)) {
    if (token.startsWith("\u0000")) {
      query.terms.push(token.slice(1));
      continue;
    }
    const filter = /^([a-z]+):(.*)$/i.exec(token);
    if (filter) {
      const key = filter[1]!.toLowerCase();
      const value = filter[2]!.toLowerCase();
      if (key === "u" || key === "user") { kinds.add("user"); continue; }
      if (key === "a" || key === "llm" || key === "assistant") { kinds.add("assistant"); continue; }
      if (key === "t" || key === "tool") {
        kinds.add("toolCall"); kinds.add("toolResult");
        if (value) query.tool = value;
        continue;
      }
      if (key === "tc" || key === "call") { kinds.add("toolCall"); if (value) query.tool = value; continue; }
      if (key === "tr" || key === "result") { kinds.add("toolResult"); if (value) query.tool = value; continue; }
      if (key === "cwd") { if (value) query.cwd = value; continue; }
    }
    query.terms.push(token);
  }
  query.kinds = kinds.size === 0 || kinds.size === ALL_KINDS.length ? [] : [...kinds];
  return query;
}

/** Kinds from the query, else the picker's role filter (Tab). */
export function effectiveKinds(query: SessionSearchQuery, roleFilter: SessionDocKind[]): SessionDocKind[] {
  return query.kinds.length > 0 ? query.kinds : roleFilter;
}

export function kindAllowed(kind: SessionDocKind, kinds: SessionDocKind[]): boolean {
  return kinds.length === 0 || kinds.includes(kind);
}

export function toolAllowed(tool: string | undefined, toolFilter: string | undefined): boolean {
  if (!toolFilter) return true;
  return (tool ?? "").toLowerCase().includes(toolFilter);
}

function isCaseSensitive(term: string): boolean {
  return term !== term.toLowerCase();
}

export type MatchRange = [start: number, end: number];

/**
 * Ranges of every term occurrence (up to `maxRanges`), or undefined when a term is missing.
 * An empty term list matches with no ranges.
 */
export function findTermRanges(text: string, terms: string[], maxRanges = 64): MatchRange[] | undefined {
  if (terms.length === 0) return [];
  const ranges: MatchRange[] = [];
  // One regex per term, so (possibly multi-MB) tool output is never copied to lowercase.
  for (const term of terms) {
    const pattern = new RegExp(escapeRegExp(term), isCaseSensitive(term) ? "g" : "gi");
    let match = pattern.exec(text);
    if (!match) return undefined;
    while (match && ranges.length < maxRanges) {
      ranges.push([match.index, match.index + match[0].length]);
      match = pattern.exec(text);
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cheap rejection on a raw JSONL line before parsing it. JSON escaping leaves
 * plain ASCII words intact, so a term made only of such characters must appear
 * in the raw line. Returns false only when the line certainly cannot match.
 */
export function rawLineMayMatch(rawLine: string, terms: string[]): boolean {
  for (const term of terms) {
    if (!/^[\x20-\x7e]+$/.test(term) || /["\\/]/.test(term)) continue;
    const pattern = new RegExp(escapeRegExp(term), isCaseSensitive(term) ? "" : "i");
    if (!pattern.test(rawLine)) return false;
  }
  return true;
}

/** Distinct lowercase trigrams of a term, for the detail=none trigram FTS index. */
export function termTrigrams(term: string): string[] {
  const lower = term.toLowerCase();
  const chars = Array.from(lower);
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= chars.length; i++) grams.add(chars.slice(i, i + 3).join(""));
  return [...grams];
}

/**
 * FTS5 MATCH expression AND-ing the trigrams of every term with 3+ characters,
 * or undefined when no term is long enough. Matches are a superset; callers
 * verify with findTermRanges.
 */
export function buildTrigramMatch(terms: string[], maxGramsPerTerm = 12): string | undefined {
  const parts: string[] = [];
  for (const term of terms) {
    let grams = termTrigrams(term);
    if (grams.length === 0) continue;
    if (grams.length > maxGramsPerTerm) {
      // Spread the sample over the term so long terms stay selective but cheap.
      const step = grams.length / maxGramsPerTerm;
      grams = Array.from({ length: maxGramsPerTerm }, (_, i) => grams[Math.floor(i * step)]!);
    }
    for (const gram of grams) parts.push(`"${gram.replaceAll('"', '""')}"`);
  }
  return parts.length > 0 ? [...new Set(parts)].join(" AND ") : undefined;
}

/** One-line snippet starting a little before the first match. Newlines become spaces. */
export function snippetAround(text: string, ranges: MatchRange[], maxChars = 400): { text: string; ranges: MatchRange[] } {
  const first = ranges[0];
  const lead = 24;
  let start = first ? Math.max(0, first[0] - lead) : 0;
  // Do not start inside a surrogate pair.
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start] ?? "")) start -= 1;
  const raw = text.slice(start, start + maxChars);
  const flat = raw.replace(/\s+/g, " ");
  if (ranges.length === 0) return { text: (start > 0 ? "…" : "") + flat, ranges: [] };
  // Map ranges through whitespace collapsing by re-searching in the flat text.
  const prefix = start > 0 ? "…" : "";
  const flatRanges: MatchRange[] = [];
  const lowerFlat = flat.toLowerCase();
  for (const [s, e] of ranges) {
    if (s < start || e > start + maxChars) continue;
    const needle = text.slice(s, e).replace(/\s+/g, " ").toLowerCase();
    let from = 0;
    let found = lowerFlat.indexOf(needle, from);
    while (found >= 0) {
      flatRanges.push([found + prefix.length, found + prefix.length + needle.length]);
      from = found + needle.length;
      found = lowerFlat.indexOf(needle, from);
    }
  }
  const unique = new Map(flatRanges.map((r) => [`${r[0]}:${r[1]}`, r] as const));
  return { text: prefix + flat, ranges: [...unique.values()].sort((a, b) => a[0] - b[0]) };
}
