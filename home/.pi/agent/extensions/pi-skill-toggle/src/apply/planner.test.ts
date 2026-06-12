import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DefaultSkillTogglePlanner } from "./planner.ts";
import { SimpleFrontmatterCodec } from "../frontmatter/parser.ts";
import { MinimalFrontmatterPatcher } from "../frontmatter/patcher.ts";
import type { FileSystem } from "../ports/fs.ts";
import type { SkillRecord } from "../types.ts";

const codec = new SimpleFrontmatterCodec();
const patcher = new MinimalFrontmatterPatcher();

describe("DefaultSkillTogglePlanner", () => {
  it("plans a normalization change for duplicated disable-model-invocation keys even if the mode is unchanged", async () => {
    const filePath = "/skills/handoff/SKILL.md";
    const raw = [
      "---",
      "name: handoff",
      "description: Compact the conversation.",
      "disable-model-invocation: true",
      "argument-hint: What next?",
      "disable-model-invocation: true",
      "---",
      "",
      "# Handoff",
      "",
    ].join("\n");
    const fs = new MemoryFileSystem(new Map([[filePath, raw]]));
    const planner = new DefaultSkillTogglePlanner(fs, codec, patcher);
    const record = skillRecord(filePath, "manual-only");

    const changes = await planner.plan([record], [{ skill: record, desiredMode: "manual-only" }]);

    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.from, "manual-only");
    assert.equal(changes[0]?.to, "manual-only");
    assert.equal((changes[0]?.patch.newText.match(/^disable-model-invocation\s*:/gm) ?? []).length, 1);
  });
});

function skillRecord(filePath: string, mode: SkillRecord["mode"]): SkillRecord {
  return {
    id: filePath,
    name: "handoff",
    description: "Compact the conversation.",
    filePath,
    baseDir: "/skills/handoff",
    source: { kind: "user", root: "/skills" },
    editable: true,
    mode,
    diagnostics: [],
  };
}

class MemoryFileSystem implements FileSystem {
  constructor(private readonly files: Map<string, string>) {}

  async readFile(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`missing file: ${path}`);
    return value;
  }

  async writeFileAtomic(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async access(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readdir(): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }>> {
    return [];
  }

  async stat(): Promise<{ isDirectory: boolean; isFile: boolean; mode: number }> {
    return { isDirectory: false, isFile: true, mode: 0o644 };
  }
}
