import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { FileSystem } from "../ports/fs.ts";
import { DefaultSkillLocator } from "./skill-locator.ts";

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR;

describe("DefaultSkillLocator", () => {
  beforeEach(() => {
    process.env.HOME = "/home/tester";
    process.env.PI_CODING_AGENT_DIR = "/home/tester/.pi/agent";
  });

  afterEach(() => {
    restoreEnv("HOME", ORIGINAL_HOME);
    restoreEnv("PI_CODING_AGENT_DIR", ORIGINAL_PI_CODING_AGENT_DIR);
  });

  it("finds global, user, and project skills with Pi root markdown discovery rules", async () => {
    const fs = new MemoryTreeFileSystem([
      "/home/tester/.pi/agent/skills/user-root.md",
      "/home/tester/.agents/skills/ignored-global-root.md",
      "/home/tester/.agents/skills/global-skill/SKILL.md",
      "/repo/.pi/skills/project-root.md",
      "/repo/.agents/skills/ignored-project-legacy-root.md",
      "/repo/.agents/skills/project-legacy-skill/SKILL.md",
    ]);
    const locator = new DefaultSkillLocator(fs);

    const files = await locator.findSkillFiles("/repo");
    const byPath = new Map(files.map((file) => [file.filePath, file]));

    assert.equal(byPath.get("/home/tester/.pi/agent/skills/user-root.md")?.source.kind, "user");
    assert.equal(byPath.get("/home/tester/.agents/skills/global-skill/SKILL.md")?.source.kind, "global");
    assert.equal(byPath.get("/repo/.pi/skills/project-root.md")?.source.kind, "project");
    assert.equal(byPath.get("/repo/.agents/skills/project-legacy-skill/SKILL.md")?.source.kind, "project-legacy");
    assert.equal(byPath.has("/home/tester/.agents/skills/ignored-global-root.md"), false);
    assert.equal(byPath.has("/repo/.agents/skills/ignored-project-legacy-root.md"), false);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

class MemoryTreeFileSystem implements FileSystem {
  private readonly files = new Set<string>();
  private readonly dirs = new Set<string>(["/"]);

  constructor(paths: string[]) {
    for (const path of paths) this.addFile(path);
  }

  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) throw new Error(`missing file: ${path}`);
    return "---\nname: test\ndescription: Test skill.\n---\n";
  }

  async writeFileAtomic(): Promise<void> {}

  async access(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }>> {
    if (!this.dirs.has(path)) throw new Error(`missing dir: ${path}`);
    const prefix = path === "/" ? "/" : `${path}/`;
    const names = new Set<string>();
    for (const dir of this.dirs) {
      if (dir === path || !dir.startsWith(prefix)) continue;
      const rest = dir.slice(prefix.length);
      const [name] = rest.split("/");
      if (name) names.add(name);
    }
    for (const file of this.files) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const [name] = rest.split("/");
      if (name) names.add(name);
    }
    return [...names].sort().map((name) => {
      const fullPath = path === "/" ? `/${name}` : `${path}/${name}`;
      return {
        name,
        isDirectory: this.dirs.has(fullPath),
        isFile: this.files.has(fullPath),
        isSymbolicLink: false,
      };
    });
  }

  async stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; mode: number }> {
    return { isDirectory: this.dirs.has(path), isFile: this.files.has(path), mode: 0o644 };
  }

  private addFile(path: string): void {
    this.files.add(path);
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts.slice(0, -1)) {
      current += `/${part}`;
      this.dirs.add(current);
    }
  }
}
