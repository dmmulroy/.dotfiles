export type SkillInvocationMode = "agent-invocable" | "manual-only";

export type SkillSource =
  | { kind: "user"; root: string }
  | { kind: "project"; root: string }
  | { kind: "project-legacy"; root: string }
  | { kind: "unknown"; root: string };

export interface LocatedSkillFile {
  filePath: string;
  source: SkillSource;
  editable: boolean;
}

export type SkillDiagnosticSeverity = "info" | "warning" | "error";

export interface SkillDiagnostic {
  severity: SkillDiagnosticSeverity;
  message: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: SkillSource;
  editable: boolean;
  mode: SkillInvocationMode;
  diagnostics: SkillDiagnostic[];
}

export interface SkillDraft {
  skill: SkillRecord;
  desiredMode: SkillInvocationMode;
}

export interface FrontmatterDocument {
  raw: string;
  hasFrontmatter: boolean;
  frontmatterStart: number;
  frontmatterEnd: number;
  contentStart: number;
  frontmatterText: string;
  bodyText: string;
  fields: Record<string, unknown>;
  lineEnding: "\n" | "\r\n";
}

export interface FrontmatterPatch {
  oldText: string;
  newText: string;
}

export interface SkillChange {
  skill: SkillRecord;
  filePath: string;
  from: SkillInvocationMode;
  to: SkillInvocationMode;
  patch: FrontmatterPatch;
}

export interface ApplyResult {
  applied: SkillChange[];
  skipped: Array<{ skill: SkillRecord; reason: string }>;
  errors: Array<{ skill?: SkillRecord; message: string }>;
}

export interface SkillToggleUiResult {
  action: "apply" | "cancel";
  drafts: SkillDraft[];
}
