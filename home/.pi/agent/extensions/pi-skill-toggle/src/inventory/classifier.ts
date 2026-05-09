import type { FrontmatterDocument, SkillInvocationMode } from "../types.ts";
import { getDisableModelInvocation } from "../frontmatter/validation.ts";

export function classifyInvocationMode(doc: FrontmatterDocument): SkillInvocationMode {
  return getDisableModelInvocation(doc) ? "manual-only" : "agent-invocable";
}

export function formatSourceKind(kind: string): string {
  switch (kind) {
    case "user":
      return "User";
    case "project":
      return "Project";
    case "project-legacy":
      return "Project legacy";
    default:
      return "Unknown";
  }
}
