import { constants } from "node:fs";
import { join } from "node:path";
import type { FileSystem } from "../ports/fs.ts";
import type { LocatedSkillFile, SkillSource } from "../types.ts";
import { getSkillRoots } from "./pi-paths.ts";

export interface SkillLocator {
  findSkillFiles(cwd: string): Promise<LocatedSkillFile[]>;
}

export class DefaultSkillLocator implements SkillLocator {
  constructor(private readonly fs: FileSystem) {}

  async findSkillFiles(cwd: string): Promise<LocatedSkillFile[]> {
    const roots = getSkillRoots(cwd);
    const files: LocatedSkillFile[] = [];
    const seen = new Set<string>();

    for (const root of roots) {
      if (!(await this.fs.access(root.path))) continue;
      const found = await this.scanSkillDir(root.path, root.path, root.source, root.includeRootMarkdownFiles);
      for (const file of found) {
        if (seen.has(file.filePath)) continue;
        seen.add(file.filePath);
        files.push(file);
      }
    }

    return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  private async scanSkillDir(
    dir: string,
    root: string,
    source: SkillSource,
    includeRootMarkdownFiles: boolean,
  ): Promise<LocatedSkillFile[]> {
    const out: LocatedSkillFile[] = [];
    let entries: Awaited<ReturnType<FileSystem["readdir"]>>;
    try {
      entries = await this.fs.readdir(dir);
    } catch {
      return out;
    }

    const skillEntry = entries.find((entry) => entry.name === "SKILL.md");
    if (skillEntry) {
      const filePath = join(dir, "SKILL.md");
      if (await this.isFile(filePath, skillEntry)) {
        out.push({ filePath, source, editable: await this.isWritable(filePath) });
      }
      return out;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = join(dir, entry.name);
      if (await this.isDirectory(fullPath, entry)) {
        out.push(...(await this.scanSkillDir(fullPath, root, source, false)));
        continue;
      }

      if (includeRootMarkdownFiles && entry.name.endsWith(".md") && (await this.isFile(fullPath, entry))) {
        out.push({ filePath: fullPath, source, editable: await this.isWritable(fullPath) });
      }
    }

    return out;
  }

  private async isDirectory(path: string, entry: { isDirectory: boolean; isSymbolicLink: boolean }): Promise<boolean> {
    if (entry.isDirectory) return true;
    if (!entry.isSymbolicLink) return false;
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  private async isFile(path: string, entry: { isFile: boolean; isSymbolicLink: boolean }): Promise<boolean> {
    if (entry.isFile) return true;
    if (!entry.isSymbolicLink) return false;
    try {
      return (await this.fs.stat(path)).isFile;
    } catch {
      return false;
    }
  }

  private async isWritable(path: string): Promise<boolean> {
    return this.fs.access(path, constants.R_OK | constants.W_OK);
  }
}
