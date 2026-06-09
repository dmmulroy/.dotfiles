import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SimpleFrontmatterCodec } from "./parser.ts";
import { deriveSkillMetadata, getDuplicateFrontmatterKeys, hasDuplicateDisableModelInvocation } from "./validation.ts";

const codec = new SimpleFrontmatterCodec();

describe("frontmatter validation", () => {
  it("reports duplicate top-level frontmatter keys", () => {
    const doc = codec.parse([
      "---",
      "name: handoff",
      "description: Compact the conversation.",
      "disable-model-invocation: true",
      "argument-hint: What next?",
      "disable-model-invocation: true",
      "---",
      "",
    ].join("\n"));

    assert.deepEqual(getDuplicateFrontmatterKeys(doc), ["disable-model-invocation"]);
    assert.equal(hasDuplicateDisableModelInvocation(doc), true);
    assert.deepEqual(deriveSkillMetadata("/skills/handoff/SKILL.md", doc).diagnostics, [
      { severity: "warning", message: "Duplicate frontmatter key: disable-model-invocation" },
    ]);
  });
});
