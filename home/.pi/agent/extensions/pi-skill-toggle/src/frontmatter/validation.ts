import { basename, dirname } from "node:path";
import type { FrontmatterDocument, SkillDiagnostic } from "../types.ts";

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

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
