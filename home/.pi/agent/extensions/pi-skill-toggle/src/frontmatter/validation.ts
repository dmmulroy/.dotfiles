import { basename, dirname } from "node:path";
import type { FrontmatterDocument, SkillDiagnostic } from "../types.ts";

const FRONTMATTER_KEY_RE = /^([A-Za-z0-9_-]+)\s*:/;

export function deriveSkillMetadata(filePath: string, doc: FrontmatterDocument): {
  name: string;
  description: string;
  diagnostics: SkillDiagnostic[];
} {
  const diagnostics: SkillDiagnostic[] = [];
  const parentDirName = basename(dirname(filePath));
  const name = stringField(doc.fields.name) || parentDirName;
  const description = stringField(doc.fields.description);

  if (!doc.hasFrontmatter) {
    diagnostics.push({ severity: "warning", message: "Missing YAML front matter" });
  }

  const duplicateKeys = getDuplicateFrontmatterKeys(doc);
  if (duplicateKeys.length > 0) {
    diagnostics.push({
      severity: "warning",
      message: `Duplicate frontmatter key${duplicateKeys.length === 1 ? "" : "s"}: ${duplicateKeys.join(", ")}`,
    });
  }

  if (!description) {
    diagnostics.push({ severity: "error", message: "Missing required description; Pi will not load this skill" });
  }
  if (name !== parentDirName && basename(filePath) === "SKILL.md") {
    diagnostics.push({ severity: "warning", message: `Name does not match parent directory (${parentDirName})` });
  }

  return { name, description: description || "", diagnostics };
}

export function getDisableModelInvocation(doc: FrontmatterDocument): boolean {
  return doc.fields["disable-model-invocation"] === true;
}

export function hasDuplicateDisableModelInvocation(doc: FrontmatterDocument): boolean {
  return (getTopLevelFrontmatterKeyCounts(doc).get("disable-model-invocation") ?? 0) > 1;
}

export function getDuplicateFrontmatterKeys(doc: FrontmatterDocument): string[] {
  return [...getTopLevelFrontmatterKeyCounts(doc)]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

function getTopLevelFrontmatterKeyCounts(doc: FrontmatterDocument): Map<string, number> {
  const counts = new Map<string, number>();
  if (!doc.hasFrontmatter) return counts;

  for (const rawLine of doc.frontmatterText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = FRONTMATTER_KEY_RE.exec(rawLine);
    if (!match?.[1]) continue;
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }

  return counts;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
