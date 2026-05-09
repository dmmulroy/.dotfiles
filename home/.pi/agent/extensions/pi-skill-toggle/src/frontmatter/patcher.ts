import type { FrontmatterDocument, FrontmatterPatch, SkillInvocationMode } from "../types.ts";

const DISABLE_KEY = "disable-model-invocation";
const DISABLE_KEY_RE = /^\s*disable-model-invocation\s*:/;

export interface FrontmatterPatcher {
  patchInvocationMode(doc: FrontmatterDocument, desiredMode: SkillInvocationMode): FrontmatterPatch;
}

export class MinimalFrontmatterPatcher implements FrontmatterPatcher {
  patchInvocationMode(doc: FrontmatterDocument, desiredMode: SkillInvocationMode): FrontmatterPatch {
    if (!doc.hasFrontmatter) {
      const newFrontmatter = desiredMode === "manual-only" ? `${DISABLE_KEY}: true${doc.lineEnding}` : "";
      const newText = newFrontmatter
        ? `---${doc.lineEnding}${newFrontmatter}---${doc.lineEnding}${doc.raw}`
        : doc.raw;
      return { oldText: doc.raw, newText };
    }

    const newFrontmatter = desiredMode === "manual-only"
      ? ensureManualOnly(doc.frontmatterText, doc.lineEnding)
      : ensureAgentInvocable(doc.frontmatterText);

    const newText = doc.raw.slice(0, doc.frontmatterStart) + newFrontmatter + doc.raw.slice(doc.frontmatterEnd);
    return { oldText: doc.raw, newText };
  }
}

function ensureManualOnly(frontmatterText: string, lineEnding: "\n" | "\r\n"): string {
  const lines = splitLinesPreserve(frontmatterText, lineEnding);
  let replaced = false;
  const next: string[] = [];

  for (const line of lines) {
    if (DISABLE_KEY_RE.test(stripEol(line))) {
      if (!replaced) {
        next.push(`${DISABLE_KEY}: true${getEol(line) || lineEnding}`);
        replaced = true;
      }
      continue;
    }
    next.push(line);
  }

  if (!replaced) {
    if (next.length > 0 && !endsWithEol(next[next.length - 1]!)) {
      next[next.length - 1] = `${next[next.length - 1]}${lineEnding}`;
    }
    next.push(`${DISABLE_KEY}: true${lineEnding}`);
  }

  return next.join("");
}

function ensureAgentInvocable(frontmatterText: string): string {
  return splitLinesPreserve(frontmatterText, frontmatterText.includes("\r\n") ? "\r\n" : "\n")
    .filter((line) => !DISABLE_KEY_RE.test(stripEol(line)))
    .join("");
}

function splitLinesPreserve(text: string, fallbackEol: "\n" | "\r\n"): string[] {
  if (text.length === 0) return [];
  const lines = text.match(/.*(?:\r?\n|$)/g)?.filter((line) => line.length > 0) ?? [text];
  return lines.length > 0 ? lines : [fallbackEol];
}

function getEol(line: string): string {
  if (line.endsWith("\r\n")) return "\r\n";
  if (line.endsWith("\n")) return "\n";
  return "";
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, "");
}

function endsWithEol(line: string): boolean {
  return line.endsWith("\n");
}
