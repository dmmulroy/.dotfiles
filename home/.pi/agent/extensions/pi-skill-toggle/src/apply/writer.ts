import type { FileSystem } from "../ports/fs.ts";
import type { ApplyResult, SkillChange } from "../types.ts";

export interface SkillChangeWriter {
  apply(changes: SkillChange[]): Promise<ApplyResult>;
}

export class AtomicSkillChangeWriter implements SkillChangeWriter {
  constructor(private readonly fs: FileSystem) {}

  async apply(changes: SkillChange[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], errors: [] };

    for (const change of changes) {
      try {
        const current = await this.fs.readFile(change.filePath);
        if (current !== change.patch.oldText) {
          result.errors.push({
            skill: change.skill,
            message: `${change.skill.name}: file changed while dialog was open; skipped`,
          });
          continue;
        }
        await this.fs.writeFileAtomic(change.filePath, change.patch.newText);
        result.applied.push(change);
      } catch (error) {
        result.errors.push({
          skill: change.skill,
          message: `${change.skill.name}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return result;
  }
}
