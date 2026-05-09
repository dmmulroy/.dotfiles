import type { SkillInvocationMode, SkillRecord } from "../types.ts";

export function modeLabel(mode: SkillInvocationMode): string {
  return mode === "manual-only" ? "Manual-only" : "Agent-invocable";
}

export function toggleMode(mode: SkillInvocationMode): SkillInvocationMode {
  return mode === "manual-only" ? "agent-invocable" : "manual-only";
}

export function skillSearchText(skill: SkillRecord): string {
  return [skill.name, skill.description, skill.filePath, skill.source.kind, modeLabel(skill.mode)].join(" ").toLowerCase();
}

export function filterSkills(skills: SkillRecord[], query: string): SkillRecord[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return skills;
  return skills.filter((skill) => {
    const haystack = skillSearchText(skill);
    return tokens.every((token) => haystack.includes(token));
  });
}
